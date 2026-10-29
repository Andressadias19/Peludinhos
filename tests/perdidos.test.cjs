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
const servers = [];
const users = {};
const created = [];
let base, originalUsers, originalLost;
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nJkAAAAASUVORK5CYII=', 'base64');
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('foto substituta de teste')]);

function form(fields = {}, photo) {
    const body = new FormData();
    for (const [key, value] of Object.entries({ nome_animal: 'Teste perdido', especie: 'Cachorro', local_desaparecimento: 'Praça do Centro', data_desaparecimento: '2025-01-15', ...fields })) body.append(key, value);
    if (photo) body.append('foto', new Blob([photo], { type: 'image/png' }), 'animal.png');
    return body;
}
const withRemoval = (body, value = 'true') => { body.append('remover_foto', value); return body; };
const request = (url, user, options = {}, server = base) => fetch(`${server}/api/perdidos${url}`, { ...options, headers: { ...(user ? { Authorization: `Bearer ${user.token}` } : {}), ...options.headers } });
async function create(user, body, server) {
    const response = await request('', user, { method: 'POST', body }, server);
    const data = await response.json();
    if (data.perdido) created.push(data.perdido.id_perda);
    return { response, data };
}
const edit = (user, id, body, server) => request(`/${id}`, user, { method: 'PUT', body }, server);
const remove = (user, id, server) => request(`/${id}`, user, { method: 'DELETE' }, server);
const patchStatus =(user, id, payload) => request(`/${id}/status`, user, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
const row = async id => (await pool.query('SELECT * FROM publica_perda WHERE id_perda = $1', [id])).rows[0];
const listPrivate = () => fs.readdir(privateDir).catch(() => []);
const fileExists = name => fs.access(path.join(privateDir, name)).then(() => true, () => false);
const countLost = async () => (await pool.query('SELECT count(*)::int AS n FROM publica_perda')).rows[0].n;

async function startServer(extraEnv = {}) {
    const socket = net.createServer();
    await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
    const port = socket.address().port;
    await new Promise(resolve => socket.close(resolve));
    const child = spawn(process.execPath, ['server/server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: String(port), ...extraEnv }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    servers.push(child);
    child.log = '';
    child.stderr.on('data', chunk => { child.log += chunk; });
    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Servidor de teste não iniciou.')), 15000);
        child.stdout.on('data', chunk => { if (String(chunk).includes('Servidor rodando')) { clearTimeout(timeout); resolve(); } });
        child.on('error', error => { clearTimeout(timeout); reject(error); });
        child.on('exit', code => { clearTimeout(timeout); if (code) reject(new Error(`Servidor encerrou: ${code}`)); });
    });
    return `http://127.0.0.1:${port}`;
}

before(async () => {
    // Só roda no banco esperado. Publicações reais podem existir: o teste só cria e apaga as suas, pelos IDs.
    const db = await pool.query('SELECT current_database() AS name');
    if (db.rows[0].name !== 'peludinhos') throw new Error(`Banco inesperado: ${db.rows[0].name}`);
    originalUsers = (await pool.query('SELECT * FROM usuario ORDER BY id_usuario')).rows;
    originalLost = (await pool.query('SELECT * FROM publica_perda ORDER BY id_perda')).rows;
    for (const [key, telefone] of [['tutor', '93991234567'], ['semTelefone', null], ['outro', '93998765432']]) {
        const user = await pool.query(`INSERT INTO usuario (nome,email,senha_hash,telefone,tipo_usuario) VALUES ($1,$2,$3,$4,'usuario') RETURNING id_usuario`, [`Teste perdidos ${key}`, `${randomUUID()}@example.invalid`, 'conta-apenas-para-teste', telefone]);
        const id = user.rows[0].id_usuario;
        users[key] = { id, telefone, token: jwt.sign({ id_usuario: id, tipo_usuario: 'usuario' }, process.env.JWT_SECRET, { expiresIn: '10m' }) };
    }
    base = await startServer();
});

after(async () => {
    const ids = Object.values(users).map(user => user.id);
    if (ids.length) {
        // Remove somente as publicações e contas criadas por este teste.
        const photos = await pool.query('SELECT foto FROM publica_perda WHERE id_perda = ANY($1::bigint[]) OR id_usuario_tutor = ANY($2::bigint[])', [created, ids]);
        await pool.query('DELETE FROM publica_perda WHERE id_perda = ANY($1::bigint[]) OR id_usuario_tutor = ANY($2::bigint[])', [created, ids]);
        await pool.query('DELETE FROM usuario WHERE id_usuario = ANY($1::bigint[])', [ids]);
        for (const row of photos.rows) if (row.foto) await fs.unlink(path.join(privateDir, path.basename(row.foto))).catch(() => {});
        console.log(`Limpeza: publicações ${JSON.stringify(created)}, usuários ${JSON.stringify(ids)}, fotos ${photos.rows.filter(row => row.foto).length}`);
        console.log(`publica_perda após limpeza: ${await countLost()} registro(s)`);
        const now = (await pool.query('SELECT * FROM usuario ORDER BY id_usuario')).rows;
        console.log(`Usuários originais preservados: ${JSON.stringify(now) === JSON.stringify(originalUsers)}`);
        const lostNow = (await pool.query('SELECT * FROM publica_perda ORDER BY id_perda')).rows;
        console.log(`Publicações existentes preservadas (${originalLost.length}): ${JSON.stringify(lostNow) === JSON.stringify(originalLost)}`);
    }
    for (const child of servers) child.kill();
    await pool.end();
});

test('exige login para listar, consultar, publicar e ver foto', async () => {
    for (const [url, method] of [['', 'GET'], ['', 'POST'], ['/1', 'GET'], ['/1/foto', 'GET']]) {
        assert.equal((await request(url, null, { method })).status, 401);
    }
});

test('exige telefone no perfil e não grava nada sem ele', async () => {
    const files = await listPrivate();
    const count = await countLost();
    const { response, data } = await create(users.semTelefone, form({}, image));
    assert.equal(response.status, 400);
    assert.match(data.erro, /telefone/);
    assert.equal(await countLost(), count);
    assert.deepEqual(await listPrivate(), files);
});

test('publica com foto, usa o tutor do token e começa como PERDIDO', async () => {
    const { response, data } = await create(users.tutor, form({ nome_animal: '  Bidu  ', genero: 'Macho', descricao: 'Coleira azul', id_usuario_tutor: String(users.outro.id), status_perda: 'ENCONTRADO', data_publicacao: '2000-01-01' }, image));
    assert.equal(response.status, 201);
    const item = data.perdido;
    assert.equal(item.nome_animal, 'Bidu');
    assert.equal(item.status_perda, 'PERDIDO');
    assert.equal(item.tem_foto, true);
    assert.equal(item.data_desaparecimento, '2025-01-15');
    assert.equal('foto' in item || 'id_usuario_tutor' in item, false);
    const db = await pool.query(`SELECT id_usuario_tutor, status_perda, foto,
        data_publicacao > LOCALTIMESTAMP - interval '5 minutes' AS publicada_agora FROM publica_perda WHERE id_perda = $1`, [item.id_perda]);
    assert.equal(db.rowCount, 1);
    assert.equal(db.rows[0].id_usuario_tutor, users.tutor.id);
    assert.equal(db.rows[0].status_perda, 'PERDIDO');
    assert.equal(db.rows[0].publicada_agora, true);
    assert.match(db.rows[0].foto, /^perda-[0-9a-f-]{36}\.png$/);
    assert.deepEqual(await fs.readFile(path.join(privateDir, db.rows[0].foto)), image);
});

test('entrega a foto só com JWT, com cabeçalhos de segurança, e não pelos caminhos públicos', async () => {
    const id = created[0];
    const { rows: [{ foto }] } = await pool.query('SELECT foto FROM publica_perda WHERE id_perda = $1', [id]);
    assert.equal((await request(`/${id}/foto`, null)).status, 401);
    const response = await request(`/${id}/foto`, users.outro);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), image);
    for (const url of [`/uploads/${foto}`, `/uploads-perdidos/${foto}`, `/uploads/../uploads-perdidos/${foto}`, `/uploads/%2e%2e/uploads-perdidos/${foto}`]) {
        const direct = await fetch(base + url);
        assert.notEqual(direct.status, 200, url);
        assert.doesNotMatch(direct.headers.get('content-type') || '', /^image\//, url);
    }
});

