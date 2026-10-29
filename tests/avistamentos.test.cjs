const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const jwt = require('jsonwebtoken');
const pool = require('../server/config/database');

let child, base, userId, token;
const created = [];
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nJkAAAAASUVORK5CYII=', 'base64');
function form(fields = {}, photo) {
    const body = new FormData();
    for (const [key, value] of Object.entries({ nome: 'Teste avistamento', especie: 'Cachorro', latitude: '-2.443', longitude: '-54.7083', observacao: 'Perto da praça', ...fields })) body.append(key, value);
    if (photo) body.append('foto', new Blob([photo], { type: 'image/png' }), 'animal.png');
    return body;
}
function linkedForm(id, fields = {}, photo) {
    const body = form(fields, photo);
    for (const key of ['nome', 'especie', 'raca', 'cor', 'genero']) body.delete(key);
    body.append('id_animal', id);
    return body;
}
const request = (url, options = {}) => fetch(`${base}/api/avistamentos${url}`, { ...options, headers: { Authorization: `Bearer ${token}`, ...options.headers } });
async function create(body) {
    const response = await request('', { method: 'POST', body });
    const data = await response.json();
    if (response.ok) created.push(data.avistamento);
    return { response, data };
}

before(async () => {
    const socket = net.createServer();
    await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
    const port = socket.address().port;
    await new Promise(resolve => socket.close(resolve));
    base = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ['server/server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: String(port) }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Servidor de teste não iniciou.')), 15000);
        child.stdout.on('data', chunk => { if (String(chunk).includes('Servidor rodando')) { clearTimeout(timeout); resolve(); } });
        child.on('error', error => { clearTimeout(timeout); reject(error); });
        child.on('exit', code => { clearTimeout(timeout); if (code) reject(new Error(`Servidor encerrou: ${code}`)); });
    });
    const user = await pool.query(`INSERT INTO usuario (nome,email,senha_hash,tipo_usuario) VALUES ($1,$2,$3,'usuario') RETURNING id_usuario`, ['Teste temporário', `${randomUUID()}@example.invalid`, 'conta-apenas-para-teste']);
    userId = user.rows[0].id_usuario;
    token = jwt.sign({ id_usuario: userId, tipo_usuario: 'usuario' }, process.env.JWT_SECRET, { expiresIn: '10m' });
});

after(async () => {
    if (userId) {
        const photos = await pool.query('SELECT foto FROM avistamento WHERE id_usuario_autor = $1 UNION SELECT foto FROM animal WHERE id_usuario_cadastrador = $1', [userId]);
        // Remove somente os dados da conta temporária criada por este teste.
        await pool.query('DELETE FROM avistamento WHERE id_usuario_autor = $1', [userId]);
        await pool.query('DELETE FROM animal WHERE id_usuario_cadastrador = $1', [userId]);
        await pool.query('DELETE FROM usuario WHERE id_usuario = $1', [userId]);
        for (const row of photos.rows) if (row.foto) await fs.unlink(path.join(__dirname, '..', 'server', 'uploads', path.basename(row.foto))).catch(() => {});
    }
    child?.kill();
    await pool.end();
});

test('exige login para consultar e publicar', async () => {
    for (const method of ['GET', 'POST']) {
        const response = await fetch(`${base}/api/avistamentos`, { method });
        assert.equal(response.status, 401);
    }
});

test('rejeita coordenadas inválidas, espécie ausente e imagem falsa sem gravar registros', async () => {
    const before = await pool.query('SELECT count(*)::int AS n FROM animal WHERE id_usuario_cadastrador = $1', [userId]);
    for (const fields of [{ latitude: '91' }, { longitude: '-181' }, { latitude: '' }, { latitude: 'NaN' }, { especie: '' }, { nome: 'x'.repeat(101) }]) {
        assert.equal((await create(form(fields))).response.status, 400);
    }
    assert.equal((await create(form({}, Buffer.from('imagem falsa')))).response.status, 400);
    assert.equal((await create(form({}, Buffer.alloc(5 * 1024 * 1024 + 1)))).response.status, 413);
    const after = await pool.query('SELECT count(*)::int AS n FROM animal WHERE id_usuario_cadastrador = $1', [userId]);
    assert.equal(after.rows[0].n, before.rows[0].n);
});

