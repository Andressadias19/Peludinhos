const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const jwt = require('jsonwebtoken');
const pool = require('../server/config/database');

const uploads = path.join(__dirname, '..', 'server', 'uploads');
const tag = randomUUID().slice(0, 8);
let server, base;
const users = {};

const call = (user, url, options = {}) => fetch(base + url, { ...options, headers: { ...(user ? { Authorization: `Bearer ${user.token}` } : {}), ...options.headers } });
const json = body => ({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const post = (url, body, user = users.admin) => call(user, `/api/admin/validacoes${url}`, { method: 'POST', ...json(body) });
const get = async url => (await call(users.admin, `/api/admin/validacoes${url}`)).json();
function form(fields) {
    const body = new FormData();
    for (const [key, value] of Object.entries(fields)) body.append(key, value);
    return body;
}
const animalRow = async id => (await pool.query('SELECT * FROM animal WHERE id_animal = $1', [id])).rows[0];
const requestRow = async id => (await pool.query('SELECT * FROM solicitacao_associacao_avistamento WHERE id_solicitacao = $1', [id])).rows[0];
const sightingRow = async id => (await pool.query('SELECT * FROM avistamento WHERE id_avistamento = $1', [id])).rows[0];
const summary = async () => (await (await call(users.admin, '/api/admin/resumo')).json()).resumo;
const version = async id => (await get(`/animais/${id}`)).animal.versao;
async function createAnimal(fields = {}) {
    const response = await call(users.dono, '/api/animais', { method: 'POST', body: form({ nome: `Validar ${tag}`, especie: 'Gato', cor: 'Branco', ...fields }) });
    assert.equal(response.status, 201);
    return (await response.json()).animal;
}
// Pedidos de associação só são aceitos para animais validados; a validação é simulada no banco.
async function createRequest(animal) {
    await pool.query(`UPDATE animal SET status_validacao = 'Validado' WHERE id_animal = $1`, [animal.id_animal]);
    const sighting = await call(users.relator, '/api/avistamentos', { method: 'POST', body: form({ especie: 'Gato', cor: 'Branco e cinza', latitude: '-2.44', longitude: '-54.70', observacao: `Relato ${tag}` }) });
    const avistamento = (await sighting.json()).avistamento;
    const response = await call(users.relator, `/api/avistamentos/${avistamento.id_avistamento}/solicitacoes-associacao`, {
        method: 'POST', ...json({ id_animal: String(animal.id_animal), justificativa: 'Mesma pelagem branca e mesma região do cadastro.' }) });
    assert.equal(response.status, 201);
    return { avistamento, solicitacao: (await response.json()).solicitacao };
}
const recent = date => Math.abs(Date.now() - new Date(date).getTime()) < 60_000;

before(async () => {
    const socket = net.createServer();
    await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
    const port = socket.address().port;
    await new Promise(resolve => socket.close(resolve));
    base = `http://127.0.0.1:${port}`;
    server = spawn(process.execPath, ['server/server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: String(port) }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Servidor não iniciou.')), 15000);
        server.stdout.on('data', chunk => { if (String(chunk).includes('Servidor rodando')) { clearTimeout(timeout); resolve(); } });
        server.on('error', error => { clearTimeout(timeout); reject(error); });
        server.on('exit', code => { clearTimeout(timeout); reject(new Error(`Servidor encerrou: ${code}`)); });
    });
    for (const [key, tipo] of [['admin', 'administrador'], ['dono', 'usuario'], ['relator', 'usuario']]) {
        const result = await pool.query(`INSERT INTO usuario (nome,email,senha_hash,tipo_usuario) VALUES ($1,$2,$3,$4) RETURNING id_usuario`,
            [`Teste ${key} ${tag}`, `${randomUUID()}@example.invalid`, 'conta-apenas-para-teste', tipo]);
        const id = result.rows[0].id_usuario;
        users[key] = { id, token: jwt.sign({ id_usuario: id, tipo_usuario: tipo }, process.env.JWT_SECRET, { expiresIn: '10m' }) };
    }
});

