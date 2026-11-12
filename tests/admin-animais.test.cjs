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
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nJkAAAAASUVORK5CYII=', 'base64');
const tag = randomUUID().slice(0, 8);
let server, base;
const users = {};

function form(fields = {}, photo) {
    const body = new FormData();
    for (const [key, value] of Object.entries({ nome: `Admin ${tag}`, especie: 'Gato', ...fields })) body.append(key, value);
    if (photo) body.append('foto', new Blob([photo], { type: 'image/png' }), 'foto.png');
    return body;
}
const call = (user, url, options = {}) => fetch(base + url, { ...options, headers: { ...(user ? { Authorization: `Bearer ${user.token}` } : {}), ...options.headers } });
const admin = (url, options) => call(users.admin, '/api/admin/animais' + url, options);
const json = body => ({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const confirmDelete = (user, id) => call(user, `/api/admin/animais/${id}`, { method: 'DELETE', ...json({ confirmar: true }) });
const row = async id => (await pool.query('SELECT * FROM animal WHERE id_animal = $1', [id])).rows[0];
const fileExists = foto => fs.access(path.join(uploads, path.basename(foto))).then(() => true, () => false);
async function adminCreate(fields, photo) {
    const response = await admin('', { method: 'POST', body: form(fields, photo) });
    assert.equal(response.status, 201);
    return (await response.json()).animal;
}

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
    for (const [key, tipo] of [['admin', 'administrador'], ['comum', 'usuario'], ['dono', 'usuario']]) {
        const result = await pool.query(`INSERT INTO usuario (nome,email,senha_hash,tipo_usuario) VALUES ($1,$2,$3,$4) RETURNING id_usuario`,
            [`Teste ${key} ${tag}`, `${randomUUID()}@example.invalid`, 'conta-apenas-para-teste', tipo]);
        const id = result.rows[0].id_usuario;
        users[key] = { id, token: jwt.sign({ id_usuario: id, tipo_usuario: tipo }, process.env.JWT_SECRET, { expiresIn: '10m' }) };
    }
});

after(async () => {
    const ids = Object.values(users).map(user => user.id);
    if (ids.length) {
        const photos = await pool.query(`SELECT foto FROM avistamento WHERE id_usuario_autor = ANY($1::bigint[])
            UNION SELECT foto FROM animal WHERE id_usuario_cadastrador = ANY($1::bigint[])`, [ids]);
        await pool.query('DELETE FROM solicitacao_associacao_avistamento WHERE id_usuario_solicitante = ANY($1::bigint[])', [ids]);
        await pool.query('DELETE FROM avistamento WHERE id_usuario_autor = ANY($1::bigint[])', [ids]);
        await pool.query('DELETE FROM animal WHERE id_usuario_cadastrador = ANY($1::bigint[])', [ids]);
        await pool.query('DELETE FROM usuario WHERE id_usuario = ANY($1::bigint[])', [ids]);
        for (const { foto } of photos.rows) if (foto) await fs.unlink(path.join(uploads, path.basename(foto))).catch(() => {});
    }
    server?.kill();
    await pool.end();
});

test('rotas de animais exigem token e conta administradora', async () => {
    const routes = [['', 'GET'], ['/1', 'GET'], ['', 'POST'], ['/1', 'PUT'], ['/1', 'DELETE']];
    for (const [url, method] of routes) {
        assert.equal((await call(null, '/api/admin/animais' + url, { method })).status, 401);
        assert.equal((await call(users.comum, '/api/admin/animais' + url, { method })).status, 403);
    }
});

test('administrador cadastra com foto, fica como cadastrador e o animal nasce Pendente', async () => {
    const animal = await adminCreate({ caracteristicas: 'Mancha no peito', status_validacao: 'Validado', id_usuario_cadastrador: String(users.comum.id) }, image);
    assert.equal(String(animal.id_usuario_cadastrador), String(users.admin.id));
    assert.equal(animal.status_validacao, 'Pendente');
    assert.match(animal.foto, /^\/uploads\/animal-[0-9a-f-]{36}\.png$/);
    assert.ok(await fileExists(animal.foto));
    assert.equal((await row(animal.id_animal)).caracteristicas, 'Mancha no peito');
});

