const { pastasDeUpload, bancoDeTeste, protegerPool } = require('./helpers/bancoLocal.cjs');
// Comprova o isolamento do ambiente de testes: banco exclusivo, bloqueios e pastas de fotos próprias.
// Os bloqueios acontecem antes de qualquer conexão; este arquivo nunca conecta ao banco de desenvolvimento.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const pool = require('../server/config/database');
const { validarAmbienteDeTeste, conferirBancoConectado, MARCADOR_DO_BANCO } = require('./helpers/regrasAmbienteTeste.cjs');
const { lerPastasDeUpload, PASTA_PUBLICA_PADRAO, PASTA_PRIVADA_PADRAO } = require('../server/config/uploadsConfig');

const raiz = path.join(__dirname, '..');
const senhaRemota = 'S3nh@Rem0ta#Teste';
const urlRemota = `postgresql://postgres.abcdefgh:${encodeURIComponent(senhaRemota)}@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`;
const dev = { DB_HOST: 'localhost', DB_USER: 'postgres', DB_NAME: 'peludinhos', JWT_SECRET: 'segredo-de-desenvolvimento' };
const valido = {
    DB_HOST: 'localhost', DB_PORT: '5432', DB_USER: 'peludinhos_test_user', DB_PASSWORD: 'senha-local-teste', DB_NAME: 'peludinhos_test',
    JWT_SECRET: 'segredo-apenas-de-teste', UPLOADS_DIR: 'tests/tmp/uploads', UPLOADS_PRIVATE_DIR: 'tests/tmp/uploads-perdidos'
};
function recusa(variaveis, motivo, desenvolvimento = dev) {
    assert.throws(() => validarAmbienteDeTeste(variaveis, desenvolvimento), erro => {
        assert.match(erro.message, /^Testes bloqueados:/);
        assert.match(erro.message, motivo);
        assert.ok(!erro.message.includes(senhaRemota) && !erro.message.includes(valido.DB_PASSWORD), 'a mensagem não pode expor senhas');
        return true;
    });
}
const pastaTemporaria = fs.mkdtempSync(path.join(os.tmpdir(), 'peludinhos-isolamento-'));
let numeroDoArquivo = 0;
// Suíte real em processo novo, com ambiente mínimo: não herda o .env.test já carregado neste processo.
function executarSuiteCom(variaveis) {
    const arquivo = path.join(pastaTemporaria, `${++numeroDoArquivo}.env`);
    fs.writeFileSync(arquivo, Object.entries(variaveis).map(([nome, valor]) => `${nome}=${valor}`).join('\n'));
    return spawnSync(process.execPath, ['--test', 'tests/animais.test.cjs'], { cwd: raiz, env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ARQUIVO_ENV_TESTE: arquivo }, encoding: 'utf8', timeout: 60000 });
}
// server/server.js iniciado como as suítes o iniciam (herdando o ambiente), mas com variáveis adulteradas.
function servidorCom(alteracoes) {
    return new Promise(resolve => {
        const filho = spawn(process.execPath, ['server/server.js'], { cwd: raiz, env: { ...process.env, PORT: '0', ...alteracoes }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        let saida = '';
        filho.stdout.on('data', parte => { saida += parte; });
        filho.stderr.on('data', parte => { saida += parte; });
        const limite = setTimeout(() => filho.kill(), 15000);
        filho.on('exit', codigo => { clearTimeout(limite); resolve({ codigo, saida }); });
    });
}
const mesmaPasta = (a, b) => path.relative(path.resolve(a), path.resolve(b)) === '';

after(async () => {
    fs.rmSync(pastaTemporaria, { recursive: true, force: true });
    await pool.end();
});

test('regras do .env.test: aceita só um banco local exclusivo de testes, com usuário, segredo e pastas próprios', () => {
    assert.equal(validarAmbienteDeTeste(valido, dev).banco, 'peludinhos_test');
    // banco de desenvolvimento (pelo nome fixo, pelo .env e pela DATABASE_URL do .env)
    recusa({ ...valido, DB_NAME: 'peludinhos' }, /O banco peludinhos não pode ser usado/);
    recusa({ ...valido, DB_NAME: 'outro_test' }, /mesmo banco do \.env de desenvolvimento/, { ...dev, DB_NAME: 'outro_test' });
    recusa({ ...valido, DB_NAME: 'outro_test' }, /mesmo banco da DATABASE_URL/, { ...dev, DATABASE_URL: 'postgresql://u:p@localhost:5432/outro_test' });
    recusa({ ...valido, DB_NAME: 'peludinhos_dev' }, /DB_NAME precisa terminar em _test/);
    recusa({ ...valido, DB_NAME: 'postgres' }, /não pode ser usado/);
    // bancos remotos (futuro Supabase de produção)
    recusa({ ...valido, DATABASE_URL: urlRemota, DATABASE_SSL: 'true' }, /DATABASE_URL não é aceita nos testes/);
    for (const host of ['db.abcdefgh.supabase.co', 'aws-0-sa-east-1.pooler.supabase.com', '192.168.0.10', 'localhost.exemplo.com']) {
        recusa({ ...valido, DB_HOST: host }, /DB_HOST não aponta para um PostgreSQL local/);
    }
    // usuário e segredo exclusivos
    recusa({ ...valido, DB_USER: 'postgres' }, /usuário PostgreSQL exclusivo/);
    recusa({ ...valido, DB_USER: 'dev_user' }, /usuário PostgreSQL exclusivo/, { ...dev, DB_USER: 'dev_user' });
    recusa({ ...valido, JWT_SECRET: dev.JWT_SECRET }, /JWT_SECRET de testes precisa ser diferente/);
    // tudo obrigatório, inclusive as pastas de fotos
    recusa({ ...valido, DB_NAME: '', UPLOADS_DIR: ' ' }, /Defina DB_NAME, UPLOADS_DIR/);
});

test('regras do .env.test: as pastas de fotos de teste nunca coincidem com as reais', () => {
    const reais = /não pode ser, conter nem ficar dentro das pastas reais/;
    recusa({ ...valido, UPLOADS_DIR: 'server/uploads' }, reais);
    // No Windows, maiúsculas e minúsculas indicam a mesma pasta.
    if (process.platform === 'win32') recusa({ ...valido, UPLOADS_DIR: PASTA_PUBLICA_PADRAO.toUpperCase() }, reais);
    recusa({ ...valido, UPLOADS_DIR: 'server/uploads/teste' }, reais);
    recusa({ ...valido, UPLOADS_PRIVATE_DIR: 'server/uploads-perdidos' }, reais);
    recusa({ ...valido, UPLOADS_PRIVATE_DIR: 'server' }, reais);
    recusa({ ...valido, UPLOADS_DIR: '.' }, reais);
    recusa({ ...valido, UPLOADS_PRIVATE_DIR: 'tests/tmp/uploads' }, /pastas diferentes/);
    recusa({ ...valido, UPLOADS_PRIVATE_DIR: 'tests/tmp/uploads/privadas' }, /pastas diferentes/);
});

test('banco conectado: nome, marcador e usuário sem privilégios são conferidos antes de qualquer consulta', async () => {
    const esperado = { banco: 'peludinhos_test' };
    const certo = { banco: 'peludinhos_test', usuario: 'peludinhos_test_user', superusuario: false, marcador: MARCADOR_DO_BANCO };
    assert.doesNotThrow(() => conferirBancoConectado(certo, esperado));
    assert.throws(() => conferirBancoConectado({ ...certo, banco: 'peludinhos' }, esperado), /conectado ao banco peludinhos, mas o esperado era peludinhos_test/);
    assert.throws(() => conferirBancoConectado({ ...certo, marcador: null }, esperado), /não tem o marcador de testes/);
    assert.throws(() => conferirBancoConectado({ ...certo, superusuario: true }, esperado), /é superusuário/);
    assert.throws(() => conferirBancoConectado(undefined, esperado), /não foi possível identificar/);

    // Pool protegido: se a verificação falhar, query e connect (inclusive com callback) não chegam ao banco.
    let chamadasAoBanco = 0;
    let verificacoes = 0;
    const falso = { query: async () => { chamadasAoBanco++; }, connect: async () => { chamadasAoBanco++; return { release() {} }; } };
    protegerPool(falso, async () => { verificacoes++; throw new Error('Testes bloqueados: banco errado'); });
    await assert.rejects(falso.query('DELETE FROM usuario'), /Testes bloqueados/);
    await assert.rejects(falso.connect(), /Testes bloqueados/);
    await new Promise(resolve => falso.connect(erro => { assert.match(erro.message, /Testes bloqueados/); resolve(); }));
    await new Promise(resolve => falso.query('SELECT 1', erro => { assert.match(erro.message, /Testes bloqueados/); resolve(); }));
    assert.equal(chamadasAoBanco, 0);
    assert.equal(verificacoes, 1, 'a verificação roda uma vez e o resultado vale para todas as chamadas');
});

test('o banco efetivamente conectado é o de testes, com usuário exclusivo e sem privilégios especiais', async () => {
    const { rows: [banco] } = await pool.query(`SELECT current_database() AS nome, current_user AS usuario, r.rolsuper, r.rolcreatedb, r.rolcreaterole,
        r.rolreplication, r.rolbypassrls, shobj_description(d.oid, 'pg_database') AS marcador, pg_get_userbyid(d.datdba) AS dono,
        (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = 'peludinhos') AS dono_do_desenvolvimento,
        (SELECT count(*)::int FROM pg_auth_members m WHERE m.member = r.oid) AS papeis_herdados
        FROM pg_database d JOIN pg_roles r ON r.rolname = current_user WHERE d.datname = current_database()`);
    assert.equal(banco.nome, bancoDeTeste);
    assert.equal(banco.nome, 'peludinhos_test');
    assert.equal(banco.marcador, MARCADOR_DO_BANCO);
    assert.equal(banco.usuario, process.env.DB_USER);
    assert.notEqual(banco.usuario, 'postgres');
    assert.equal(banco.dono, banco.usuario, 'o usuário de testes é dono só do banco de testes');
    assert.notEqual(banco.dono_do_desenvolvimento, banco.usuario);
    assert.deepEqual([banco.rolsuper, banco.rolcreatedb, banco.rolcreaterole, banco.rolreplication, banco.rolbypassrls], [false, false, false, false, false]);
    assert.equal(banco.papeis_herdados, 0);
});

test('suítes configuradas para o banco de desenvolvimento ou para bancos remotos não chegam a executar', () => {
    for (const [variaveis, motivo] of [
        [{ ...valido, DB_NAME: 'peludinhos' }, /O banco peludinhos não pode ser usado/],
        [{ ...valido, DB_USER: 'postgres' }, /usuário PostgreSQL exclusivo/],
        [{ ...valido, DATABASE_URL: urlRemota, DATABASE_SSL: 'true' }, /DATABASE_URL não é aceita/],
        [{ ...valido, DB_HOST: 'db.abcdefgh.supabase.co' }, /DB_HOST não aponta para um PostgreSQL local/],
        [{ ...valido, UPLOADS_DIR: 'server/uploads' }, /pastas reais de fotos/]
    ]) {
        const resultado = executarSuiteCom(variaveis);
        const saida = resultado.stdout + resultado.stderr;
        assert.notEqual(resultado.status, 0);
        assert.match(saida, /Testes bloqueados/);
        assert.match(saida, motivo);
        assert.doesNotMatch(saida, /✔/, 'nenhum teste da suíte pode ter sido executado');
        assert.ok(!saida.includes(senhaRemota) && !saida.includes(encodeURIComponent(senhaRemota)));
    }
});

test('servidores iniciados pelos testes recusam variáveis que apontem para fora do ambiente de testes', async () => {
    assert.match(process.env.NODE_OPTIONS, /bancoLocal\.cjs/, 'todo processo Node filho carrega o bloqueio');
    for (const [alteracao, motivo] of [
        [{ DB_NAME: 'peludinhos' }, /O banco peludinhos não pode ser usado/],
        [{ DB_USER: 'postgres' }, /usuário PostgreSQL exclusivo/],
        [{ DB_HOST: 'db.abcdefgh.supabase.co' }, /DB_HOST não aponta para um PostgreSQL local/],
        [{ DATABASE_URL: urlRemota }, /DATABASE_URL não é aceita/],
        [{ UPLOADS_DIR: 'server/uploads' }, /pastas reais de fotos/]
    ]) {
        const { codigo, saida } = await servidorCom(alteracao);
        assert.notEqual(codigo, 0, JSON.stringify(alteracao));
        assert.match(saida, /Testes bloqueados/);
        assert.match(saida, motivo);
        assert.doesNotMatch(saida, /Servidor rodando/);
    }
});

test('fotos de teste ficam em pastas próprias, públicas e privadas separadas, também no servidor iniciado pelos testes', () => {
    assert.ok(mesmaPasta(pastasDeUpload.publica, path.join(raiz, 'tests', 'tmp', 'uploads')), pastasDeUpload.publica);
    assert.ok(mesmaPasta(pastasDeUpload.privada, path.join(raiz, 'tests', 'tmp', 'uploads-perdidos')), pastasDeUpload.privada);
    assert.ok(fs.statSync(pastasDeUpload.publica).isDirectory() && fs.statSync(pastasDeUpload.privada).isDirectory());
    // O que o servidor usa de fato (mesmo módulo que app.js e os controllers carregam), num processo filho.
    const filho = spawnSync(process.execPath, ['-e', "const u = require('./server/config/uploadsConfig'); console.log(JSON.stringify([u.pastaPublica, u.pastaPrivada]))"], { cwd: raiz, env: process.env, encoding: 'utf8' });
    assert.equal(filho.status, 0, filho.stderr);
    const [publica, privada] = JSON.parse(filho.stdout.trim().split('\n').at(-1));
    assert.ok(mesmaPasta(publica, pastasDeUpload.publica) && mesmaPasta(privada, pastasDeUpload.privada));
    assert.ok(!mesmaPasta(publica, PASTA_PUBLICA_PADRAO) && !mesmaPasta(privada, PASTA_PRIVADA_PADRAO));
    // Fora dos testes, os padrões continuam sendo as pastas reais; e a privada nunca pode ficar exposta em /uploads.
    assert.deepEqual(lerPastasDeUpload({}), { publica: PASTA_PUBLICA_PADRAO, privada: PASTA_PRIVADA_PADRAO });
    assert.throws(() => lerPastasDeUpload({ UPLOADS_DIR: 'fotos', UPLOADS_PRIVATE_DIR: 'fotos' }), /Configuração das pastas de fotos inválida/);
    assert.throws(() => lerPastasDeUpload({ UPLOADS_DIR: 'fotos', UPLOADS_PRIVATE_DIR: 'fotos/privadas' }), /Configuração das pastas de fotos inválida/);
    assert.throws(() => lerPastasDeUpload({ UPLOADS_DIR: 'fotos/publicas', UPLOADS_PRIVATE_DIR: 'fotos' }), /Configuração das pastas de fotos inválida/);
});

test('o ambiente alternativo do Supabase real (--arquivo-env) é recusado no ambiente de testes', () => {
    // Mesmo com um arquivo que exista, nada dele é carregado: o bloqueio vem antes.
    const resultado = spawnSync(process.execPath, ['server/server.js', '--arquivo-env=.env.supabase.local.example'],
        { cwd: raiz, env: { ...process.env, PORT: '0' }, encoding: 'utf8', timeout: 15000 });
    assert.notEqual(resultado.status, 0);
    assert.match(resultado.stderr, /Testes bloqueados: a opção --arquivo-env \(ambiente do Supabase real\) não pode ser usada nos testes/);
    assert.doesNotMatch(resultado.stdout, /Servidor rodando/);
});