test('cadastro próprio gera identificação pendente sem criar avistamento e usa o autor autenticado', async () => {
    const countBefore = (await pool.query('SELECT count(*)::int AS n FROM avistamento')).rows[0].n;
    const body = new FormData();
    Object.entries({ nome: 'Nina <script>alert(1)</script>', especie: 'Gato', status_validacao: 'Aprovado', id_usuario_cadastrador: '999999999' }).forEach(([k, v]) => body.append(k, v));
    body.append('foto', new Blob([image], { type: 'image/png' }), 'animal.png');
    const result = await fetch(`${base}/api/animais`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body });
    assert.equal(result.status, 201);
    const animal = (await result.json()).animal;
    assert.match(animal.id_animal, /^[1-9]\d*$/);
    assert.equal(animal.status_validacao, 'Pendente');
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM avistamento')).rows[0].n, countBefore);
    const emptyHistory = await fetch(`${base}/api/animais/${animal.id_animal}/avistamentos`, { headers: { Authorization: `Bearer ${token}` } });
    assert.deepEqual((await emptyHistory.json()).avistamentos, []);
    const { response, data } = await create(linkedForm(animal.id_animal, { estado_saude: 'Aparenta estar bem', id_usuario_autor: '999999999' }, image));
    assert.equal(response.status, 201);
    const item = data.avistamento;
    assert.equal(item.nome, 'Nina <script>alert(1)</script>');
    assert.equal(item.latitude, -2.443);
    assert.equal(item.longitude, -54.7083);
    assert.match(item.foto, /^\/uploads\/avistamento-[a-f0-9-]+\.png$/);
    const imageResponse = await fetch(base + item.foto);
    assert.equal(imageResponse.status, 200);
    assert.deepEqual(Buffer.from(await imageResponse.arrayBuffer()), image);
    const details = await request('/' + item.id_avistamento);
    assert.equal(details.status, 200);
    assert.equal((await details.json()).avistamento.estado_saude, 'Aparenta estar bem');
    const db = await pool.query(`SELECT a.id_usuario_cadastrador, v.id_usuario_autor, a.foto FROM animal a JOIN avistamento v USING (id_animal) WHERE v.id_avistamento = $1`, [item.id_avistamento]);
    assert.equal(db.rows[0].id_usuario_autor, userId);
    assert.equal(db.rows[0].id_usuario_cadastrador, userId);
    assert.equal(db.rows[0].foto, animal.foto);
    assert.notEqual(db.rows[0].foto, item.foto);
});

test('publica não identificado sem foto, não cria animal e aparece na listagem e detalhes', async () => {
    const animalCount = (await pool.query('SELECT count(*)::int AS n FROM animal')).rows[0].n;
    const { response, data } = await create(form({ nome: '', especie: 'Outro' }));
    assert.equal(response.status, 201);
    assert.equal(data.avistamento.foto, null);
    assert.equal(data.avistamento.id_animal, null);
    assert.equal(data.avistamento.especie, 'Outro');
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM animal')).rows[0].n, animalCount);
    const detail = await request('/' + data.avistamento.id_avistamento);
    assert.equal(detail.status, 200);
    assert.equal((await detail.json()).avistamento.id_animal, null);
    const list = await request('?limit=1');
    assert.equal(list.status, 200);
    assert.equal((await list.json()).avistamentos[0].id_avistamento, data.avistamento.id_avistamento);
    assert.equal((await request('?limit=0')).status, 400);
    assert.equal((await request('/abc')).status, 400);
    assert.equal((await request('/9223372036854775807')).status, 404);
});