after(async () => {
    const ids = Object.values(users).map(user => user.id);
    if (ids.length) {
        const photos = await pool.query('SELECT foto FROM avistamento WHERE id_usuario_autor = ANY($1::bigint[]) UNION SELECT foto FROM animal WHERE id_usuario_cadastrador = ANY($1::bigint[])', [ids]);
        await pool.query('DELETE FROM solicitacao_associacao_avistamento WHERE id_usuario_solicitante = ANY($1::bigint[])', [ids]);
        await pool.query('DELETE FROM avistamento WHERE id_usuario_autor = ANY($1::bigint[])', [ids]);
        await pool.query('DELETE FROM animal WHERE id_usuario_cadastrador = ANY($1::bigint[])', [ids]);
        await pool.query('DELETE FROM usuario WHERE id_usuario = ANY($1::bigint[])', [ids]);
        for (const { foto } of photos.rows) if (foto) await fs.unlink(path.join(uploads, path.basename(foto))).catch(() => {});
    }
    server?.kill();
    await pool.end();
});

test('rotas de validação exigem token e conta administradora', async () => {
    const animal = await createAnimal();
    const { solicitacao } = await createRequest(await createAnimal());
    const routes = [['GET', '/animais'], ['GET', `/animais/${animal.id_animal}`], ['POST', `/animais/${animal.id_animal}/aprovar`], ['POST', `/animais/${animal.id_animal}/recusar`],
        ['GET', '/associacoes'], ['GET', `/associacoes/${solicitacao.id_solicitacao}`], ['POST', `/associacoes/${solicitacao.id_solicitacao}/aprovar`], ['POST', `/associacoes/${solicitacao.id_solicitacao}/recusar`]];
    for (const [method, url] of routes) {
        const options = { method, ...(method === 'POST' ? json({ observacao: 'Tentativa', versao: '' }) : {}) };
        assert.equal((await call(null, '/api/admin/validacoes' + url, options)).status, 401);
        assert.equal((await call(users.dono, '/api/admin/validacoes' + url, options)).status, 403);
    }
    assert.equal((await animalRow(animal.id_animal)).status_validacao, 'Pendente');
    assert.equal((await requestRow(solicitacao.id_solicitacao)).status_solicitacao, 'PENDENTE');
});

test('aprova animal registrando administrador, data e observação opcional, e atualiza os contadores', async () => {
    const animal = await createAnimal();
    const before = await summary();
    const response = await post(`/animais/${animal.id_animal}/aprovar`, { versao: await version(animal.id_animal), observacao: '  Fotos conferidas  ' });
    assert.equal(response.status, 200);
    const saved = await animalRow(animal.id_animal);
    assert.equal(saved.status_validacao, 'Validado');
    assert.equal(String(saved.id_usuario_validador), String(users.admin.id));
    assert.ok(recent(saved.data_validacao));
    assert.equal(saved.observacao_validacao, 'Fotos conferidas');
    const afterSummary = await summary();
    assert.equal(afterSummary.animais.pendentes, before.animais.pendentes - 1);
    assert.equal(afterSummary.animais.validados, before.animais.validados + 1);
    const other = await createAnimal();
    assert.equal((await post(`/animais/${other.id_animal}/aprovar`, { versao: await version(other.id_animal) })).status, 200);
    assert.equal((await animalRow(other.id_animal)).observacao_validacao, null);
});