test('lista sem dados do tutor e mostra telefone e eh_autor só nos detalhes', async () => {
    const id = created[0];
    const list = await request('', users.outro);
    assert.equal(list.status, 200);
    const item = (await list.json()).perdidos.find(row => row.id_perda === id);
    assert.ok(item);
    for (const key of ['tutor_telefone', 'tutor_nome', 'id_usuario_tutor', 'foto', 'eh_autor']) assert.equal(key in item, false, key);
    const owner = await (await request(`/${id}`, users.tutor)).json();
    assert.equal(owner.perdido.eh_autor, true);
    assert.equal(owner.perdido.tutor_telefone, users.tutor.telefone);
    assert.equal(owner.perdido.tutor_nome, 'Teste perdidos tutor');
    const other = await (await request(`/${id}`, users.outro)).json();
    assert.equal(other.perdido.eh_autor, false);
    assert.equal(other.perdido.tutor_telefone, users.tutor.telefone);
    for (const key of ['id_usuario_tutor', 'email', 'senha_hash', 'foto']) assert.equal(key in other.perdido, false, key);
});

test('publica sem foto e a rota de foto responde 404', async () => {
    const { response, data } = await create(users.tutor, form({ especie: 'Gato', nome_animal: '' }));
    assert.equal(response.status, 201);
    assert.equal(data.perdido.tem_foto, false);
    assert.equal(data.perdido.nome_animal, null);
    assert.equal((await request(`/${data.perdido.id_perda}/foto`, users.tutor)).status, 404);
});

