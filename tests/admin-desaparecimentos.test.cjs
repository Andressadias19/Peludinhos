const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const jwt = require('jsonwebtoken');
const pool = require('../server/config/database');

const privateDir = path.join(__dirname, '..', 'server', 'uploads-perdidos');
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nJkAAAAASUVORK5CYII=', 'base64');
const tag = randomUUID().slice(0, 8);
let server, base;
const users = {};

const lost = (extra = {}) => ({ nome_animal: `Perdido ${tag}`, especie: 'Cachorro', local_desaparecimento: 'Praça do Centro', data_desaparecimento: '2025-01-15', ...extra });
function form(fields = {}, photo) {
    const body = new FormData();
    for (const [key, value] of Object.entries(fields)) body.append(key, value);
    if (photo) body.append('foto', new Blob([photo], { type: 'image/png' }), 'foto.png');
    return body;
}
const call = (user, url, options = {}) => fetch(base + url, { ...options, headers: { ...(user ? { Authorization: `Bearer ${user.token}` } : {}), ...options.headers } });
const admin = (url, options) => call(users.admin, '/api/admin/desaparecimentos' + url, options);
const json = body => ({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const confirmDelete = id => admin(`/${id}`, { method: 'DELETE', ...json({ confirmar: true }) });
const row = async id => (await pool.query('SELECT * FROM publica_perda WHERE id_perda = $1', [id])).rows[0];
const fileExists = name => fs.access(path.join(privateDir, name)).then(() => true, () => false);
const countLost = async () => (await pool.query('SELECT count(*)::int AS n FROM publica_perda')).rows[0].n;
async function publishAs(user, fields, photo, url = '/api/perdidos') {
    const response = await call(user, url, { method: 'POST', body: form(fields, photo) });
    assert.equal(response.status, 201);
    return (await response.json()).perdido;
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
    for (const [key, tipo, telefone] of [['admin', 'administrador', '93991112222'], ['adminSemTelefone', 'administrador', null], ['tutor', 'usuario', '93993334444'], ['comum', 'usuario', '93995556666']]) {
        const result = await pool.query(`INSERT INTO usuario (nome,email,senha_hash,telefone,tipo_usuario) VALUES ($1,$2,$3,$4,$5) RETURNING id_usuario`,
            [`Teste ${key} ${tag}`, `${randomUUID()}@example.invalid`, 'conta-apenas-para-teste', telefone, tipo]);
        const id = result.rows[0].id_usuario;
        users[key] = { id, token: jwt.sign({ id_usuario: id, tipo_usuario: tipo }, process.env.JWT_SECRET, { expiresIn: '10m' }) };
    }
});

after(async () => {
    const ids = Object.values(users).map(user => user.id);
    if (ids.length) {
        const photos = await pool.query('SELECT foto FROM publica_perda WHERE id_usuario_tutor = ANY($1::bigint[])', [ids]);
        await pool.query('DELETE FROM publica_perda WHERE id_usuario_tutor = ANY($1::bigint[])', [ids]);
        await pool.query('DELETE FROM usuario WHERE id_usuario = ANY($1::bigint[])', [ids]);
        for (const { foto } of photos.rows) if (foto) await fs.unlink(path.join(privateDir, path.basename(foto))).catch(() => {});
    }
    server?.kill();
    await pool.end();
});

test('rotas de desaparecimentos exigem token e conta administradora', async () => {
    for (const [url, method] of [['', 'GET'], ['/1', 'GET'], ['', 'POST'], ['/1', 'PUT'], ['/1', 'DELETE']]) {
        assert.equal((await call(null, '/api/admin/desaparecimentos' + url, { method })).status, 401);
        assert.equal((await call(users.comum, '/api/admin/desaparecimentos' + url, { method })).status, 403);
    }
});

test('administrador publica com foto privada e fica como tutor; status começa PERDIDO', async () => {
    const item = await publishAs(users.admin, lost({ status_perda: 'ENCONTRADO', id_usuario_tutor: String(users.comum.id) }), image, '/api/admin/desaparecimentos');
    const saved = await row(item.id_perda);
    assert.equal(String(saved.id_usuario_tutor), String(users.admin.id));
    assert.equal(saved.status_perda, 'PERDIDO');
    assert.match(saved.foto, /^perda-[0-9a-f-]{36}\.png$/);
    assert.ok(await fileExists(saved.foto));
    assert.equal(item.foto, undefined);
    const photo = await call(users.admin, `/api/perdidos/${item.id_perda}/foto`);
    assert.equal(photo.status, 200);
    assert.equal(photo.headers.get('content-type'), 'image/png');
});

test('publicação administrativa mantém a regra de telefone do contato', async () => {
    const before = await countLost();
    const response = await call(users.adminSemTelefone, '/api/admin/desaparecimentos', { method: 'POST', body: form(lost()) });
    assert.equal(response.status, 400);
    assert.match((await response.json()).erro, /telefone/);
    assert.equal(await countLost(), before);
});

test('dados inválidos são recusados sem gravar nada', async () => {
    const before = await countLost();
    for (const fields of [lost({ especie: 'Dragão' }), lost({ local_desaparecimento: '' }), lost({ data_desaparecimento: '2025-02-30' }),
        lost({ data_desaparecimento: '2999-01-01' }), lost({ genero: 'Outro' }), lost({ nome_animal: 'x'.repeat(101) }), lost({ descricao: 'a\0b' })]) {
        assert.equal((await admin('', { method: 'POST', body: form(fields) })).status, 400);
    }
    const fake = form(lost()); fake.append('foto', new Blob(['não é imagem'], { type: 'image/png' }), 'x.png');
    assert.equal((await admin('', { method: 'POST', body: fake })).status, 400);
    assert.equal(await countLost(), before);
    for (const query of ['?status=SUMIDO', '?especie=Peixe', '?inicio=2026-02-30', '?inicio=2026-05-02&fim=2026-05-01', '?offset=x', `?q=${'x'.repeat(101)}`, '?q=a&q=b']) {
        assert.equal((await admin(query)).status, 400, query);
    }
    for (const id of ['abc', '0']) assert.equal((await admin(`/${id}`)).status, 400);
    assert.equal((await admin('/999999999999')).status, 404);
    assert.equal((await admin('/999999999999', { method: 'PUT', body: form(lost()) })).status, 404);
});

test('lista com busca por animal e tutor, filtros de situação, espécie e período, e paginação', async () => {
    const unique = `Sumido${tag}`;
    const dog = await publishAs(users.tutor, lost({ nome_animal: unique, data_desaparecimento: '2025-03-10' }));
    const cat = await publishAs(users.tutor, lost({ nome_animal: `${unique} gato`, especie: 'Gato', data_desaparecimento: '2025-06-20' }));
    await call(users.tutor, `/api/perdidos/${cat.id_perda}/status`, { method: 'PATCH', ...json({ status_perda: 'ENCONTRADO' }) });
    const list = async query => (await (await admin(`?q=${unique}${query}`)).json());
    const all = await list('');
    assert.equal(all.total, 2);
    assert.equal(all.desaparecimentos[0].tutor_nome, `Teste tutor ${tag}`);
    assert.equal(all.desaparecimentos[0].tutor_telefone, '93993334444');
    assert.equal(all.desaparecimentos[0].foto, undefined);
    assert.deepEqual((await list('&status=ENCONTRADO')).desaparecimentos.map(item => item.id_perda), [cat.id_perda]);
    assert.deepEqual((await list('&status=PERDIDO&especie=Cachorro')).desaparecimentos.map(item => item.id_perda), [dog.id_perda]);
    assert.equal((await list('&inicio=2025-03-01&fim=2025-03-31')).total, 1);
    assert.equal((await list('&inicio=2025-03-10&fim=2025-06-20')).total, 2);
    assert.equal((await list('&inicio=2024-01-01&fim=2024-12-31')).total, 0);
    const byTutor = await (await admin(`?q=${encodeURIComponent(`Teste tutor ${tag}`)}`)).json();
    assert.ok(byTutor.total >= 2 && byTutor.desaparecimentos.every(item => item.tutor_nome === `Teste tutor ${tag}`));
    const page = await (await admin('')).json();
    assert.equal(page.limite, 20);
    assert.equal(page.total, await countLost());
    const details = await (await admin(`/${dog.id_perda}`)).json();
    assert.equal(details.desaparecimento.tutor_nome, `Teste tutor ${tag}`);
    assert.ok(details.desaparecimento.tutor_email.endsWith('@example.invalid'));
});

test('edita publicação de outro tutor preservando tutor, data de publicação e situação', async () => {
    const item = await publishAs(users.tutor, lost(), image);
    const before = await row(item.id_perda);
    const response = await admin(`/${item.id_perda}`, { method: 'PUT', body: form(lost({ nome_animal: 'Thor', cor: 'Preto', descricao: 'Coleira azul',
        id_usuario_tutor: String(users.admin.id), data_publicacao: '2000-01-01', id_perda: '1' }), image) });
    assert.equal(response.status, 200);
    const saved = await row(item.id_perda);
    assert.equal(saved.nome_animal, 'Thor');
    assert.equal(saved.cor, 'Preto');
    assert.equal(saved.descricao, 'Coleira azul');
    assert.equal(String(saved.id_usuario_tutor), String(users.tutor.id));
    assert.equal(saved.data_publicacao.getTime(), before.data_publicacao.getTime());
    assert.equal(saved.status_perda, 'PERDIDO');
    assert.notEqual(saved.foto, before.foto);
    assert.equal(await fileExists(before.foto), false);
    assert.ok(await fileExists(saved.foto));

    assert.equal((await admin(`/${item.id_perda}`, { method: 'PUT', body: form(lost({ status_perda: 'ENCONTRADO' })) })).status, 200);
    const found = await row(item.id_perda);
    assert.equal(found.status_perda, 'ENCONTRADO');
    assert.equal(found.foto, saved.foto);

    const removed = await admin(`/${item.id_perda}`, { method: 'PUT', body: form(lost({ remover_foto: 'true' })) });
    assert.equal(removed.status, 200);
    assert.equal((await row(item.id_perda)).foto, null);
    assert.equal(await fileExists(saved.foto), false);

    for (const fields of [lost({ status_perda: 'SUMIDO' }), lost({ especie: 'Dragão' }), lost({ remover_foto: 'talvez' })]) {
        assert.equal((await admin(`/${item.id_perda}`, { method: 'PUT', body: form(fields) })).status, 400);
    }
    const both = form(lost({ remover_foto: 'true' }), image);
    assert.equal((await admin(`/${item.id_perda}`, { method: 'PUT', body: both })).status, 400);
    const unchanged = await row(item.id_perda);
    assert.equal(unchanged.especie, 'Cachorro');
    assert.equal(unchanged.status_perda, 'ENCONTRADO');
});

test('exclusão exige confirmação, apaga só o registro e a foto dele e mantém o tutor', async () => {
    const item = await publishAs(users.tutor, lost(), image);
    const other = await publishAs(users.tutor, lost(), image);
    const photo = (await row(item.id_perda)).foto;
    const otherPhoto = (await row(other.id_perda)).foto;
    assert.equal((await admin(`/${item.id_perda}`, { method: 'DELETE' })).status, 400);
    assert.equal((await call(users.admin, `/api/admin/desaparecimentos/${item.id_perda}`, { method: 'DELETE', ...json({ confirmar: 'sim' }) })).status, 400);
    assert.ok(await row(item.id_perda));
    assert.equal((await confirmDelete(item.id_perda)).status, 200);
    assert.equal(await row(item.id_perda), undefined);
    assert.equal(await fileExists(photo), false);
    assert.ok(await row(other.id_perda));
    assert.ok(await fileExists(otherPhoto));
    assert.ok((await pool.query('SELECT 1 FROM usuario WHERE id_usuario = $1', [users.tutor.id])).rowCount);
    assert.equal((await confirmDelete(item.id_perda)).status, 404);
});

test('permissões dos usuários comuns continuam as mesmas', async () => {
    const item = await publishAs(users.tutor, lost());
    assert.equal((await call(users.comum, `/api/perdidos/${item.id_perda}`, { method: 'PUT', body: form(lost({ nome_animal: 'Invasor' })) })).status, 403);
    assert.equal((await call(users.comum, `/api/perdidos/${item.id_perda}`, { method: 'DELETE' })).status, 403);
    assert.equal((await call(users.comum, `/api/admin/desaparecimentos/${item.id_perda}`, { method: 'PUT', body: form(lost({ nome_animal: 'Invasor' })) })).status, 403);
    assert.equal((await row(item.id_perda)).nome_animal, `Perdido ${tag}`);
    assert.equal((await call(users.tutor, `/api/perdidos/${item.id_perda}`, { method: 'PUT', body: form(lost({ nome_animal: 'Do tutor' })) })).status, 200);
});
