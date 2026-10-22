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
        const photos = await pool.query('SELECT foto FROM avistamento WHERE id_usuario_autor = $1', [userId]);
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

test('salva animal, avistamento e foto, consulta detalhes e usa o autor do token', async () => {
    const { response, data } = await create(form({ nome: 'Nina <script>alert(1)</script>', especie: 'Gato', estado_saude: 'Aparenta estar bem', id_usuario_autor: '999999999' }, image));
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
    assert.equal(db.rows[0].foto, item.foto);
});

test('permite publicação sem foto e ordena a listagem pela mais recente', async () => {
    const { response, data } = await create(form({ nome: '', especie: 'Outro' }));
    assert.equal(response.status, 201);
    assert.equal(data.avistamento.foto, null);
    const list = await request('?limit=1');
    assert.equal(list.status, 200);
    assert.equal((await list.json()).avistamentos[0].id_avistamento, data.avistamento.id_avistamento);
    assert.equal((await request('?limit=0')).status, 400);
    assert.equal((await request('/abc')).status, 400);
    assert.equal((await request('/9223372036854775807')).status, 404);
});

test('conta desativada não publica mesmo com token válido', async () => {
    await pool.query('UPDATE usuario SET ativo = FALSE WHERE id_usuario = $1', [userId]);
    assert.equal((await create(form())).response.status, 403);
});