test('desfaz a transação e apaga a foto se o INSERT falhar depois de salvar o arquivo', async () => {
    // Sessão somente leitura: o SELECT do telefone funciona, mas o INSERT falha depois que a foto já foi gravada.
    const readOnly = await startServer({ PGOPTIONS: '-c default_transaction_read_only=on' });
    const count = await countLost();
    const files = await listPrivate();
    const { response } = await create(users.tutor, form({}, image), readOnly);
    assert.equal(response.status, 500);
    // Confirma que a falha veio do INSERT (depois de gravar a foto), não de uma etapa anterior.
    // 25006 = read_only_sql_transaction (código independe do idioma do PostgreSQL).
    assert.match(servers.at(-1).log, /INSERT[\s\S]*code: '25006'/);
    assert.equal(await countLost(), count);
    assert.deepEqual(await listPrivate(), files);
});

let editId;

test('PUT exige login e valida identificador, existência e dados sem alterar nada', async () => {
    const { data } = await create(users.tutor, form({ nome_animal: 'Para editar', raca: 'SRD', cor: 'Caramelo' }, image));
    editId = data.perdido.id_perda;
    const before = await row(editId);
    assert.equal((await edit(null, editId, form())).status, 401);
    assert.equal((await edit(users.tutor, 'abc', form())).status, 400);
    assert.equal((await edit(users.tutor, '0', form())).status, 400);
    assert.equal((await edit(users.tutor, '9223372036854775807', form())).status, 404);
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    for (const fields of [{ especie: 'Peixe' }, { local_desaparecimento: '   ' }, { data_desaparecimento: '2025-02-30' },
        { data_desaparecimento: tomorrow.toISOString().slice(0, 10) }, { genero: 'X' }, { nome_animal: 'x'.repeat(101) }]) {
        assert.equal((await edit(users.tutor, editId, form(fields))).status, 400, JSON.stringify(fields).slice(0, 60));
    }
    assert.equal((await edit(users.tutor, editId, withRemoval(form(), 'sim'))).status, 400);
    assert.equal((await edit(users.tutor, editId, form({}, Buffer.from('imagem falsa')))).status, 400);
    assert.equal((await edit(users.tutor, editId, form({}, Buffer.alloc(5 * 1024 * 1024 + 1)))).status, 413);
    assert.deepEqual(await row(editId), before);
});

test('outro usuário não edita, não troca e não remove a foto (403)', async () => {
    const before = await row(editId);
    const files = await listPrivate();
    const changed = await edit(users.outro, editId, form({ nome_animal: 'Invasor' }, jpeg));
    assert.equal(changed.status, 403);
    assert.equal((await edit(users.outro, editId, withRemoval(form()))).status, 403);
    assert.deepEqual(await row(editId), before);
    assert.deepEqual(await listPrivate(), files);
    assert.equal(await fileExists(before.foto), true);
});