test('reutiliza um animal e preserva cadastro, fotos e saúde de cada ocorrência', async () => {
    const original = created[0];
    const animalBefore = (await pool.query('SELECT * FROM animal WHERE id_animal = $1', [original.id_animal])).rows[0];
    const countBefore = (await pool.query('SELECT count(*)::int AS n FROM animal')).rows[0].n;
    const body = form({ estado_saude: 'Mancando', longitude: '-54.71' }, image);
    body.delete('nome'); body.delete('especie'); body.append('id_animal', original.id_animal);
    const result = await create(body);
    assert.equal(result.response.status, 201);
    assert.equal(result.data.avistamento.id_animal, original.id_animal);
    assert.equal(result.data.avistamento.estado_saude, 'Mancando');
    assert.notEqual(result.data.avistamento.foto, original.foto);
    const noHealth = form();
    noHealth.delete('nome'); noHealth.delete('especie'); noHealth.append('id_animal', original.id_animal);
    const next = await create(noHealth);
    assert.equal(next.response.status, 201);
    assert.equal(next.data.avistamento.estado_saude, null);
    assert.equal(next.data.avistamento.foto, null);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM animal')).rows[0].n, countBefore);
    assert.deepEqual((await pool.query('SELECT * FROM animal WHERE id_animal = $1', [original.id_animal])).rows[0], animalBefore);
    assert.equal((await (await request('/' + original.id_avistamento)).json()).avistamento.estado_saude, 'Aparenta estar bem');
    const history = await fetch(`${base}/api/animais/${original.id_animal}/avistamentos`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(history.status, 200);
    const items = (await history.json()).avistamentos;
    assert.deepEqual(items.map(item => item.id_avistamento), [next.data.avistamento.id_avistamento, result.data.avistamento.id_avistamento, original.id_avistamento]);
    const healthRow = await pool.query('SELECT estado_saude FROM animal WHERE id_animal = $1', [original.id_animal]);
    assert.equal(healthRow.rows[0].estado_saude, null);
});

test('consulta de animais exige login e busca por identificação sem dados privados', async () => {
    assert.equal((await fetch(`${base}/api/animais`)).status, 401);
    assert.equal((await fetch(`${base}/api/animais/${created[0].id_animal}/avistamentos`)).status, 401);
    const response = await fetch(`${base}/api/animais?q=${created[0].id_animal}`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(response.status, 200);
    const found = (await response.json()).animais.find(item => item.id_animal === created[0].id_animal);
    assert.ok(found);
    assert.equal(found.total_avistamentos, 3);
    assert.equal('id_usuario_cadastrador' in found, false);
    assert.equal('estado_saude' in found, false);
});

test('animal inexistente ou inválido não cria ocorrência nem novo animal', async () => {
    const countBefore = (await pool.query('SELECT count(*)::int AS n FROM avistamento')).rows[0].n;
    for (const [id, status] of [['0', 400], ['abc', 400], ['9223372036854775808', 400], ['9223372036854775807', 404]]) {
        const body = form(); body.delete('nome'); body.delete('especie'); body.append('id_animal', id);
        assert.equal((await create(body)).response.status, status);
    }
    // Não aceita editar características por meio de um avistamento.
    assert.equal((await create(form({ id_animal: created[0].id_animal }))).response.status, 400);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM avistamento')).rows[0].n, countBefore);
    const response = await fetch(`${base}/api/animais/9223372036854775807/avistamentos`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(response.status, 404);
});

test('cadastro próprio valida dados, imagem e autenticação sem gravar em falhas', async () => {
    assert.equal((await fetch(`${base}/api/animais`, { method: 'POST', body: form() })).status, 401);
    const countBefore = (await pool.query('SELECT count(*)::int AS n FROM animal')).rows[0].n;
    for (const [body, status] of [[form({ especie: '' }), 400], [form({ genero: 'invalido' }), 400], [form({ nome: 'x'.repeat(101) }), 400], [form({}, Buffer.from('imagem falsa')), 400], [form({}, Buffer.alloc(5 * 1024 * 1024 + 1)), 413]]) {
        const result = await fetch(`${base}/api/animais`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body });
        assert.equal(result.status, status);
    }
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM animal')).rows[0].n, countBefore);
});

test('relatos não identificados semelhantes não criam nem unem cadastros, inclusive com foto', async () => {
    const countBefore = (await pool.query('SELECT count(*)::int AS n FROM animal')).rows[0].n;
    const first = await create(form({ nome: 'Caramelo', estado_saude: 'Bem' }, image));
    const second = await create(form({ nome: 'Caramelo', estado_saude: 'Mancando' }));
    assert.equal(first.response.status, 201);
    assert.equal(second.response.status, 201);
    assert.equal(first.data.avistamento.id_animal, null);
    assert.equal(second.data.avistamento.id_animal, null);
    assert.notEqual(first.data.avistamento.id_avistamento, second.data.avistamento.id_avistamento);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM animal')).rows[0].n, countBefore);
    assert.equal((await fetch(base + first.data.avistamento.foto)).status, 200);
});

test('histórico conserva características da ocorrência se o cadastro mudar e migrações podem ser repetidas', async () => {
    const item = created[0];
    await pool.query('UPDATE animal SET cor = $1, estado_saude = $2 WHERE id_animal = $3', ['Cor atualizada', 'Saúde antiga do cadastro', item.id_animal]);
    const before = (await pool.query('SELECT * FROM avistamento WHERE id_usuario_autor = $1 ORDER BY id_avistamento', [userId])).rows;
    for (const file of ['001_saude_avistamento.sql', '002_avistamento_sem_cadastro.sql']) {
        await pool.query(await fs.readFile(path.join(__dirname, '..', 'database', 'migrations', file), 'utf8'));
    }
    assert.deepEqual((await pool.query('SELECT * FROM avistamento WHERE id_usuario_autor = $1 ORDER BY id_avistamento', [userId])).rows, before);
    const detail = (await (await request('/' + item.id_avistamento)).json()).avistamento;
    assert.equal(detail.cor, item.cor);
    assert.equal(detail.estado_saude, 'Aparenta estar bem');
});

test('conta desativada não publica mesmo com token válido', async () => {
    // O mesmo bloqueio vale para cadastro próprio e avistamento vinculado.
    await pool.query('UPDATE usuario SET ativo = FALSE WHERE id_usuario = $1', [userId]);
    assert.equal((await create(form())).response.status, 403);
    assert.equal((await create(linkedForm(created[0].id_animal))).response.status, 403);
    const response = await fetch(`${base}/api/animais`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form() });
    assert.equal(response.status, 403);
});
