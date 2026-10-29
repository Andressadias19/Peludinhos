const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const jwt = require('jsonwebtoken');
const pool = require('../server/config/database');

let server, base, userId, token, animal;
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nJkAAAAASUVORK5CYII=', 'base64');
function form(fields = {}, photo) {
    const body = new FormData();
    for (const [key, value] of Object.entries({ nome: 'Animal de teste', especie: 'Gato', ...fields })) body.append(key, value);
    if (photo) body.append('foto', new Blob([photo], { type: 'image/png' }), 'foto.png');
    return body;
}
const request = (url, options = {}) => fetch(base + '/api/animais' + url, { ...options, headers: { Authorization: `Bearer ${token}`, ...options.headers } });

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
    const result = await pool.query(`INSERT INTO usuario (nome,email,senha_hash,tipo_usuario) VALUES ($1,$2,$3,'usuario') RETURNING id_usuario`, ['Teste cadastro animais', `${randomUUID()}@example.invalid`, 'apenas-teste']);
    userId = result.rows[0].id_usuario;
    token = jwt.sign({ id_usuario: userId, tipo_usuario: 'usuario' }, process.env.JWT_SECRET, { expiresIn: '10m' });
});

after(async () => {
    if (userId) {
        const photos = await pool.query('SELECT foto FROM animal WHERE id_usuario_cadastrador = $1', [userId]);
        await pool.query('DELETE FROM animal WHERE id_usuario_cadastrador = $1', [userId]);
        await pool.query('DELETE FROM usuario WHERE id_usuario = $1', [userId]);
        for (const row of photos.rows) if (row.foto) await fs.unlink(path.join(__dirname, '..', 'server', 'uploads', path.basename(row.foto))).catch(() => {});
    }
    server?.kill();
    await pool.end();
});

test('cadastro e consultas exigem autenticação', async () => {
    for (const [url, method] of [['', 'GET'], ['', 'POST'], ['/1/avistamentos', 'GET']]) {
        assert.equal((await fetch(base + '/api/animais' + url, { method })).status, 401);
    }
});

test('cadastra animal com foto, id automático e validação pendente sem criar avistamento', async () => {
    const beforeCount = (await pool.query('SELECT count(*)::int AS n FROM avistamento')).rows[0].n;
    const response = await request('', { method: 'POST', body: form({ status_validacao: 'Aprovado', id_usuario_cadastrador: '999999999' }, image) });
    assert.equal(response.status, 201);
    animal = (await response.json()).animal;
    assert.match(animal.id_animal, /^[1-9]\d*$/);
    assert.equal(animal.status_validacao, 'Pendente');
    assert.equal((await pool.query('SELECT id_usuario_cadastrador FROM animal WHERE id_animal = $1', [animal.id_animal])).rows[0].id_usuario_cadastrador, userId);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM avistamento')).rows[0].n, beforeCount);
    assert.equal((await fetch(base + animal.foto)).status, 200);
});

test('lista um cadastro por animal e consulta histórico vazio', async () => {
    const list = await request(`?q=${animal.id_animal}&especie=Gato`);
    assert.equal(list.status, 200);
    const data = await list.json();
    assert.equal(typeof data.has_more, 'boolean');
    assert.equal(data.animais.filter(item => item.id_animal === animal.id_animal).length, 1);
    const found = data.animais.find(item => item.id_animal === animal.id_animal);
    assert.equal(found.total_avistamentos, 0);
    assert.equal('id_usuario_cadastrador' in found, false);
    const history = await request(`/${animal.id_animal}/avistamentos`);
    assert.equal(history.status, 200);
    assert.deepEqual((await history.json()).avistamentos, []);
    assert.equal((await request('/abc/avistamentos')).status, 400);
    assert.equal((await request('/9223372036854775807/avistamentos')).status, 404);
    assert.equal((await request('?offset=-1')).status, 400);
});

test('rejeita cadastro inválido sem gravar registros', async () => {
    const count = (await pool.query('SELECT count(*)::int AS n FROM animal WHERE id_usuario_cadastrador = $1', [userId])).rows[0].n;
    for (const body of [form({ especie: '' }), form({ nome: 'x'.repeat(101) }), form({ genero: 'inválido' }), form({}, Buffer.from('não é imagem'))]) {
        assert.equal((await request('', { method: 'POST', body })).status, 400);
    }
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM animal WHERE id_usuario_cadastrador = $1', [userId])).rows[0].n, count);
});

test('conta inativa não cadastra animal', async () => {
    await pool.query('UPDATE usuario SET ativo = FALSE WHERE id_usuario = $1', [userId]);
    assert.equal((await request('', { method: 'POST', body: form() })).status, 403);
});