test('autor edita os campos, mantém a foto e opcionais ausentes viram null', async () => {
    const before = await row(editId);
    const response = await edit(users.tutor, editId, form({ nome_animal: '  Rex  ', especie: 'Gato', genero: 'Fêmea', local_desaparecimento: 'Bairro Novo', data_desaparecimento: '2025-02-01', descricao: 'Atualizado' }));
    assert.equal(response.status, 200);
    const { mensagem, perdido } = await response.json();
    assert.ok(mensagem);
    assert.equal(perdido.nome_animal, 'Rex');
    assert.equal(perdido.especie, 'Gato');
    assert.equal(perdido.genero, 'Fêmea');
    assert.equal(perdido.data_desaparecimento, '2025-02-01');
    assert.equal(perdido.raca, null);
    assert.equal(perdido.cor, null);
    assert.equal(perdido.tem_foto, true);
    for (const key of ['foto', 'id_usuario_tutor', 'tutor_telefone']) assert.equal(key in perdido, false, key);
    const after = await row(editId);
    assert.equal(after.foto, before.foto);
    assert.equal(await fileExists(before.foto), true);
});

test('PUT ignora id_perda, id_usuario_tutor, status_perda e data_publicacao enviados', async () => {
    const before = await row(editId);
    const response = await edit(users.tutor, editId, form({ id_perda: '1', id_usuario_tutor: String(users.outro.id), status_perda: 'ENCONTRADO', data_publicacao: '2000-01-01' }));
    assert.equal(response.status, 200);
    const after = await row(editId);
    for (const key of ['id_perda', 'id_usuario_tutor', 'status_perda', 'data_publicacao', 'foto']) assert.deepEqual(after[key], before[key], key);
    assert.equal(after.status_perda, 'PERDIDO');
});

test('substitui a foto e apaga a antiga depois de gravar a nova', async () => {
    const old = (await row(editId)).foto;
    const response = await edit(users.tutor, editId, form({}, jpeg));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).perdido.tem_foto, true);
    const current = (await row(editId)).foto;
    assert.match(current, /^perda-[0-9a-f-]{36}\.jpg$/);
    assert.notEqual(current, old);
    assert.equal(await fileExists(old), false);
    assert.deepEqual(await fs.readFile(path.join(privateDir, current)), jpeg);
    const photo = await request(`/${editId}/foto`, users.outro);
    assert.equal(photo.status, 200);
    assert.equal(photo.headers.get('content-type'), 'image/jpeg');
    assert.deepEqual(Buffer.from(await photo.arrayBuffer()), jpeg);
});

test('recusa enviar nova foto e remover a atual ao mesmo tempo', async () => {
    const before = await row(editId);
    const files = await listPrivate();
    assert.equal((await edit(users.tutor, editId, withRemoval(form({}, image)))).status, 400);
    assert.deepEqual(await row(editId), before);
    assert.deepEqual(await listPrivate(), files);
});

test('remove a foto com remover_foto=true', async () => {
    const old = (await row(editId)).foto;
    const response = await edit(users.tutor, editId, withRemoval(form()));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).perdido.tem_foto, false);
    assert.equal((await row(editId)).foto, null);
    assert.equal(await fileExists(old), false);
    assert.equal((await request(`/${editId}/foto`, users.tutor)).status, 404);
});

test('falha no UPDATE depois de gravar a nova foto desfaz a transação e apaga só a nova', async () => {
    assert.equal((await edit(users.tutor, editId, form({}, image))).status, 200);
    const before = await row(editId);
    const files = await listPrivate();
    // Um lock SHARE não bloqueia o SELECT ... FOR UPDATE, mas bloqueia o UPDATE; com lock_timeout curto, o UPDATE falha.
    const lockServer = await startServer({ PGOPTIONS: '-c lock_timeout=1000' });
    const locker = await pool.connect();
    let response;
    try {
        await locker.query('BEGIN');
        await locker.query('LOCK TABLE publica_perda IN SHARE MODE');
        response = await edit(users.tutor, editId, form({ nome_animal: 'Não deve gravar' }, jpeg), lockServer);
    } finally {
        await locker.query('ROLLBACK').catch(() => {});
        locker.release();
    }
    assert.equal(response.status, 500);
    // 55P03 = lock_not_available, lançado pelo UPDATE dentro de editar.
    assert.match(servers.at(-1).log, /code: '55P03'/);
    assert.match(servers.at(-1).log, /async editar/);
    assert.deepEqual(await row(editId), before);
    assert.deepEqual(await listPrivate(), files);
    assert.equal(await fileExists(before.foto), true);
});

