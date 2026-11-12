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
function form(fields) {
    const body = new FormData();
    for (const [key, value] of Object.entries(fields)) body.append(key, value);
    return body;
}
const linked = id => form({ id_animal: String(id), latitude: '-2.44', longitude: '-54.70' });
const unidentified = () => form({ especie: 'Gato', latitude: '-2.44', longitude: '-54.70', observacao: `Relato ${tag}` });
const count = async (table, column, id) => (await pool.query(`SELECT count(*)::int AS n FROM ${table} WHERE ${column} = $1`, [id])).rows[0].n;
async function createAnimal(status) {
    const response = await call(users.dono, '/api/animais', { method: 'POST', body: form({ nome: `Regra ${tag}`, especie: 'Gato', cor: 'Branco' }) });
    const animal = (await response.json()).animal;
    if (status === 'Validado') await decide(animal.id_animal, 'aprovar');
    if (status === 'Recusado') await decide(animal.id_animal, 'recusar', 'Foto não mostra o animal.');
    return animal;
}
async function decide(id, action, observacao) {
    const { animal } = await (await call(users.admin, `/api/admin/validacoes/animais/${id}`)).json();
    const response = await call(users.admin, `/api/admin/validacoes/animais/${id}/${action}`, { method: 'POST', ...json({ versao: animal.versao, observacao }) });
    assert.equal(response.status, 200);
}
async function sightingFor(user = users.relator) {
    return (await (await call(user, '/api/avistamentos', { method: 'POST', body: unidentified() })).json()).avistamento;
}
const requestAssociation = (sightingId, animalId, user = users.relator) => call(user, `/api/avistamentos/${sightingId}/solicitacoes-associacao`, {
    method: 'POST', ...json({ id_animal: String(animalId), justificativa: 'Mesma pelagem branca e mesma região do cadastro.' }) });
