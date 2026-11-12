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
const extraIds = [];

const call = (user, url, options = {}) => fetch(base + url, { ...options, headers: { ...(user ? { Authorization: `Bearer ${user.token}` } : {}), ...options.headers } });
const json = body => ({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const admin = (url, options) => call(users.admin, '/api/admin/usuarios' + url, options);
const patch = (id, body, user = users.admin) => call(user, `/api/admin/usuarios/${id}`, { method: 'PATCH', ...json(body) });
const setActive = (id, ativo, user = users.admin) => call(user, `/api/admin/usuarios/${id}/situacao`, { method: 'PATCH', ...json({ ativo }) });
const remove = (id, user = users.admin) => call(user, `/api/admin/usuarios/${id}`, { method: 'DELETE', ...json({ confirmar: true }) });
const row = async id => (await pool.query('SELECT * FROM usuario WHERE id_usuario = $1', [id])).rows[0];
async function createUser(key, tipo = 'usuario', extra = {}) {
    const result = await pool.query(`INSERT INTO usuario (nome,email,senha_hash,telefone,tipo_usuario) VALUES ($1,$2,$3,$4,$5) RETURNING id_usuario, email`,
        [`Teste ${key} ${tag}`, `${key}-${randomUUID()}@example.invalid`, 'conta-apenas-para-teste', extra.telefone ?? '93991234567', tipo]);
    const { id_usuario: id, email } = result.rows[0];
    users[key] = { id, email, token: jwt.sign({ id_usuario: id, tipo_usuario: tipo }, process.env.JWT_SECRET, { expiresIn: '10m' }) };
    return users[key];
}
// Conta criada pelo cadastro público, com senha real, para testar o login.
async function signup(key) {
    const email = `${key}-${randomUUID()}@example.invalid`;
    const created = await fetch(`${base}/api/usuarios`, { method: 'POST', ...json({ nome: `Teste ${key} ${tag}`, email, senha: 'senha-de-teste', telefone: '93991234567' }) });
    assert.equal(created.status, 201);
    const id = (await created.json()).usuario.id_usuario;
    extraIds.push(id);
    const login = await fetch(`${base}/api/login`, { method: 'POST', ...json({ email, senha: 'senha-de-teste' }) });
    users[key] = { id, email, token: (await login.json()).token };
    return users[key];
}
const login = user => fetch(`${base}/api/login`, { method: 'POST', ...json({ email: user.email, senha: 'senha-de-teste' }) });

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
    await createUser('admin', 'administrador');
    await createUser('outroAdmin', 'administrador');
    await createUser('comum');
    await createUser('comHistorico');
});

after(async () => {
    const ids = [...Object.values(users).map(user => user.id), ...extraIds];
    const photos = await pool.query('SELECT foto FROM avistamento WHERE id_usuario_autor = ANY($1::bigint[]) UNION SELECT foto FROM animal WHERE id_usuario_cadastrador = ANY($1::bigint[]) UNION SELECT foto_perfil FROM usuario WHERE id_usuario = ANY($1::bigint[])', [ids]);
    await pool.query('DELETE FROM avistamento WHERE id_usuario_autor = ANY($1::bigint[])', [ids]);
    await pool.query('DELETE FROM animal WHERE id_usuario_cadastrador = ANY($1::bigint[])', [ids]);
    await pool.query('DELETE FROM publica_perda WHERE id_usuario_tutor = ANY($1::bigint[])', [ids]);
    await pool.query('DELETE FROM usuario WHERE id_usuario = ANY($1::bigint[])', [ids]);
    for (const { foto } of photos.rows) if (foto) await fs.unlink(path.join(uploads, path.basename(foto))).catch(() => {});
    server?.kill();
    await pool.end();
});

test('rotas de usuários exigem token e conta administradora', async () => {
    for (const [url, method] of [['', 'GET'], ['/1', 'GET'], ['/1', 'PATCH'], ['/1/situacao', 'PATCH'], ['/1', 'DELETE']]) {
        assert.equal((await call(null, '/api/admin/usuarios' + url, { method })).status, 401);
        assert.equal((await call(users.comum, '/api/admin/usuarios' + url, { method })).status, 403);
    }
});

