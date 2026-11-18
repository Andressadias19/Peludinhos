// Ambiente alternativo (--arquivo-env) e verificador do .env.supabase.local, sem banco e sem rede.
// Todos os valores são fictícios; os arquivos temporários ficam fora do repositório e são apagados no fim.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const raiz = path.join(__dirname, '..');
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'peludinhos-ambiente-'));
// Cópia fora do repositório: dentro dele, o verificador exige que o certificado esteja no .gitignore.
const ca = path.join(pasta, 'ca-ficticia.crt');
fs.copyFileSync(path.join(__dirname, 'fixtures', 'ca-ficticia.crt'), ca);
const base64url = valor => Buffer.from(JSON.stringify(valor)).toString('base64url');
const chave = `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url({ role: 'service_role' })}.assinatura-ficticia`;
const senhaDoBanco = 'senha-ficticia-do-banco-Xy7';
const segredo = crypto.randomBytes(48).toString('hex');
const valido = {
    PORT: '3002', SERVE_FRONTEND: 'false', CORS_ORIGIN: '', DIAGNOSTICO_BANCO: 'true', JWT_SECRET: segredo,
    DATABASE_URL: `postgresql://postgres.abcdefghijklmnop:${senhaDoBanco}@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`,
    DATABASE_SSL: 'true', DATABASE_SSL_CA_FILE: ca, DB_POOL_MAX: '5', DB_CONNECTION_TIMEOUT_MS: '10000',
    STORAGE_DRIVER: 'supabase', SUPABASE_URL: 'https://abcdefghijklmnop.supabase.co', SUPABASE_SERVICE_ROLE_KEY: chave,
    SUPABASE_BUCKET_PUBLICO: 'peludinhos-publico', SUPABASE_BUCKET_PRIVADO: 'peludinhos-privado', SUPABASE_TIMEOUT_MS: '15000'
};
const minimo = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot };
let numero = 0;
function arquivo(variaveis) {
    const caminho = path.join(pasta, `${++numero}.env`);
    fs.writeFileSync(caminho, Object.entries(variaveis).map(([nome, valor]) => `${nome}=${valor}`).join('\n'));
    return caminho;
}
const verificar = variaveis => spawnSync(process.execPath, ['scripts/verificar-config-supabase.cjs', `--arquivo-env=${arquivo(variaveis)}`], { cwd: raiz, env: minimo, encoding: 'utf8' });
const semSegredos = texto => ![senhaDoBanco, chave, segredo, 'assinatura-ficticia'].some(valor => texto.includes(valor));

after(() => fs.rmSync(pasta, { recursive: true, force: true }));

test('--arquivo-env: lê só o arquivo escolhido, nunca o .env, e prevalece sobre o terminal', () => {
    const codigo = "require('./server/config/carregarAmbiente').carregarAmbiente(); const e = process.env; "
        + "console.log(JSON.stringify({ dbName: e.DB_NAME, dbPassword: e.DB_PASSWORD, dbHost: e.DB_HOST, jwtDoArquivo: e.JWT_SECRET === 'segredo-do-arquivo-temporario-com-32-chars', porta: e.PORT, url: e.DATABASE_URL, marca: e.PELUDINHOS_ARQUIVO_ENV }))";
    const temporario = arquivo({ PORT: '3002', JWT_SECRET: 'segredo-do-arquivo-temporario-com-32-chars', DATABASE_URL: 'postgresql://u:p@exemplo.invalid:5432/postgres' });
    const resultado = spawnSync(process.execPath, ['-e', codigo, '--', `--arquivo-env=${temporario}`], { cwd: raiz, env: { ...minimo, DATABASE_URL: 'postgresql://terminal@outro.invalid/x', PORT: '9999' }, encoding: 'utf8' });
    assert.equal(resultado.status, 0, resultado.stderr);
    const lido = JSON.parse(resultado.stdout.trim().split('\n').at(-1));
    assert.deepEqual(lido, { porta: '3002', url: 'postgresql://u:p@exemplo.invalid:5432/postgres', jwtDoArquivo: true, marca: path.basename(temporario) },
        'nenhuma variável do .env (DB_NAME, DB_PASSWORD, DB_HOST) foi herdada; o arquivo venceu o terminal');
    // Sem a opção, o comportamento de sempre: o .env é lido (só confere a presença, sem mostrar valores).
    const padrao = spawnSync(process.execPath, ['-e', "require('./server/config/carregarAmbiente').carregarAmbiente(); console.log(Boolean(process.env.DB_NAME || process.env.DATABASE_URL), process.env.PELUDINHOS_ARQUIVO_ENV === undefined)"], { cwd: raiz, env: minimo, encoding: 'utf8' });
    if (fs.existsSync(path.join(raiz, '.env'))) assert.equal(padrao.stdout.trim().split('\n').at(-1), 'true true');
});

