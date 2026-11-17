const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const jwt = require('jsonwebtoken');
const pool = require('../server/config/database');

let server, base;
const users = {};
const createdIds = [];
const signupEmail = `${randomUUID()}@example.invalid`;

const sign = (id, tipo = 'usuario', options = { expiresIn: '10m' }) => jwt.sign({ id_usuario: id, tipo_usuario: tipo }, process.env.JWT_SECRET, options);
const adminMe = (token, url = '/me') => fetch(`${base}/api/admin${url}`, { headers: token === undefined ? {} : { Authorization: `Bearer ${token}` } });
async function createUser(key, tipo, ativo = true) {
    const result = await pool.query(`INSERT INTO usuario (nome,email,senha_hash,tipo_usuario,ativo) VALUES ($1,$2,$3,$4,$5) RETURNING id_usuario`,
        [`Teste admin ${key}`, `${randomUUID()}@example.invalid`, 'conta-apenas-para-teste', tipo, ativo]);
    const id = result.rows[0].id_usuario;
    createdIds.push(id);
    users[key] = { id, token: sign(id, tipo) };
}
const tipoAtual = async id => (await pool.query('SELECT tipo_usuario FROM usuario WHERE id_usuario = $1', [id])).rows[0].tipo_usuario;

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
    await createUser('comum', 'usuario');
    await createUser('admin', 'administrador');
    await createUser('adminDesativado', 'administrador', false);
    await createUser('adminRebaixado', 'administrador');
});

after(async () => {
    await pool.query('DELETE FROM usuario WHERE id_usuario = ANY($1::bigint[]) OR email = $2', [createdIds, signupEmail]);
    server?.kill();
    await pool.end();
});

test('sem token recebe 401', async () => {
    assert.equal((await adminMe()).status, 401);
});

test('token inválido, expirado, de outro segredo ou de conta inexistente recebe 401', async () => {
    const expired = sign(users.admin.id, 'administrador', { expiresIn: -10 });
    const otherSecret = jwt.sign({ id_usuario: users.admin.id, tipo_usuario: 'administrador' }, 'outro-segredo', { expiresIn: '10m' });
    for (const token of ['nao-e-um-jwt', expired, otherSecret, sign('999999999999', 'administrador'), sign('abc', 'administrador')]) {
        assert.equal((await adminMe(token)).status, 401);
    }
    const basic = await fetch(`${base}/api/admin/me`, { headers: { Authorization: `Basic ${users.admin.token}` } });
    assert.equal(basic.status, 401);
});

test('usuário comum recebe 403, mesmo com tipo_usuario administrador no JWT', async () => {
    assert.equal((await adminMe(users.comum.token)).status, 403);
    assert.equal((await adminMe(sign(users.comum.id, 'administrador'))).status, 403);
    // Rotas administrativas inexistentes não são reveladas a quem não é administrador.
    assert.equal((await adminMe(users.comum.token, '/rota-inexistente')).status, 403);
});

test('administrador ativo acessa e recebe só os dados de identificação', async () => {
    const response = await adminMe(users.admin.token);
    assert.equal(response.status, 200);
    const { administrador } = await response.json();
    assert.deepEqual(Object.keys(administrador).sort(), ['id_usuario', 'nome', 'tipo_usuario']);
    assert.equal(String(administrador.id_usuario), String(users.admin.id));
    assert.equal(administrador.tipo_usuario, 'administrador');
    assert.equal((await adminMe(users.admin.token, '/rota-inexistente')).status, 404);
});

test('vale o papel do banco, não o do JWT', async () => {
    assert.equal((await adminMe(sign(users.admin.id, 'usuario'))).status, 200);
});

test('administrador desativado recebe 403', async () => {
    assert.equal((await adminMe(users.adminDesativado.token)).status, 403);
});

test('administrador rebaixado perde o acesso com o JWT antigo', async () => {
    assert.equal((await adminMe(users.adminRebaixado.token)).status, 200);
    await pool.query(`UPDATE usuario SET tipo_usuario = 'usuario' WHERE id_usuario = $1`, [users.adminRebaixado.id]);
    assert.equal((await adminMe(users.adminRebaixado.token)).status, 403);
});

test('usuário comum não consegue se promover pelo perfil', async () => {
    for (const body of [{ tipo_usuario: 'administrador' }, { nome: 'Nome Alterado', tipo_usuario: 'administrador' }]) {
        const response = await fetch(`${base}/api/usuarios/me`, { method: 'PATCH', headers: { Authorization: `Bearer ${users.comum.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        assert.equal(response.status, 400);
    }
    assert.equal(await tipoAtual(users.comum.id), 'usuario');
    assert.equal((await adminMe(users.comum.token)).status, 403);
});

test('resumo exige token e conta administradora', async () => {
    assert.equal((await adminMe(undefined, '/resumo')).status, 401);
    assert.equal((await adminMe(users.comum.token, '/resumo')).status, 403);
    assert.equal((await adminMe(users.adminDesativado.token, '/resumo')).status, 403);
});

test('resumo devolve as contagens reais do banco', async () => {
    const response = await adminMe(users.admin.token, '/resumo');
    assert.equal(response.status, 200);
    const { resumo, gerado_em } = await response.json();
    assert.ok(!Number.isNaN(Date.parse(gerado_em)));
    const count = async sql => (await pool.query(`SELECT count(*)::int AS n FROM ${sql}`)).rows[0].n;
    assert.deepEqual(resumo, {
        usuarios: {
            total: await count('usuario'),
            ativos: await count('usuario WHERE ativo'),
            administradores: await count(`usuario WHERE ativo AND tipo_usuario = 'administrador'`),
        },
        animais: {
            total: await count('animal'),
            pendentes: await count(`animal WHERE status_validacao = 'Pendente'`),
            validados: await count(`animal WHERE status_validacao = 'Validado'`),
            recusados: await count(`animal WHERE status_validacao = 'Recusado'`),
        },
        avistamentos: {
            total: await count('avistamento'),
            sem_cadastro: await count('avistamento WHERE id_animal IS NULL'),
            ultimos_30_dias: await count(`avistamento WHERE data_hora >= CURRENT_TIMESTAMP - interval '30 days'`),
        },
        desaparecimentos: {
            total: await count('publica_perda'),
            perdidos: await count(`publica_perda WHERE status_perda = 'PERDIDO'`),
            encontrados: await count(`publica_perda WHERE status_perda = 'ENCONTRADO'`),
        },
        associacoes: { pendentes: await count(`solicitacao_associacao_avistamento WHERE status_solicitacao = 'PENDENTE'`) },
    });
    // O administrador de teste entra na contagem: o número vem do banco, não de valores fixos.
    assert.ok(resumo.usuarios.administradores >= 1);
});

test('cadastro público ignora tipo_usuario e cria só usuário comum', async () => {
    const signup = await fetch(`${base}/api/usuarios`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: 'Teste admin cadastro', email: signupEmail, senha: 'senha-de-teste', tipo_usuario: 'administrador', ativo: true }) });
    assert.equal(signup.status, 201);
    const created = (await signup.json()).usuario;
    assert.equal(created.tipo_usuario, 'usuario');
    assert.equal(await tipoAtual(created.id_usuario), 'usuario');
    const login = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: signupEmail, senha: 'senha-de-teste' }) });
    assert.equal(login.status, 200);
    assert.equal((await adminMe((await login.json()).token)).status, 403);
});