test('lista com busca, filtros de tipo e situação, paginação e sem dados sensíveis', async () => {
    const found = await (await admin(`?q=${tag}`)).json();
    assert.equal(found.total, 4);
    assert.ok(found.usuarios.every(user => user.senha_hash === undefined));
    assert.deepEqual(Object.keys(found.usuarios[0]).sort(), ['ativo', 'data_cadastro', 'email', 'foto_perfil', 'id_usuario', 'nome', 'telefone', 'tipo_usuario']);
    const byEmail = await (await admin(`?q=${encodeURIComponent(users.comum.email)}`)).json();
    assert.deepEqual(byEmail.usuarios.map(user => String(user.id_usuario)), [String(users.comum.id)]);
    assert.equal((await (await admin(`?q=${tag}&tipo=administrador`)).json()).total, 2);
    await pool.query('UPDATE usuario SET ativo = FALSE WHERE id_usuario = $1', [users.comHistorico.id]);
    assert.equal((await (await admin(`?q=${tag}&situacao=inativo`)).json()).total, 1);
    assert.equal((await (await admin(`?q=${tag}&situacao=ativo&tipo=usuario`)).json()).total, 1);
    await pool.query('UPDATE usuario SET ativo = TRUE WHERE id_usuario = $1', [users.comHistorico.id]);
    const page = await (await admin('')).json();
    assert.equal(page.limite, 20);
    assert.equal(page.total, (await pool.query('SELECT count(*)::int AS n FROM usuario')).rows[0].n);
    for (const query of ['?tipo=root', '?situacao=bloqueado', '?offset=-1', `?q=${'x'.repeat(101)}`, '?q=a&q=b']) assert.equal((await admin(query)).status, 400, query);
    for (const id of ['abc', '0']) assert.equal((await admin(`/${id}`)).status, 400);
    assert.equal((await admin('/999999999999')).status, 404);
});

test('detalhes mostram os registros vinculados e as proteções da conta', async () => {
    const owner = users.comHistorico;
    const animal = new FormData(); animal.append('especie', 'Gato');
    assert.equal((await call(owner, '/api/animais', { method: 'POST', body: animal })).status, 201);
    const sighting = new FormData();
    for (const [key, value] of Object.entries({ especie: 'Gato', latitude: '-2.44', longitude: '-54.70' })) sighting.append(key, value);
    assert.equal((await call(owner, '/api/avistamentos', { method: 'POST', body: sighting })).status, 201);
    const lost = new FormData();
    for (const [key, value] of Object.entries({ especie: 'Cachorro', local_desaparecimento: 'Centro', data_desaparecimento: '2025-01-15' })) lost.append(key, value);
    assert.equal((await call(owner, '/api/perdidos', { method: 'POST', body: lost })).status, 201);

    const details = await (await admin(`/${owner.id}`)).json();
    assert.equal(details.dependencias.animais_cadastrados, 1);
    assert.equal(details.dependencias.avistamentos, 1);
    assert.equal(details.dependencias.desaparecimentos, 1);
    assert.equal(details.pode_excluir, false);
    assert.equal(details.pode_alterar_situacao, true);
    assert.match(details.motivo_bloqueio, /Desative/);

    const self = await (await admin(`/${users.admin.id}`)).json();
    assert.equal(self.eh_voce, true);
    assert.equal(self.pode_alterar_situacao, false);
    assert.equal(self.pode_excluir, false);
    assert.equal((await (await admin(`/${users.outroAdmin.id}`)).json()).pode_alterar_situacao, false);
});

test('edição cadastral usa as regras do perfil e recusa tipo, situação, e-mail e senha', async () => {
    const target = users.comum;
    const ok = await patch(target.id, { nome: '  Nome Corrigido  ', telefone: '(93) 99876-5432' });
    assert.equal(ok.status, 200);
    let saved = await row(target.id);
    assert.equal(saved.nome, 'Nome Corrigido');
    assert.equal(saved.telefone, '93998765432');
    for (const body of [{ tipo_usuario: 'administrador' }, { nome: 'Outro Nome', tipo_usuario: 'administrador' }, { ativo: false }, { email: 'novo@example.invalid' },
        { senha: 'nova-senha' }, { senha_hash: 'x' }, { id_usuario: '1' }, {}, { nome: 'ab' }, { telefone: '123' }, { nome: 42 }]) {
        assert.equal((await patch(target.id, body)).status, 400, JSON.stringify(body));
    }
    saved = await row(target.id);
    assert.equal(saved.tipo_usuario, 'usuario');
    assert.equal(saved.ativo, true);
    assert.equal(saved.nome, 'Nome Corrigido');
    assert.equal(saved.email, target.email);
    assert.equal(saved.senha_hash, 'conta-apenas-para-teste');
    assert.equal((await patch('999999999999', { nome: 'Ninguém Aqui' })).status, 404);

    assert.equal((await patch(users.outroAdmin.id, { tipo_usuario: 'usuario' })).status, 400);
    assert.equal((await row(users.outroAdmin.id)).tipo_usuario, 'administrador');
});

