// Testa a configuração do banco sem abrir nenhuma conexão (não precisa de PostgreSQL rodando).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { Pool } = require('pg');
const ConnectionParameters = require('pg/lib/connection-parameters');
const { montarConfiguracao, ehBancoLocal, descreverErro, tratarErroDeConexaoOciosa, POOL_MAX_PADRAO, TEMPO_LIMITE_CONEXAO_PADRAO } = require('../server/config/databaseConfig');

const raiz = path.join(__dirname, '..');
const local = { DB_HOST: 'localhost', DB_PORT: '5432', DB_USER: 'postgres', DB_PASSWORD: 'senha-local-teste', DB_NAME: 'peludinhos' };
const senhaRemota = 'S3nh@Rem0ta#Teste';
const urlRemota = `postgresql://postgres.abcdefgh:${encodeURIComponent(senhaRemota)}@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`;
const pem = '-----BEGIN CERTIFICATE-----\nMIIBteste\n-----END CERTIFICATE-----\n';
const erroDe = env => { try { montarConfiguracao(env); } catch (error) { return error.message; } assert.fail('deveria recusar a configuração'); };

test('variáveis DB_* continuam funcionando como antes, sem SSL e com o limite padrão de conexões', () => {
    const config = montarConfiguracao(local);
    assert.deepEqual(config, { host: 'localhost', port: 5432, user: 'postgres', password: 'senha-local-teste', database: 'peludinhos', ssl: false, max: POOL_MAX_PADRAO, connectionTimeoutMillis: TEMPO_LIMITE_CONEXAO_PADRAO });
    assert.equal(POOL_MAX_PADRAO, 10);
    assert.equal(TEMPO_LIMITE_CONEXAO_PADRAO, 10000);
    // Sem DB_PORT, a pg usa a porta padrão (5432), como no código anterior.
    assert.equal('port' in montarConfiguracao({ ...local, DB_PORT: '' }), false);
    // Senha vazia é aceita (autenticação trust/peer em instalações locais).
    assert.equal(montarConfiguracao({ ...local, DB_PASSWORD: undefined }).password, undefined);
});

test('DATABASE_URL tem prioridade sobre as variáveis DB_*', () => {
    const config = montarConfiguracao({ ...local, DATABASE_URL: urlRemota, DATABASE_SSL: 'true' });
    assert.equal(config.connectionString, urlRemota);
    assert.equal(config.host, undefined);
    assert.equal(config.password, undefined);
    assert.equal(montarConfiguracao({ DATABASE_URL: 'postgres://u:p@localhost/peludinhos' }).connectionString, 'postgres://u:p@localhost/peludinhos');
});

test('variáveis ausentes ou inválidas impedem a configuração, listando o que corrigir sem mostrar valores', () => {
    assert.match(erroDe({}), /Defina DATABASE_URL ou as variáveis DB_HOST, DB_USER, DB_NAME/);
    assert.match(erroDe({ ...local, DB_NAME: '  ' }), /DB_NAME/);
    for (const porta of ['0', '70000', 'abc', '54.3']) assert.match(erroDe({ ...local, DB_PORT: porta }), /DB_PORT deve ser um número inteiro entre 1 e 65535/);
    for (const url of ['nao-e-url', 'mysql://u:p@host/banco', 'postgresql://u:p@host', 'postgresql://u:p@host/']) {
        const mensagem = erroDe({ DATABASE_URL: url });
        assert.match(mensagem, /DATABASE_URL/);
        assert.ok(!mensagem.includes('u:p@'), 'a mensagem não pode repetir a URL');
    }
    const varios = erroDe({ DB_PORT: 'x', DB_POOL_MAX: '0', DATABASE_SSL: 'sim' });
    for (const trecho of ['DB_HOST', 'DB_PORT', 'DB_POOL_MAX', 'DATABASE_SSL deve ser true ou false']) assert.ok(varios.includes(trecho), trecho);
});

test('parâmetros de SSL na DATABASE_URL são recusados, porque desligariam a verificação do certificado', () => {
    for (const parametro of ['sslmode=no-verify', 'sslmode=require', 'uselibpqcompat=true&sslmode=require', 'ssl=true', 'sslrootcert=ca.pem']) {
        const mensagem = erroDe({ DATABASE_URL: `${urlRemota}?${parametro}`, DATABASE_SSL: 'true' });
        assert.match(mensagem, /Remova .* da DATABASE_URL e configure o SSL com DATABASE_SSL/);
        assert.ok(!mensagem.includes(senhaRemota) && !mensagem.includes(encodeURIComponent(senhaRemota)), 'a senha não pode aparecer');
    }
    // Comprova o motivo: a própria pg troca rejectUnauthorized por false quando a URL traz sslmode=no-verify.
    const ssl = new ConnectionParameters({ connectionString: `${urlRemota}?sslmode=no-verify`, ssl: { rejectUnauthorized: true } }).ssl;
    assert.equal(ssl.rejectUnauthorized, false);
});