test('recusa exige justificativa e registra a decisão; decisões repetidas são recusadas', async () => {
    const animal = await createAnimal();
    const versao = await version(animal.id_animal);
    for (const observacao of [undefined, '', '   ', 42, 'x'.repeat(1001), 'a\0b']) {
        assert.equal((await post(`/animais/${animal.id_animal}/recusar`, { versao, observacao })).status, 400);
    }
    assert.equal((await animalRow(animal.id_animal)).status_validacao, 'Pendente');
    assert.equal((await post(`/animais/${animal.id_animal}/recusar`, { versao, observacao: 'Foto não mostra o animal.' })).status, 200);
    const saved = await animalRow(animal.id_animal);
    assert.equal(saved.status_validacao, 'Recusado');
    assert.equal(String(saved.id_usuario_validador), String(users.admin.id));
    assert.ok(recent(saved.data_validacao));
    assert.equal(saved.observacao_validacao, 'Foto não mostra o animal.');
    for (const action of ['aprovar', 'recusar']) {
        assert.equal((await post(`/animais/${animal.id_animal}/${action}`, { versao: await version(animal.id_animal), observacao: 'De novo' })).status, 409);
    }
    assert.equal((await animalRow(animal.id_animal)).observacao_validacao, 'Foto não mostra o animal.');
    assert.equal((await post(`/animais/${animal.id_animal}/aprovar`, {})).status, 400);
    assert.equal((await post('/animais/999999999999/aprovar', { versao: '' })).status, 404);
    assert.equal((await post('/animais/abc/aprovar', { versao: '' })).status, 400);
});

test('não decide sobre uma versão do cadastro que o dono alterou depois', async () => {
    const animal = await createAnimal();
    const seen = await version(animal.id_animal);
    const edit = await call(users.dono, `/api/animais/${animal.id_animal}`, { method: 'PUT', body: form({ nome: `Validar ${tag}`, especie: 'Gato', cor: 'Preto' }) });
    assert.equal(edit.status, 200);
    assert.equal((await post(`/animais/${animal.id_animal}/aprovar`, { versao: seen })).status, 409);
    assert.equal((await animalRow(animal.id_animal)).status_validacao, 'Pendente');
    assert.equal((await post(`/animais/${animal.id_animal}/aprovar`, { versao: await version(animal.id_animal) })).status, 200);
});

test('decisões simultâneas sobre o mesmo animal: só uma é registrada', async () => {
    const animal = await createAnimal();
    const versao = await version(animal.id_animal);
    const responses = await Promise.all([
        post(`/animais/${animal.id_animal}/aprovar`, { versao }), post(`/animais/${animal.id_animal}/aprovar`, { versao }),
        post(`/animais/${animal.id_animal}/recusar`, { versao, observacao: 'Recusa concorrente' }),
    ]);
    const statuses = responses.map(response => response.status).sort();
    assert.deepEqual(statuses, [200, 409, 409]);
    const saved = await animalRow(animal.id_animal);
    assert.ok(['Validado', 'Recusado'].includes(saved.status_validacao));
    assert.equal(saved.observacao_validacao, saved.status_validacao === 'Recusado' ? 'Recusa concorrente' : null);
});

test('edição do dono depois da decisão volta para Pendente e limpa toda a validação anterior', async () => {
    for (const [action, body] of [['aprovar', { observacao: 'Ok' }], ['recusar', { observacao: 'Corrija a cor.' }]]) {
        const animal = await createAnimal();
        assert.equal((await post(`/animais/${animal.id_animal}/${action}`, { versao: await version(animal.id_animal), ...body })).status, 200);
        const edit = await call(users.dono, `/api/animais/${animal.id_animal}`, { method: 'PUT', body: form({ nome: `Validar ${tag}`, especie: 'Gato', cor: 'Cinza' }) });
        assert.equal(edit.status, 200);
        const saved = await animalRow(animal.id_animal);
        assert.equal(saved.status_validacao, 'Pendente');
        assert.equal(saved.id_usuario_validador, null);
        assert.equal(saved.data_validacao, null);
        assert.equal(saved.observacao_validacao, null);
    }
});