test('--arquivo-env: arquivo ausente, vazio ou o próprio .env são recusados', () => {
    for (const [opcao, mensagem] of [[`--arquivo-env=${path.join(pasta, 'nao-existe.env')}`, /não encontrado/], ['--arquivo-env=', /informe o arquivo/], ['--arquivo-env=.env', /inicie sem essa opção/]]) {
        const resultado = spawnSync(process.execPath, ['-e', "require('./server/config/carregarAmbiente').carregarAmbiente()", '--', opcao], { cwd: raiz, env: minimo, encoding: 'utf8' });
        assert.notEqual(resultado.status, 0, opcao);
        assert.match(resultado.stderr, mensagem);
    }
});

test('server/server.js com --arquivo-env não completa a configuração com o banco de desenvolvimento', () => {
    // O arquivo não tem banco: o .env tem DB_*, mas não é lido; o servidor recusa em vez de conectar no peludinhos.
    const resultado = spawnSync(process.execPath, ['server/server.js', `--arquivo-env=${arquivo({ PORT: '3002' })}`], { cwd: raiz, env: minimo, encoding: 'utf8', timeout: 15000 });
    assert.notEqual(resultado.status, 0);
    assert.match(resultado.stderr, /Configuração do banco de dados inválida/);
    assert.match(resultado.stderr, /Defina DATABASE_URL/);
    assert.doesNotMatch(resultado.stdout, /Servidor rodando/);
});

test('verificador: aceita uma configuração completa sem mostrar nenhum valor secreto', () => {
    const resultado = verificar(valido);
    assert.equal(resultado.status, 0, resultado.stdout + resultado.stderr);
    assert.match(resultado.stdout, /Session pooler.*host aws-0-sa-east-1\.pooler\.supabase\.com/);
    assert.match(resultado.stdout, /TLS ligado, com verificação do certificado.*válido até 2046/);
    assert.match(resultado.stdout, /buckets peludinhos-publico e peludinhos-privado/);
    assert.match(resultado.stdout, /Tudo certo para iniciar com: npm\.cmd run start:supabase/);
    assert.ok(semSegredos(resultado.stdout + resultado.stderr));
});