test('entradas inválidas são recusadas sem gravar nada', async () => {
    const before = (await pool.query('SELECT count(*)::int AS n FROM animal')).rows[0].n;
    for (const fields of [{ especie: 'Dragão' }, { idade_aproximada: 'VELHO' }, { genero: 'Outro' }, { nome: 'x'.repeat(101) }, { situacao: 'CADASTRADO' }]) {
        assert.equal((await admin('', { method: 'POST', body: form(fields) })).status, 400);
    }
    const fake = new FormData(); fake.append('especie', 'Gato'); fake.append('foto', new Blob(['não é imagem'], { type: 'image/png' }), 'x.png');
    assert.equal((await admin('', { method: 'POST', body: fake })).status, 400);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM animal')).rows[0].n, before);
    for (const query of ['?status=Aprovado', '?especie=Peixe', '?offset=-1', `?q=${'x'.repeat(101)}`]) assert.equal((await admin(query)).status, 400);
    for (const id of ['abc', '0', '1.5']) assert.equal((await admin(`/${id}`)).status, 400);
    assert.equal((await admin('/999999999999')).status, 404);
    assert.equal((await admin('/999999999999', { method: 'PUT', body: form() })).status, 404);
});

test('lista com busca, filtros, paginação e dados do cadastrador', async () => {
    const unique = `Busca${tag}`;
    const animal = await adminCreate({ nome: unique });
    const found = await (await admin(`?q=${unique}`)).json();
    assert.equal(found.total, 1);
    assert.equal(found.animais[0].id_animal, animal.id_animal);
    assert.equal(found.animais[0].cadastrador_nome, `Teste admin ${tag}`);
    assert.equal(found.animais[0].total_avistamentos, 0);
    assert.equal((await (await admin(`?q=${unique}&status=Validado`)).json()).total, 0);
    assert.equal((await (await admin(`?q=${unique}&status=Pendente&especie=Gato`)).json()).total, 1);
    assert.equal((await (await admin(`?q=${encodeURIComponent(`Teste admin ${tag}`)}`)).json()).total >= 2, true);
    const page = await (await admin('?offset=0')).json();
    assert.equal(page.limite, 20);
    assert.ok(page.animais.length <= 20);
    assert.equal(page.total, (await pool.query('SELECT count(*)::int AS n FROM animal')).rows[0].n);
});

test('edição de animal de outro usuário volta para Pendente e limpa a validação anterior', async () => {
    const created = await call(users.dono, '/api/animais', { method: 'POST', body: form({ nome: `Dono ${tag}`, cor: 'Preto' }, image) });
    const animal = (await created.json()).animal;
    await pool.query(`UPDATE animal SET status_validacao = 'Validado', id_usuario_validador = $2, data_validacao = CURRENT_TIMESTAMP,
        observacao_validacao = 'Conferido', data_atualizacao = '2020-01-01' WHERE id_animal = $1`, [animal.id_animal, users.admin.id]);
    const fields = { nome: `Dono ${tag}`, cor: 'Preto' };

    const same = await (await admin(`/${animal.id_animal}`, { method: 'PUT', body: form(fields) })).json();
    assert.equal(same.alterado, false);
    assert.equal((await row(animal.id_animal)).status_validacao, 'Validado');

    const response = await admin(`/${animal.id_animal}`, { method: 'PUT', body: form({ ...fields, cor: 'Branco', id_usuario_cadastrador: String(users.admin.id) }, image) });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).alterado, true);
    const saved = await row(animal.id_animal);
    assert.equal(saved.cor, 'Branco');
    assert.equal(saved.status_validacao, 'Pendente');
    assert.equal(saved.id_usuario_validador, null);
    assert.equal(saved.data_validacao, null);
    assert.equal(saved.observacao_validacao, null);
    assert.equal(String(saved.id_usuario_cadastrador), String(users.dono.id));
    assert.ok(saved.data_atualizacao > new Date('2020-01-02'));
    assert.notEqual(saved.foto, animal.foto);
    assert.equal(await fileExists(animal.foto), false);
    assert.ok(await fileExists(saved.foto));

    assert.equal((await admin(`/${animal.id_animal}`, { method: 'PUT', body: form({ especie: 'Dragão' }) })).status, 400);
    assert.equal((await row(animal.id_animal)).especie, 'Gato');
});