test('POST e PUT recusam caracteres nulos nos campos de texto (400) sem gravar nada', async () => {
    const count = await countLost();
    const files = await listPrivate();
    for (const fields of [{ nome_animal: 'Bi\0du' }, { descricao: 'coleira\0azul' }, { local_desaparecimento: 'Centro\0' }]) {
        assert.equal((await create(users.tutor, form(fields, image))).response.status, 400, Object.keys(fields)[0]);
    }
    assert.equal(await countLost(), count);
    const before = await row(editId);
    for (const fields of [{ raca: '\0' }, { cor: 'pre\0to' }, { descricao: 'x\0' }]) {
        assert.equal((await edit(users.tutor, editId, form(fields, jpeg))).status, 400, Object.keys(fields)[0]);
    }
    assert.deepEqual(await row(editId), before);
    assert.deepEqual(await listPrivate(), files);
});

let statusId;

test('PATCH de status exige login e valida identificador, existência, autor e valor', async () => {
    const { data } = await create(users.tutor, form({ nome_animal: 'Status', raca: 'SRD', descricao: 'Para status' }, image));
    statusId = data.perdido.id_perda;
    const before = await row(statusId);
    assert.equal((await patchStatus(null, statusId, { status_perda: 'ENCONTRADO' })).status, 401);
    assert.equal((await patchStatus(users.tutor, 'abc', { status_perda: 'ENCONTRADO' })).status, 400);
    assert.equal((await patchStatus(users.tutor, '9223372036854775807', { status_perda: 'ENCONTRADO' })).status, 404);
    assert.equal((await patchStatus(users.outro, statusId, { status_perda: 'ENCONTRADO' })).status, 403);
    for (const payload of [{}, { status_perda: '' }, { status_perda: 'encontrado' }, { status_perda: 'ARQUIVADO' }, { status_perda: 1 }, { status_perda: null }, { status_perda: ['ENCONTRADO'] }]) {
        assert.equal((await patchStatus(users.tutor, statusId, payload)).status, 400, JSON.stringify(payload));
    }
    const notJson = await request(`/${statusId}/status`, users.tutor, { method: 'PATCH', headers: { 'Content-Type': 'text/plain' }, body: 'ENCONTRADO' });
    assert.equal(notJson.status, 400);
    assert.deepEqual(await row(statusId), before);
});

test('autor alterna PERDIDO ↔ ENCONTRADO sem mudar outros campos, foto ou data de publicação', async () => {
    const original = await row(statusId);
    assert.equal(original.status_perda, 'PERDIDO');
    const found = await patchStatus(users.tutor, statusId, { status_perda: 'ENCONTRADO', nome_animal: 'Ignorado', id_usuario_tutor: String(users.outro.id), foto: 'outro.png' });
    assert.equal(found.status, 200);
    const body = await found.json();
    assert.ok(body.mensagem);
    assert.equal(body.perdido.status_perda, 'ENCONTRADO');
    assert.equal(body.perdido.tem_foto, true);
    assert.equal(body.perdido.nome_animal, 'Status');
    for (const key of ['foto', 'id_usuario_tutor', 'tutor_telefone']) assert.equal(key in body.perdido, false, key);
    assert.deepEqual(await row(statusId), { ...original, status_perda: 'ENCONTRADO' });
    const details = await (await request(`/${statusId}`, users.outro)).json();
    assert.equal(details.perdido.status_perda, 'ENCONTRADO');

    const same = await patchStatus(users.tutor, statusId, { status_perda: 'ENCONTRADO' });
    assert.equal(same.status, 200);
    assert.equal((await same.json()).perdido.status_perda, 'ENCONTRADO');
    assert.deepEqual(await row(statusId), { ...original, status_perda: 'ENCONTRADO' });

    const lost = await patchStatus(users.tutor, statusId, { status_perda: 'PERDIDO' });
    assert.equal(lost.status, 200);
    assert.equal((await lost.json()).perdido.status_perda, 'PERDIDO');
    assert.deepEqual(await row(statusId), original);
    assert.equal(await fileExists(original.foto), true);
    assert.equal((await request(`/${statusId}/foto`, users.outro)).status, 200);
});