test('verificador: recusa cada configuração insegura ou incompleta, sem mostrar valores', () => {
    const certificadoInvalido = path.join(pasta, 'nao-e-certificado.crt');
    fs.writeFileSync(certificadoInvalido, '-----BEGIN CERTIFICATE-----\nZmljdGljaW8=\n-----END CERTIFICATE-----\n');
    const casos = [
        [{ JWT_SECRET: 'gere_um_segredo_so_para_a_validacao' }, /ainda com o texto de exemplo: JWT_SECRET/],
        [{ DATABASE_URL: 'postgresql://postgres.abcdefghijklmnop:[YOUR-PASSWORD]@aws-0-sa-east-1.pooler.supabase.com:5432/postgres' }, /ainda com o texto de exemplo: DATABASE_URL/],
        [{ SUPABASE_SERVICE_ROLE_KEY: 'coloque_a_chave_service_role' }, /ainda com o texto de exemplo: SUPABASE_SERVICE_ROLE_KEY/],
        [{ VITE_SUPABASE_URL: 'https://abcdefghijklmnop.supabase.co' }, /VITE_\* não pertencem a este arquivo/],
        [{ DATABASE_URL: 'postgresql://postgres:senha@localhost:5432/peludinhos' }, /o host não é \*\.pooler\.supabase\.com/],
        [{ DATABASE_URL: `postgresql://postgres:${senhaDoBanco}@localhost:5432/peludinhos` }, /aponta para um banco local/],
        [{ DATABASE_URL: valido.DATABASE_URL.replace(':5432/', ':6543/') }, /porta 5432 \(Session pooler\)/],
        [{ DATABASE_URL: `${valido.DATABASE_URL}?sslmode=require` }, /Remova sslmode/],
        [{ DATABASE_URL: valido.DATABASE_URL.replace('postgres.abcdefghijklmnop', 'postgres') }, /formato postgres\.<projeto>/],
        [{ DATABASE_SSL: 'false' }, /exigem DATABASE_SSL=true/],
        [{ DATABASE_SSL_CA_FILE: '' }, /informe o certificado/],
        [{ DATABASE_SSL_CA_FILE: path.join(pasta, 'nao-existe.crt') }, /Não foi possível ler o certificado/],
        [{ DATABASE_SSL_CA_FILE: certificadoInvalido }, /TLS ligado.*:/],
        [{ SUPABASE_URL: 'https://outroprojeto.supabase.co' }, /projetos diferentes/],
        [{ STORAGE_DRIVER: 'local' }, /defina STORAGE_DRIVER=supabase/],
        [{ SUPABASE_SERVICE_ROLE_KEY: `${base64url({ alg: 'HS256' })}.${base64url({ role: 'anon' })}.assinatura-ficticia` }, /chave pública/],
        [{ SUPABASE_BUCKET_PRIVADO: 'peludinhos-publico' }, /buckets diferentes/],
        [{ JWT_SECRET: 'curto' }, /pelo menos 32 caracteres/],
        [{ SERVE_FRONTEND: 'true' }, /SERVE_FRONTEND=false/]
    ];
    for (const [alteracao, mensagem] of casos) {
        const resultado = verificar({ ...valido, ...alteracao });
        assert.equal(resultado.status, 1, `${JSON.stringify(Object.keys(alteracao))}: ${resultado.stdout}`);
        assert.match(resultado.stdout, /\[ERRO\]/);
        assert.match(resultado.stdout, mensagem, resultado.stdout);
        assert.ok(semSegredos(resultado.stdout + resultado.stderr), `valor exposto: ${resultado.stdout}`);
    }
    // Arquivo dentro do repositório que não esteja no .gitignore é recusado (o exemplo é versionável).
    const exemplo = spawnSync(process.execPath, ['scripts/verificar-config-supabase.cjs', '--arquivo-env=.env.supabase.local.example'], { cwd: raiz, env: minimo, encoding: 'utf8' });
    assert.equal(exemplo.status, 1);
    assert.match(exemplo.stdout, /NÃO está ignorado pelo Git/);
});

test('o arquivo real e o certificado ficam fora do Git; o exemplo e o certificado fictício, não', () => {
    const ignorado = caminho => spawnSync('git', ['check-ignore', '-q', caminho], { cwd: raiz }).status === 0;
    for (const caminho of ['.env.supabase.local', 'certificados/supabase-ca.crt', 'certificados/qualquer.pem', '.env.render.local']) assert.equal(ignorado(caminho), true, caminho);
    for (const caminho of ['.env.supabase.local.example', 'tests/fixtures/ca-ficticia.crt']) assert.equal(ignorado(caminho), false, caminho);
    const exemplo = fs.readFileSync(path.join(raiz, '.env.supabase.local.example'), 'utf8');
    assert.match(exemplo, /\[YOUR-PASSWORD\]/);
    assert.doesNotMatch(exemplo, /eyJ[\w-]{10,}\.|sb_secret_[\w-]{10,}/, 'o exemplo não contém chaves');
});
