const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const bcrypt = require('bcrypt');
const pool = require('../server/config/database');

const tag = randomUUID().slice(0, 8);
let server, base;
const json = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const signup = email => fetch(`${base}/api/usuarios`, json({ nome: 'Teste Segurança', email, senha: 'senha-de-teste', telefone: '93991234567' }));
const login = (email, senha = 'senha-de-teste') => fetch(`${base}/api/login`, json({ email, senha }));
// Resposta de erro sem detalhes internos: JSON, sem pilha, caminhos ou bibliotecas, sem X-Powered-By.
async function assertCleanError(response, status) {
    assert.equal(response.status, status);
    assert.equal(response.headers.get('x-powered-by'), null);
    assert.match(response.headers.get('content-type'), /application\/json/);
    const text = await response.text();
    const body = JSON.parse(text);
    assert.equal(typeof body.erro, 'string');
    for (const leak of ['node_modules', 'SyntaxError', ' at ', 'C:\\', '/Users/', 'body-parser', 'stack']) assert.ok(!text.includes(leak), `vazou "${leak}"`);
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
});

after(async () => {
    await pool.query(`DELETE FROM usuario WHERE lower(email) LIKE $1`, [`%-${tag}@example.invalid`]);
    server?.kill();
    await pool.end();
});

test('JSON malformado recebe 400 em JSON, sem detalhes internos', async () => {
    for (const url of ['/api/login', '/api/usuarios', '/api/admin/usuarios/1']) {
        await assertCleanError(await fetch(base + url, json('{"email":')), 400);
    }
    const body = await (await fetch(`${base}/api/login`, json('{ quebrado'))).json();
    assert.equal(body.erro, 'O corpo da requisição não é um JSON válido.');
});

test('outros erros do Express também respondem em JSON e sem X-Powered-By', async () => {
    await assertCleanError(await fetch(`${base}/api/login`, json(`{"email":"${'x'.repeat(200 * 1024)}"}`)), 413);
    await assertCleanError(await fetch(`${base}/%E0%A4%A`), 400);
    for (const url of ['/api', '/api/rota-inexistente', '/mapa']) {
        assert.equal((await fetch(base + url)).headers.get('x-powered-by'), null, url);
    }
});

test('códigos de erro das rotas existentes continuam os mesmos', async () => {
    assert.equal((await fetch(`${base}/api/rota-inexistente`)).status, 404);
    assert.equal((await fetch(`${base}/api/usuarios/me`)).status, 401);
    assert.equal((await login('ninguem@example.invalid')).status, 401);
    assert.equal((await fetch(`${base}/api/login`, json({}))).status, 400);
    assert.equal((await fetch(`${base}/api/login`, { method: 'POST' })).status, 400);
});

test('cadastro grava o e-mail em minúsculas e recusa o mesmo e-mail com outra grafia', async () => {
    const email = `Ana.Teste-${tag}@Example.INVALID`;
    const created = await signup(`  ${email}  `);
    assert.equal(created.status, 201);
    assert.equal((await created.json()).usuario.email, email.toLowerCase());
    for (const variant of [email.toUpperCase(), email.toLowerCase(), ` ${email} `]) {
        const duplicate = await signup(variant);
        assert.equal(duplicate.status, 409, variant);
        assert.equal((await duplicate.json()).erro, 'Este e-mail já está cadastrado.');
    }
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM usuario WHERE lower(email) = $1', [email.toLowerCase()])).rows[0].n, 1);
});

test('login ignora maiúsculas e espaços no e-mail', async () => {
    const email = `login-${tag}@example.invalid`;
    assert.equal((await signup(email)).status, 201);
    for (const variant of [email, email.toUpperCase(), `  Login-${tag}@Example.Invalid `]) {
        const response = await login(variant);
        assert.equal(response.status, 200, variant);
        assert.ok((await response.json()).token);
    }
    assert.equal((await login(email.toUpperCase(), 'senha-errada')).status, 401);
});

test('conta antiga gravada com maiúsculas continua entrando e bloqueia a mesma grafia em minúsculas', async () => {
    const legacy = `Antiga-${tag}@Example.Invalid`;
    await pool.query(`INSERT INTO usuario (nome,email,senha_hash,tipo_usuario) VALUES ('Conta antiga', $1, $2, 'usuario')`, [legacy, await bcrypt.hash('senha-de-teste', 10)]);
    assert.equal((await login(legacy)).status, 200);
    assert.equal((await login(legacy.toLowerCase())).status, 200);
    assert.equal((await signup(legacy.toLowerCase())).status, 409);
});