test('SSL ativado sempre verifica o certificado e aceita o CA em texto (com \\n literais) ou arquivo', () => {
    assert.deepEqual(montarConfiguracao({ DATABASE_URL: urlRemota, DATABASE_SSL: 'true' }).ssl, { rejectUnauthorized: true });
    assert.equal(montarConfiguracao({ ...local, DATABASE_SSL: 'TRUE' }).ssl.rejectUnauthorized, true);
    for (const valor of ['false', '', undefined]) assert.equal(montarConfiguracao({ ...local, DATABASE_SSL: valor }).ssl, false);

    const emTexto = montarConfiguracao({ DATABASE_URL: urlRemota, DATABASE_SSL: 'true', DATABASE_SSL_CA: pem.replace(/\n/g, '\\n') });
    assert.deepEqual(emTexto.ssl, { rejectUnauthorized: true, ca: pem });

    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'peludinhos-ca-'));
    const arquivo = path.join(pasta, 'ca.crt');
    fs.writeFileSync(arquivo, pem);
    try {
        assert.deepEqual(montarConfiguracao({ DATABASE_URL: urlRemota, DATABASE_SSL: 'true', DATABASE_SSL_CA_FILE: arquivo }).ssl, { rejectUnauthorized: true, ca: pem });
        // Caminho relativo é resolvido a partir da raiz do projeto.
        const relativo = path.relative(raiz, arquivo);
        assert.equal(montarConfiguracao({ DATABASE_URL: urlRemota, DATABASE_SSL: 'true', DATABASE_SSL_CA_FILE: relativo }).ssl.ca, pem);
        assert.match(erroDe({ DATABASE_URL: urlRemota, DATABASE_SSL: 'true', DATABASE_SSL_CA: pem, DATABASE_SSL_CA_FILE: arquivo }), /Use apenas uma/);
    } finally { fs.rmSync(pasta, { recursive: true, force: true }); }

    assert.match(erroDe({ DATABASE_URL: urlRemota, DATABASE_SSL: 'true', DATABASE_SSL_CA_FILE: path.join(os.tmpdir(), 'nao-existe-peludinhos.crt') }), /Não foi possível ler o certificado/);
    assert.match(erroDe({ DATABASE_URL: urlRemota, DATABASE_SSL: 'true', DATABASE_SSL_CA: 'texto qualquer' }), /formato PEM/);
    assert.match(erroDe({ DATABASE_URL: urlRemota, DATABASE_SSL: 'false', DATABASE_SSL_CA: pem }), /exigem DATABASE_SSL=true/);
    assert.match(erroDe({ ...local, DATABASE_SSL: 'yes' }), /DATABASE_SSL deve ser true ou false/);
});

test('a configuração chega à pg com a verificação do certificado preservada', () => {
    const config = montarConfiguracao({ DATABASE_URL: urlRemota, DATABASE_SSL: 'true', DATABASE_SSL_CA: pem });
    const parametros = new ConnectionParameters(config);
    assert.equal(parametros.ssl.rejectUnauthorized, true);
    // A variável é lida sem espaços nas pontas; um PEM sem a quebra de linha final continua válido para o Node.
    assert.equal(parametros.ssl.ca, pem.trim());
    assert.equal(parametros.host, 'aws-0-sa-east-1.pooler.supabase.com');
    assert.equal(parametros.port, 5432);
    assert.equal(parametros.password, senhaRemota);
    // ssl: false explícito: PGSSLMODE do sistema não muda a conexão local.
    const anterior = process.env.PGSSLMODE;
    process.env.PGSSLMODE = 'require';
    try { assert.equal(new ConnectionParameters(montarConfiguracao(local)).ssl, false); }
    finally { if (anterior === undefined) delete process.env.PGSSLMODE; else process.env.PGSSLMODE = anterior; }
});