test('exclusão exige confirmação explícita e remove animal sem dependências e sua foto', async () => {
    const animal = await adminCreate({}, image);
    assert.equal((await admin(`/${animal.id_animal}`, { method: 'DELETE' })).status, 400);
    assert.equal((await call(users.admin, `/api/admin/animais/${animal.id_animal}`, { method: 'DELETE', ...json({ confirmar: 'sim' }) })).status, 400);
    assert.ok(await row(animal.id_animal));
    const details = await (await admin(`/${animal.id_animal}`)).json();
    assert.equal(details.pode_excluir, true);
    assert.equal((await confirmDelete(users.admin, animal.id_animal)).status, 200);
    assert.equal(await row(animal.id_animal), undefined);
    assert.equal(await fileExists(animal.foto), false);
    assert.equal((await confirmDelete(users.admin, animal.id_animal)).status, 404);
});

test('animal com avistamento não é excluído e o avistamento é preservado', async () => {
    const animal = await adminCreate();
    // Só animais validados recebem vínculos; a validação é simulada no banco.
    await pool.query(`UPDATE animal SET status_validacao = 'Validado' WHERE id_animal = $1`, [animal.id_animal]);
    const body = new FormData();
    for (const [key, value] of Object.entries({ id_animal: String(animal.id_animal), latitude: '-23.5', longitude: '-46.6', observacao: 'Visto no teste' })) body.append(key, value);
    const sighting = (await (await call(users.comum, '/api/avistamentos', { method: 'POST', body })).json()).avistamento;
    const details = await (await admin(`/${animal.id_animal}`)).json();
    assert.equal(details.pode_excluir, false);
    assert.equal(details.dependencias.avistamentos, 1);
    assert.equal(details.avistamentos_recentes[0].id_avistamento, sighting.id_avistamento);
    const response = await confirmDelete(users.admin, animal.id_animal);
    assert.equal(response.status, 409);
    assert.equal((await response.json()).dependencias.avistamentos, 1);
    assert.ok(await row(animal.id_animal));
    const kept = (await pool.query('SELECT id_animal FROM avistamento WHERE id_avistamento = $1', [sighting.id_avistamento])).rows[0];
    assert.equal(String(kept.id_animal), String(animal.id_animal));
});

test('animal proposto em solicitação de associação não é excluído e a solicitação é preservada', async () => {
    const animal = await adminCreate();
    // Só animais validados recebem vínculos; a validação é simulada no banco.
    await pool.query(`UPDATE animal SET status_validacao = 'Validado' WHERE id_animal = $1`, [animal.id_animal]);
    const body = new FormData();
    for (const [key, value] of Object.entries({ especie: 'Gato', latitude: '-23.5', longitude: '-46.6' })) body.append(key, value);
    const sighting = (await (await call(users.comum, '/api/avistamentos', { method: 'POST', body })).json()).avistamento;
    const request = await call(users.comum, `/api/avistamentos/${sighting.id_avistamento}/solicitacoes-associacao`, {
        method: 'POST', ...json({ id_animal: String(animal.id_animal), justificativa: 'Mesma pelagem e mesma região do cadastro.' }) });
    assert.equal(request.status, 201);
    const response = await confirmDelete(users.admin, animal.id_animal);
    assert.equal(response.status, 409);
    assert.equal((await response.json()).dependencias.solicitacoes_associacao, 1);
    assert.ok(await row(animal.id_animal));
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM solicitacao_associacao_avistamento WHERE id_animal_proposto = $1', [animal.id_animal])).rows[0].n, 1);
});

test('permissões dos usuários comuns continuam as mesmas', async () => {
    const own = await call(users.comum, '/api/animais', { method: 'POST', body: form({ nome: `Comum ${tag}` }) });
    assert.equal(own.status, 201);
    assert.equal((await own.json()).animal.status_validacao, 'Pendente');
    const adminAnimal = await adminCreate();
    assert.equal((await call(users.comum, `/api/animais/${adminAnimal.id_animal}`, { method: 'PUT', body: form({ cor: 'Azul' }) })).status, 403);
    assert.equal((await row(adminAnimal.id_animal)).cor, null);
});