test('lista validações de animais com busca, filtro, contagens e versão', async () => {
    const animal = await createAnimal({ nome: `Lista${tag}` });
    const list = await get(`/animais?q=Lista${tag}&status=Pendente`);
    assert.equal(list.total, 1);
    assert.equal(list.animais[0].cadastrador_nome, `Teste dono ${tag}`);
    assert.equal(typeof list.animais[0].versao, 'string');
    assert.equal((await get(`/animais?q=Lista${tag}&status=Validado`)).total, 0);
    assert.ok((await get(`/animais?q=${encodeURIComponent(`Teste dono ${tag}`)}`)).total >= 5);
    assert.equal(typeof list.contagens.Pendente, 'number');
    for (const query of ['?status=Aprovado', '?offset=x', '?q=a&q=b']) assert.equal((await call(users.admin, `/api/admin/validacoes/animais${query}`)).status, 400);
    assert.equal(String((await get(`/animais/${animal.id_animal}`)).animal.id_animal), String(animal.id_animal));
});

test('aprova associação: vincula o avistamento, preserva o relato, registra a decisão e atualiza contadores', async () => {
    const animal = await createAnimal();
    const { avistamento, solicitacao } = await createRequest(animal);
    const before = await summary();
    const details = await get(`/associacoes/${solicitacao.id_solicitacao}`);
    assert.equal(details.pode_aprovar, true);
    assert.equal(String(details.animal.id_animal), String(animal.id_animal));
    assert.equal(details.avistamento.cor, 'Branco e cinza');
    assert.equal(details.solicitacao.solicitante_nome, `Teste relator ${tag}`);
    assert.equal((await post(`/associacoes/${solicitacao.id_solicitacao}/aprovar`, { observacao: 'Pelagem confere.' })).status, 200);
    const request = await requestRow(solicitacao.id_solicitacao);
    assert.equal(request.status_solicitacao, 'APROVADA');
    assert.equal(String(request.id_usuario_validador), String(users.admin.id));
    assert.ok(recent(request.data_decisao));
    assert.equal(request.observacao_decisao, 'Pelagem confere.');
    const sighting = await sightingRow(avistamento.id_avistamento);
    assert.equal(String(sighting.id_animal), String(animal.id_animal));
    assert.equal(sighting.cor_observada, 'Branco e cinza');
    assert.equal(String(sighting.id_usuario_autor), String(users.relator.id));
    const history = await (await call(users.dono, `/api/animais/${animal.id_animal}/avistamentos`)).json();
    assert.ok(history.avistamentos.some(item => item.id_avistamento === avistamento.id_avistamento));
    assert.equal((await summary()).associacoes.pendentes, before.associacoes.pendentes - 1);
    assert.equal((await post(`/associacoes/${solicitacao.id_solicitacao}/aprovar`, {})).status, 409);
    assert.equal((await post(`/associacoes/${solicitacao.id_solicitacao}/recusar`, { observacao: 'Tarde demais' })).status, 409);
    assert.equal((await call(users.relator, `/api/avistamentos/${avistamento.id_avistamento}/solicitacoes-associacao`, {
        method: 'POST', ...json({ id_animal: String(animal.id_animal), justificativa: 'Nova tentativa depois da aprovação.' }) })).status, 409);
});

test('recusa associação com justificativa, mantém o avistamento sem vínculo e preserva o histórico', async () => {
    const animal = await createAnimal();
    const { avistamento, solicitacao } = await createRequest(animal);
    for (const observacao of [undefined, '  ']) assert.equal((await post(`/associacoes/${solicitacao.id_solicitacao}/recusar`, { observacao })).status, 400);
    assert.equal((await requestRow(solicitacao.id_solicitacao)).status_solicitacao, 'PENDENTE');
    assert.equal((await post(`/associacoes/${solicitacao.id_solicitacao}/recusar`, { observacao: 'Cores diferentes.' })).status, 200);
    const request = await requestRow(solicitacao.id_solicitacao);
    assert.equal(request.status_solicitacao, 'RECUSADA');
    assert.equal(String(request.id_usuario_validador), String(users.admin.id));
    assert.equal(request.observacao_decisao, 'Cores diferentes.');
    assert.equal((await sightingRow(avistamento.id_avistamento)).id_animal, null);
    // Depois da recusa, o fluxo existente permite um novo pedido; o anterior fica no histórico.
    const again = await call(users.relator, `/api/avistamentos/${avistamento.id_avistamento}/solicitacoes-associacao`, {
        method: 'POST', ...json({ id_animal: String(animal.id_animal), justificativa: 'Nova foto mostra a mancha no peito.' }) });
    assert.equal(again.status, 201);
    const details = await get(`/associacoes/${(await again.json()).solicitacao.id_solicitacao}`);
    assert.equal(details.outras_solicitacoes.length, 1);
    assert.equal(details.outras_solicitacoes[0].status_solicitacao, 'RECUSADA');
    assert.equal(details.outras_solicitacoes[0].validador_nome, `Teste admin ${tag}`);
});