test('limite de conexões do pool é configurável entre 1 e 100', () => {
    assert.equal(montarConfiguracao({ ...local, DB_POOL_MAX: '5' }).max, 5);
    assert.equal(montarConfiguracao({ ...local, DB_POOL_MAX: '100' }).max, 100);
    for (const valor of ['0', '101', '-1', '2.5', 'dez']) assert.match(erroDe({ ...local, DB_POOL_MAX: valor }), /DB_POOL_MAX deve ser um número inteiro entre 1 e 100/);
});

test('tempo limite para abrir conexões é configurável entre 1 e 120 segundos', () => {
    assert.equal(montarConfiguracao({ ...local, DB_CONNECTION_TIMEOUT_MS: '5000' }).connectionTimeoutMillis, 5000);
    assert.equal(montarConfiguracao({ ...local, DB_CONNECTION_TIMEOUT_MS: ' 1000 ' }).connectionTimeoutMillis, 1000);
    assert.equal(montarConfiguracao({ ...local, DB_CONNECTION_TIMEOUT_MS: '120000' }).connectionTimeoutMillis, 120000);
    assert.equal(montarConfiguracao({ ...local, DB_CONNECTION_TIMEOUT_MS: '' }).connectionTimeoutMillis, 10000);
    // 0 desligaria o limite na pg (espera indefinida): não é aceito.
    for (const valor of ['0', '999', '120001', '-5', '1.5', 'dez']) {
        assert.match(erroDe({ ...local, DB_CONNECTION_TIMEOUT_MS: valor }), /DB_CONNECTION_TIMEOUT_MS deve ser um número inteiro entre 1000 e 120000/);
    }
});

test('o tempo limite interrompe a espera por um servidor que aceita a conexão e não responde', async () => {
    const sockets = [];
    const mudo = net.createServer(socket => sockets.push(socket));
    await new Promise(resolve => mudo.listen(0, '127.0.0.1', resolve));
    const pool = new Pool(montarConfiguracao({ ...local, DB_HOST: '127.0.0.1', DB_PORT: String(mudo.address().port), DB_CONNECTION_TIMEOUT_MS: '1000' }));
    pool.on('error', () => {});
    const inicio = Date.now();
    try {
        await assert.rejects(pool.query('SELECT 1'), /timeout/i);
        assert.ok(Date.now() - inicio < 5000, 'deveria desistir perto de 1 segundo');
    } finally {
        await pool.end().catch(() => {});
        sockets.forEach(socket => socket.destroy());
        await new Promise(resolve => mudo.close(resolve));
    }
});

test('identifica bancos locais para proteger os testes', () => {
    for (const host of ['localhost', '127.0.0.1', '::1', '/var/run/postgresql', 'LOCALHOST']) assert.equal(ehBancoLocal(montarConfiguracao({ ...local, DB_HOST: host })), true, host);
    assert.equal(ehBancoLocal(montarConfiguracao({ DATABASE_URL: 'postgresql://u:p@localhost:5432/peludinhos' })), true);
    assert.equal(ehBancoLocal(montarConfiguracao({ DATABASE_URL: 'postgresql://u:p@[::1]:5432/peludinhos' })), true);
    for (const host of ['db.abcdefgh.supabase.co', '192.168.0.10', 'localhost.exemplo.com']) assert.equal(ehBancoLocal(montarConfiguracao({ ...local, DB_HOST: host })), false, host);
    assert.equal(ehBancoLocal(montarConfiguracao({ DATABASE_URL: urlRemota, DATABASE_SSL: 'true' })), false);
});