const editAsOwner = (id, cor) => call(users.dono, `/api/animais/${id}`, { method: 'PUT', body: form({ nome: `Regra ${tag}`, especie: 'Gato', cor }) });
const approveRequest = id => call(users.admin, `/api/admin/validacoes/associacoes/${id}/aprovar`, { method: 'POST', ...json({}) });

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
    for (const [key, tipo] of [['admin', 'administrador'], ['dono', 'usuario'], ['relator', 'usuario'], ['outro', 'usuario']]) {
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

test('animal Validado recebe vínculos de usuários comuns e de administradores', async () => {
    const animal = await createAnimal('Validado');
    assert.equal((await call(users.relator, '/api/avistamentos', { method: 'POST', body: linked(animal.id_animal) })).status, 201);
    assert.equal((await call(users.admin, '/api/admin/avistamentos', { method: 'POST', body: linked(animal.id_animal) })).status, 201);
    const sighting = await sightingFor();
    const request = await requestAssociation(sighting.id_avistamento, animal.id_animal);
    assert.equal(request.status, 201);
    assert.equal((await approveRequest((await request.json()).solicitacao.id_solicitacao)).status, 200);
    assert.equal(await count('avistamento', 'id_animal', animal.id_animal), 3);
});

test('animais Pendente e Recusado não recebem vínculos, nem por usuários comuns nem por administradores', async () => {
    for (const status of ['Pendente', 'Recusado']) {
        const animal = await createAnimal(status);
        const sighting = await sightingFor();
        for (const response of [
            await call(users.relator, '/api/avistamentos', { method: 'POST', body: linked(animal.id_animal) }),
            await call(users.admin, '/api/admin/avistamentos', { method: 'POST', body: linked(animal.id_animal) }),
            await requestAssociation(sighting.id_avistamento, animal.id_animal),
            await requestAssociation(sighting.id_avistamento, animal.id_animal, users.admin),
        ]) {
            assert.equal(response.status, 409, status);
            assert.match((await response.json()).erro, /validado/);
        }
        assert.equal(await count('avistamento', 'id_animal', animal.id_animal), 0);
        assert.equal(await count('solicitacao_associacao_avistamento', 'id_animal_proposto', animal.id_animal), 0);
    }
});

test('solicitação pendente não é aprovada se o animal deixou de estar Validado', async () => {
    const animal = await createAnimal('Validado');
    const sighting = await sightingFor();
    const request = (await (await requestAssociation(sighting.id_avistamento, animal.id_animal)).json()).solicitacao;
    // O dono edita: o cadastro volta a Pendente.
    assert.equal((await editAsOwner(animal.id_animal, 'Cinza')).status, 200);
    const details = await (await call(users.admin, `/api/admin/validacoes/associacoes/${request.id_solicitacao}`)).json();
    assert.equal(details.pode_aprovar, false);
    assert.match(details.motivo_bloqueio, /ainda não foi validado/);
    assert.equal((await approveRequest(request.id_solicitacao)).status, 409);
    // Recusado pelo administrador: continua bloqueado, com outro motivo.
    await decide(animal.id_animal, 'recusar', 'Cor não confere.');
    const refused = await approveRequest(request.id_solicitacao);
    assert.equal(refused.status, 409);
    assert.match((await refused.json()).erro, /recusado/);
    const saved = (await pool.query('SELECT status_solicitacao FROM solicitacao_associacao_avistamento WHERE id_solicitacao = $1', [request.id_solicitacao])).rows[0];
    assert.equal(saved.status_solicitacao, 'PENDENTE');
    assert.equal((await pool.query('SELECT id_animal FROM avistamento WHERE id_avistamento = $1', [sighting.id_avistamento])).rows[0].id_animal, null);
    // Reenviado e validado de novo, o mesmo pedido pode ser aprovado.
    assert.equal((await editAsOwner(animal.id_animal, 'Branco')).status, 200);
    await decide(animal.id_animal, 'aprovar');
    assert.equal((await approveRequest(request.id_solicitacao)).status, 200);
});

test('vínculos anteriores são preservados quando o animal deixa de estar Validado', async () => {
    const animal = await createAnimal('Validado');
    const sighting = (await (await call(users.relator, '/api/avistamentos', { method: 'POST', body: linked(animal.id_animal) })).json()).avistamento;
    assert.equal((await editAsOwner(animal.id_animal, 'Cinza')).status, 200);
    await decide(animal.id_animal, 'recusar', 'Cadastro duplicado.');
    const saved = (await pool.query('SELECT id_animal FROM avistamento WHERE id_avistamento = $1', [sighting.id_avistamento])).rows[0];
    assert.equal(String(saved.id_animal), String(animal.id_animal));
    const history = await (await call(users.outro, `/api/animais/${animal.id_animal}/avistamentos`)).json();
    assert.ok(history.avistamentos.some(item => item.id_avistamento === sighting.id_avistamento));
});

test('seletores recebem só animais validados', async () => {
    const validated = await createAnimal('Validado');
    const pending = await createAnimal();
    const refused = await createAnimal('Recusado');
    const data = await (await call(users.relator, `/api/animais?q=${encodeURIComponent(`Regra ${tag}`)}&validacao=Validado`)).json();
    const ids = data.animais.map(item => item.id_animal);
    assert.ok(ids.includes(validated.id_animal));
    assert.ok(!ids.includes(pending.id_animal) && !ids.includes(refused.id_animal));
    assert.ok(data.animais.every(item => item.status_validacao === 'Validado'));
    assert.equal((await call(users.relator, '/api/animais?validacao=Aprovado')).status, 400);
    // Sem o filtro, a consulta geral continua listando todos os cadastros.
    const all = (await (await call(users.relator, `/api/animais?q=${encodeURIComponent(`Regra ${tag}`)}`)).json()).animais.map(item => item.id_animal);
    assert.ok(all.includes(pending.id_animal) && all.includes(refused.id_animal));
});

test('só o cadastrador vê a justificativa da recusa, sem dados de quem decidiu, e ela some ao reenviar', async () => {
    const animal = await createAnimal('Recusado');
    const own = (await (await call(users.dono, `/api/animais/${animal.id_animal}/avistamentos`)).json()).animal;
    assert.equal(own.status_validacao, 'Recusado');
    assert.equal(own.justificativa_recusa, 'Foto não mostra o animal.');
    for (const field of ['id_usuario_validador', 'data_validacao', 'observacao_validacao', 'validador_nome']) assert.equal(own[field], undefined);
    const other = (await (await call(users.outro, `/api/animais/${animal.id_animal}/avistamentos`)).json()).animal;
    assert.equal(other.status_validacao, 'Recusado');
    assert.equal(other.justificativa_recusa, null);
    assert.equal((await editAsOwner(animal.id_animal, 'Cinza')).status, 200);
    const resent = (await (await call(users.dono, `/api/animais/${animal.id_animal}/avistamentos`)).json()).animal;
    assert.equal(resent.status_validacao, 'Pendente');
    assert.equal(resent.justificativa_recusa, null);
    const row = (await pool.query('SELECT id_usuario_validador, data_validacao, observacao_validacao FROM animal WHERE id_animal = $1', [animal.id_animal])).rows[0];
    assert.deepEqual(row, { id_usuario_validador: null, data_validacao: null, observacao_validacao: null });
    const approved = await createAnimal('Validado');
    assert.equal((await (await call(users.dono, `/api/animais/${approved.id_animal}/avistamentos`)).json()).animal.justificativa_recusa, null);
});

test('só o solicitante vê a decisão do próprio pedido de associação', async () => {
    const animal = await createAnimal('Validado');
    const sighting = await sightingFor(users.outro);
    const request = (await (await requestAssociation(sighting.id_avistamento, animal.id_animal)).json()).solicitacao;
    assert.equal((await (await call(users.relator, `/api/avistamentos/${sighting.id_avistamento}`)).json()).minha_ultima_decisao, null);
    const refused = await call(users.admin, `/api/admin/validacoes/associacoes/${request.id_solicitacao}/recusar`, { method: 'POST', ...json({ observacao: 'As cores não conferem.' }) });
    assert.equal(refused.status, 200);
    const mine = (await (await call(users.relator, `/api/avistamentos/${sighting.id_avistamento}`)).json()).minha_ultima_decisao;
    assert.equal(mine.status_solicitacao, 'RECUSADA');
    assert.equal(mine.observacao_decisao, 'As cores não conferem.');
    assert.equal(String(mine.id_animal_proposto), String(animal.id_animal));
    assert.deepEqual(Object.keys(mine).sort(), ['data_decisao', 'id_animal_proposto', 'observacao_decisao', 'status_solicitacao']);
    // O autor do avistamento e outras pessoas não veem a decisão de um pedido que não fizeram.
    assert.equal((await (await call(users.outro, `/api/avistamentos/${sighting.id_avistamento}`)).json()).minha_ultima_decisao, null);
    assert.equal((await (await call(users.dono, `/api/avistamentos/${sighting.id_avistamento}`)).json()).minha_ultima_decisao, null);
});