test('não aprova se o avistamento já tiver vínculo; a solicitação continua pendente e pode ser recusada', async () => {
    const animal = await createAnimal();
    const other = await createAnimal();
    const { avistamento, solicitacao } = await createRequest(animal);
    await pool.query('UPDATE avistamento SET id_animal = $1 WHERE id_avistamento = $2', [other.id_animal, avistamento.id_avistamento]);
    const details = await get(`/associacoes/${solicitacao.id_solicitacao}`);
    assert.equal(details.pode_aprovar, false);
    assert.match(details.motivo_bloqueio, /já está vinculado/);
    assert.equal((await post(`/associacoes/${solicitacao.id_solicitacao}/aprovar`, {})).status, 409);
    assert.equal((await requestRow(solicitacao.id_solicitacao)).status_solicitacao, 'PENDENTE');
    assert.equal(String((await sightingRow(avistamento.id_avistamento)).id_animal), String(other.id_animal));
    assert.equal((await post(`/associacoes/${solicitacao.id_solicitacao}/recusar`, { observacao: 'Já vinculado a outro cadastro.' })).status, 200);
});

test('decisões simultâneas sobre a mesma solicitação: só uma é registrada e o vínculo fica coerente', async () => {
    const animal = await createAnimal();
    const { avistamento, solicitacao } = await createRequest(animal);
    const responses = await Promise.all([
        post(`/associacoes/${solicitacao.id_solicitacao}/aprovar`, {}), post(`/associacoes/${solicitacao.id_solicitacao}/aprovar`, {}),
        post(`/associacoes/${solicitacao.id_solicitacao}/recusar`, { observacao: 'Recusa concorrente' }),
    ]);
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 409, 409]);
    const request = await requestRow(solicitacao.id_solicitacao);
    const sighting = await sightingRow(avistamento.id_avistamento);
    assert.equal(sighting.id_animal === null ? 'RECUSADA' : 'APROVADA', request.status_solicitacao);
});

test('lista associações com filtros por situação, busca e contagens; correção é só exibida', async () => {
    const animal = await createAnimal({ nome: `Assoc${tag}` });
    await createRequest(animal);
    const list = await get(`/associacoes?q=Assoc${tag}&status=PENDENTE`);
    assert.equal(list.total, 1);
    assert.equal(list.solicitacoes[0].animal_nome, `Assoc${tag}`);
    assert.equal(list.solicitacoes[0].solicitante_nome, `Teste relator ${tag}`);
    assert.equal(typeof list.contagens, 'object');
    assert.equal((await call(users.admin, '/api/admin/validacoes/associacoes?status=CORRECAO_SOLICITADA')).status, 200);
    for (const query of ['?status=ACEITA', '?offset=-1']) assert.equal((await call(users.admin, `/api/admin/validacoes/associacoes${query}`)).status, 400);
    assert.equal((await post(`/associacoes/${list.solicitacoes[0].id_solicitacao}/corrigir`, { observacao: 'x' })).status, 404);
    assert.equal((await get('/associacoes/999999999999')).erro, 'Solicitação não encontrada.');
});