test('o bloqueio dos testes impede a execução contra um banco remoto e permite o local', () => {
    // O bloqueio lê um arquivo de ambiente de testes (padrão .env.test); aqui, arquivos temporários. Nenhuma conexão é aberta.
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'peludinhos-env-teste-'));
    const valido = { ...local, DB_USER: 'peludinhos_test_user', DB_NAME: 'peludinhos_test', JWT_SECRET: 'segredo-apenas-de-teste', UPLOADS_DIR: path.join(pasta, 'publica'), UPLOADS_PRIVATE_DIR: path.join(pasta, 'privada') };
    let numero = 0;
    const executar = (variaveis, terminal = {}, codigo = "require('./tests/helpers/bancoLocal.cjs')") => {
        const arquivo = path.join(pasta, `${++numero}.env`);
        fs.writeFileSync(arquivo, Object.entries(variaveis).map(([nome, valor]) => `${nome}=${valor}`).join('\n'));
        return spawnSync(process.execPath, ['-e', codigo], { cwd: raiz, env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...terminal, ARQUIVO_ENV_TESTE: arquivo }, encoding: 'utf8' });
    };
    try {
        const remoto = executar({ ...valido, DATABASE_URL: urlRemota, DATABASE_SSL: 'true' });
        assert.notEqual(remoto.status, 0);
        assert.match(remoto.stderr, /Testes bloqueados/);
        assert.ok(!remoto.stderr.includes(senhaRemota) && !remoto.stderr.includes(encodeURIComponent(senhaRemota)), 'a senha não pode aparecer');
        assert.notEqual(executar({ ...valido, DB_HOST: 'db.abcdefgh.supabase.co' }).status, 0);
        assert.equal(executar(valido).status, 0, executar(valido).stderr);
        // DATABASE_URL vinda do terminal não vence: o pool usa o banco local do arquivo de testes.
        const herdado = executar(valido, { DATABASE_URL: urlRemota, DATABASE_SSL: 'true' },
            "require('./tests/helpers/bancoLocal.cjs'); const p = require('./server/config/database'); console.log(JSON.stringify({ url: process.env.DATABASE_URL, host: p.options.host, banco: p.options.database, conexao: p.options.connectionString || null }))");
        assert.equal(herdado.status, 0, herdado.stderr);
        assert.deepEqual(JSON.parse(herdado.stdout.trim().split('\n').at(-1)), { url: '', host: 'localhost', banco: 'peludinhos_test', conexao: null });
    } finally {
        fs.rmSync(pasta, { recursive: true, force: true });
    }
});

test('erros de conexões ociosas são registrados sem derrubar o processo e sem expor credenciais', () => {
    const config = montarConfiguracao({ DATABASE_URL: urlRemota, DATABASE_SSL: 'true' });
    const pool = new EventEmitter();
    pool.on('error', tratarErroDeConexaoOciosa(config));
    const registros = [];
    const original = console.error;
    console.error = (...args) => registros.push(args.join(' '));
    try {
        const erro = Object.assign(new Error(`falha em ${urlRemota} com senha ${senhaRemota} (${encodeURIComponent(senhaRemota)})`), { code: '57P01' });
        // Sem ouvinte, emit('error') lançaria a exceção e encerraria o processo.
        assert.doesNotThrow(() => pool.emit('error', erro));
    } finally { console.error = original; }
    assert.equal(registros.length, 1);
    assert.match(registros[0], /Conexão ociosa com o PostgreSQL encerrada: 57P01: falha em \*\*\* com senha \*\*\* \(\*\*\*\)/);
    assert.ok(!registros[0].includes(senhaRemota) && !registros[0].includes('pooler.supabase.com'));
    assert.equal(descreverErro(new Error('senha-local-teste recusada'), montarConfiguracao(local)), 'sem código: *** recusada');
    assert.equal(descreverErro(undefined), 'sem código: erro desconhecido');
});

test('server/config/database.js cria o pool com a configuração validada e o ouvinte de erros', () => {
    // Processo separado: o require monta o pool sem conectar (a pg só conecta na primeira consulta).
    const codigo = "const p = require('./server/config/database'); console.log(JSON.stringify({ max: p.options.max, timeout: p.options.connectionTimeoutMillis, ssl: p.options.ssl, erros: p.listenerCount('error'), url: !!p.options.connectionString })); p.end();";
    const resultado = spawnSync(process.execPath, ['-e', codigo], { cwd: raiz, env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, DATABASE_URL: urlRemota, DATABASE_SSL: 'true', DB_POOL_MAX: '5', DB_CONNECTION_TIMEOUT_MS: '7000' }, encoding: 'utf8' });
    assert.equal(resultado.status, 0, resultado.stderr);
    const linha = resultado.stdout.trim().split('\n').at(-1);
    assert.deepEqual(JSON.parse(linha), { max: 5, timeout: 7000, ssl: { rejectUnauthorized: true }, erros: 1, url: true });
    // Configuração inválida impede o servidor de subir, com a lista do que corrigir.
    const invalido = spawnSync(process.execPath, ['-e', "require('./server/config/database')"], { cwd: raiz, env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, DATABASE_URL: `${urlRemota}?sslmode=no-verify` }, encoding: 'utf8' });
    assert.notEqual(invalido.status, 0);
    assert.match(invalido.stderr, /Configuração do banco de dados inválida/);
    assert.ok(!invalido.stderr.includes(senhaRemota) && !invalido.stderr.includes(encodeURIComponent(senhaRemota)));
});