test('desativar bloqueia login e tokens já emitidos em todas as rotas autenticadas; reativar libera', async () => {
    const target = await signup('desativavel');
    assert.equal((await call(target, '/api/usuarios/me')).status, 200);
    const response = await setActive(target.id, false);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).usuario.ativo, false);
    assert.equal((await login(target)).status, 403);
    const lost = new FormData();
    for (const [key, value] of Object.entries({ especie: 'Cachorro', local_desaparecimento: 'Centro', data_desaparecimento: '2025-01-15' })) lost.append(key, value);
    for (const [url, options] of [['/api/usuarios/me', {}], ['/api/animais', {}], ['/api/avistamentos', {}], ['/api/perdidos', {}], ['/api/perdidos', { method: 'POST', body: lost }]]) {
        const blocked = await call(target, url, options);
        assert.equal(blocked.status, 403, url);
        assert.equal((await blocked.json()).codigo, 'CONTA_DESATIVADA');
    }
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM publica_perda WHERE id_usuario_tutor = $1', [target.id])).rows[0].n, 0);
    assert.equal((await setActive(target.id, true)).status, 200);
    assert.equal((await call(target, '/api/usuarios/me')).status, 200);
    assert.equal((await login(target)).status, 200);
    for (const ativo of ['false', 0, null]) assert.equal((await setActive(target.id, ativo)).status, 400);
    assert.equal((await setActive('999999999999', false)).status, 404);
});

test('administrador não desativa nem exclui a própria conta nem outros administradores', async () => {
    for (const target of [users.admin, users.outroAdmin]) {
        assert.equal((await setActive(target.id, false)).status, 403);
        assert.equal((await remove(target.id)).status, 403);
        const saved = await row(target.id);
        assert.equal(saved.ativo, true);
        assert.equal(saved.tipo_usuario, 'administrador');
    }
    assert.equal((await setActive(users.admin.id, false, users.outroAdmin)).status, 403);
    assert.equal((await call(users.admin, '/api/admin/me')).status, 200);
});

test('exclusão exige confirmação e é bloqueada por qualquer registro vinculado, inclusive como validador', async () => {
    const owner = users.comHistorico;
    assert.equal((await admin(`/${users.comum.id}`, { method: 'DELETE' })).status, 400);
    const blocked = await remove(owner.id);
    assert.equal(blocked.status, 409);
    const deps = (await blocked.json()).dependencias;
    assert.equal(deps.animais_cadastrados + deps.avistamentos + deps.desaparecimentos, 3);
    assert.ok(await row(owner.id));
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM animal WHERE id_usuario_cadastrador = $1', [owner.id])).rows[0].n, 1);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM avistamento WHERE id_usuario_autor = $1', [owner.id])).rows[0].n, 1);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM publica_perda WHERE id_usuario_tutor = $1', [owner.id])).rows[0].n, 1);

    // Validador: a chave é SET NULL, então excluir apagaria quem validou. Também bloqueia.
    const validator = await createUser('validador');
    const animalId = (await pool.query('SELECT id_animal FROM animal WHERE id_usuario_cadastrador = $1', [owner.id])).rows[0].id_animal;
    await pool.query('UPDATE animal SET id_usuario_validador = $1 WHERE id_animal = $2', [validator.id, animalId]);
    const validatorBlocked = await remove(validator.id);
    assert.equal(validatorBlocked.status, 409);
    assert.equal((await validatorBlocked.json()).dependencias.animais_validados, 1);
    assert.equal(String((await pool.query('SELECT id_usuario_validador FROM animal WHERE id_animal = $1', [animalId])).rows[0].id_usuario_validador), String(validator.id));
    await pool.query('UPDATE animal SET id_usuario_validador = NULL WHERE id_animal = $1', [animalId]);
});

test('exclui conta sem vínculos, apaga a foto depois do banco e invalida o token antigo', async () => {
    const target = await signup('excluivel');
    const upload = await call(target, '/api/usuarios/me/foto', { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: image });
    assert.equal(upload.status, 200);
    const photo = (await upload.json()).usuario.foto_perfil;
    assert.ok(await fs.access(path.join(uploads, path.basename(photo))).then(() => true, () => false));
    const details = await (await admin(`/${target.id}`)).json();
    assert.equal(details.pode_excluir, true);
    assert.equal((await remove(target.id)).status, 200);
    assert.equal(await row(target.id), undefined);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(await fs.access(path.join(uploads, path.basename(photo))).then(() => true, () => false), false);
    assert.equal((await call(target, '/api/usuarios/me')).status, 401);
    assert.equal((await login(target)).status, 401);
    assert.equal((await remove(target.id)).status, 404);
});

test('promoção não existe pela API e o perfil comum continua igual', async () => {
    assert.equal((await call(users.comum, '/api/usuarios/me', { method: 'PATCH', ...json({ tipo_usuario: 'administrador' }) })).status, 400);
    assert.equal((await patch(users.comum.id, { tipo_usuario: 'administrador' })).status, 400);
    assert.equal((await row(users.comum.id)).tipo_usuario, 'usuario');
    assert.equal((await call(users.comum, '/api/usuarios/me', { method: 'PATCH', ...json({ nome: 'Nome Do Proprio' }) })).status, 200);
});