const toDelete = {};

test('DELETE exige login e valida identificador, existência e autor sem apagar nada', async () => {
    for (const [key, photo] of [['comFoto', image], ['semFoto', null], ['encontrado', jpeg], ['falha', image]]) {
        const { data } = await create(users.tutor, form({ nome_animal: `Excluir ${key}` }, photo));
        toDelete[key] = data.perdido.id_perda;
    }
    assert.equal((await patchStatus(users.tutor, toDelete.encontrado, { status_perda: 'ENCONTRADO' })).status, 200);
    const before = await row(toDelete.comFoto);
    const files = await listPrivate();
    assert.equal((await remove(null, toDelete.comFoto)).status, 401);
    assert.equal((await remove(users.tutor, 'abc')).status, 400);
    assert.equal((await remove(users.tutor, '0')).status, 400);
    assert.equal((await remove(users.tutor, '9223372036854775807')).status, 404);
    const denied = await remove(users.outro, toDelete.comFoto);
    assert.equal(denied.status, 403);
    assert.ok((await denied.json()).erro);
    assert.deepEqual(await row(toDelete.comFoto), before);
    assert.deepEqual(await listPrivate(), files);
});

test('exclui publicação sem foto definitivamente', async () => {
    const files = await listPrivate();
    const response = await remove(users.tutor, toDelete.semFoto);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { mensagem: 'Publicação excluída com sucesso.' });
    assert.equal(await row(toDelete.semFoto), undefined);
    assert.equal((await request(`/${toDelete.semFoto}`, users.tutor)).status, 404);
    assert.equal((await remove(users.tutor, toDelete.semFoto)).status, 404);
    assert.deepEqual(await listPrivate(), files);
});

test('exclui publicação com foto, apaga só o arquivo dela e preserva os das outras', async () => {
    const { foto } = await row(toDelete.comFoto);
    const others = (await listPrivate()).filter(name => name !== foto);
    assert.ok(others.length >= 2);
    const response = await remove(users.tutor, toDelete.comFoto);
    assert.equal(response.status, 200);
    assert.equal(await row(toDelete.comFoto), undefined);
    assert.equal(await fileExists(foto), false);
    assert.deepEqual((await listPrivate()).sort(), others.sort());
    assert.equal((await request(`/${toDelete.comFoto}/foto`, users.tutor)).status, 404);
    assert.equal((await request(`/${statusId}/foto`, users.outro)).status, 200);
});

test('exclui publicação com status ENCONTRADO', async () => {
    const { foto, status_perda } = await row(toDelete.encontrado);
    assert.equal(status_perda, 'ENCONTRADO');
    assert.equal((await remove(users.tutor, toDelete.encontrado)).status, 200);
    assert.equal(await row(toDelete.encontrado), undefined);
    assert.equal(await fileExists(foto), false);
});

test('falha no DELETE antes do COMMIT preserva o registro e a foto', async () => {
    const before = await row(toDelete.falha);
    const files = await listPrivate();
    // Um lock SHARE não bloqueia o SELECT ... FOR UPDATE, mas bloqueia o DELETE; com lock_timeout curto, o DELETE falha.
    const lockServer = await startServer({ PGOPTIONS: '-c lock_timeout=1000' });
    const locker = await pool.connect();
    let response;
    try {
        await locker.query('BEGIN');
        await locker.query('LOCK TABLE publica_perda IN SHARE MODE');
        response = await remove(users.tutor, toDelete.falha, lockServer);
    } finally {
        await locker.query('ROLLBACK').catch(() => {});
        locker.release();
    }
    assert.equal(response.status, 500);
    assert.match(servers.at(-1).log, /code: '55P03'/);
    assert.match(servers.at(-1).log, /async excluir/);
    assert.deepEqual(await row(toDelete.falha), before);
    assert.deepEqual(await listPrivate(), files);
    assert.equal(await fileExists(before.foto), true);
    // Sem o lock, a mesma exclusão funciona normalmente.
    assert.equal((await remove(users.tutor, toDelete.falha)).status, 200);
    assert.equal(await fileExists(before.foto), false);
});
