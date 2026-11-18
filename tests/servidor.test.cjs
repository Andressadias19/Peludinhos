const { pastasDeUpload } = require('./helpers/bancoLocal.cjs');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const pool = require('../server/config/database');
const criarApp = require('../server/app');
const { lerConfiguracaoServidor, validarSegredoJwt, ORIGENS_LOCAIS_PADRAO, PORTA_PADRAO, TAMANHO_MINIMO_JWT_SECRET } = require('../server/config/serverConfig');

const raiz = path.join(__dirname, '..');
const uploads = pastasDeUpload.publica;
const frontendHospedado = 'https://peludinhos-web.onrender.com';
const pastasTemporarias = [];
const servidores = [];

// Requisição HTTP com controle total dos cabeçalhos (inclusive Origin, que o navegador define sozinho).
function request(base, caminho, { method = 'GET', headers = {}, body } = {}) {
    return new Promise((resolve, reject) => {
        const req = http.request(base + caminho, { method, headers }, res => {
            let texto = '';
            res.setEncoding('utf8');
            res.on('data', parte => { texto += parte; });
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, texto, json: () => JSON.parse(texto) }));
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}
// Sobe a aplicação neste processo, numa porta livre, só na interface local.
async function subir(opcoes) {
    const servidor = criarApp(opcoes).listen(0, '127.0.0.1');
    await new Promise(resolve => servidor.once('listening', resolve));
    servidores.push(servidor);
    return `http://127.0.0.1:${servidor.address().port}`;
}
function pastaTemporaria() {
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'peludinhos-frontend-'));
    pastasTemporarias.push(pasta);
    return pasta;
}
async function json404(resposta, mensagem) {
    assert.equal(resposta.status, 404);
    assert.match(resposta.headers['content-type'], /application\/json/);
    assert.equal(resposta.json().erro, mensagem);
}
// Servidor real (server/server.js) em processo separado; devolve a URL e o log.
async function subirProcesso(env = {}, args = []) {
    const porta = await new Promise(resolve => { const s = http.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
    const filho = spawn(process.execPath, ['server/server.js', ...args], { cwd: raiz, env: { ...process.env, SERVE_FRONTEND: '', CORS_ORIGIN: '', ...env, PORT: String(porta) }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    await new Promise((resolve, reject) => {
        const limite = setTimeout(() => reject(new Error('Servidor não iniciou.')), 15000);
        filho.stdout.on('data', parte => { log += parte; if (log.includes('Servidor rodando')) { clearTimeout(limite); resolve(); } });
        filho.on('exit', codigo => { clearTimeout(limite); reject(new Error(`Servidor encerrou: ${codigo}`)); });
    });
    servidores.push({ close: () => filho.kill() });
    return { base: `http://127.0.0.1:${porta}`, log };
}
function executarAteSair(env) {
    return new Promise(resolve => {
        const filho = spawn(process.execPath, ['server/server.js'], { cwd: raiz, env: { ...process.env, SERVE_FRONTEND: '', CORS_ORIGIN: '', ...env, PORT: '0' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        let erro = '';
        filho.stderr.on('data', parte => { erro += parte; });
        const limite = setTimeout(() => filho.kill(), 15000);
        filho.on('exit', codigo => { clearTimeout(limite); resolve({ codigo, erro }); });
    });
}

let fotoPublica;
before(() => {
    fotoPublica = `teste-servidor-${randomUUID()}.png`;
    fs.mkdirSync(uploads, { recursive: true });
    fs.writeFileSync(path.join(uploads, fotoPublica), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nJkAAAAASUVORK5CYII=', 'base64'));
});

after(async () => {
    for (const servidor of servidores) servidor.close();
    fs.rmSync(path.join(uploads, fotoPublica), { force: true });
    for (const pasta of pastasTemporarias) fs.rmSync(pasta, { recursive: true, force: true });
    await pool.end();
});

test('configuração: padrões, SERVE_FRONTEND, argumento --serve-frontend e PORT', () => {
    assert.deepEqual(lerConfiguracaoServidor({}, []), { porta: PORTA_PADRAO, servirFrontend: false, origensCors: ORIGENS_LOCAIS_PADRAO, diagnosticoBanco: false });
    assert.equal(PORTA_PADRAO, 3001);
    assert.deepEqual(ORIGENS_LOCAIS_PADRAO, ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173', 'http://127.0.0.1:4173']);
    assert.equal(lerConfiguracaoServidor({ SERVE_FRONTEND: 'true' }, []).servirFrontend, true);
    assert.equal(lerConfiguracaoServidor({ SERVE_FRONTEND: ' TRUE ' }, []).servirFrontend, true);
    assert.equal(lerConfiguracaoServidor({ SERVE_FRONTEND: 'false' }, []).servirFrontend, false);
    assert.equal(lerConfiguracaoServidor({}, ['node', 'server/server.js', '--serve-frontend']).servirFrontend, true);
    assert.equal(lerConfiguracaoServidor({ PORT: '10000' }, []).porta, 10000);
    for (const [env, mensagem] of [[{ SERVE_FRONTEND: 'sim' }, /SERVE_FRONTEND deve ser true ou false/], [{ PORT: '0' }, /PORT deve ser/], [{ PORT: 'abc' }, /PORT deve ser/]]) {
        assert.throws(() => lerConfiguracaoServidor(env, []), mensagem);
    }
});

test('configuração: CORS_ORIGIN aceita várias origens e recusa curinga, caminhos e protocolos estranhos', () => {
    assert.deepEqual(lerConfiguracaoServidor({ CORS_ORIGIN: ` ${frontendHospedado}/ , http://localhost:5173,${frontendHospedado}` }, []).origensCors, [frontendHospedado, 'http://localhost:5173']);
    for (const valor of ['*', 'ftp://exemplo.com', `${frontendHospedado}/app`, 'nao-e-url', ' , ', 'https://exemplo.com?x=1']) {
        assert.throws(() => lerConfiguracaoServidor({ CORS_ORIGIN: valor }, []), /CORS_ORIGIN/, valor);
    }
});

test('modo somente API funciona sem a pasta do frontend e responde 404 em JSON', async () => {
    const base = await subir({ servirFrontend: false, pastaFrontend: path.join(os.tmpdir(), `nao-existe-${randomUUID()}`), diagnosticoBanco: true });
    assert.equal((await request(base, '/api')).json().mensagem, 'API do Peludinhos funcionando!');
    assert.equal((await request(base, '/api/teste-banco')).json().mensagem, 'PostgreSQL conectado!');
    await json404(await request(base, '/api/rota-inexistente'), 'Rota da API não encontrada.');
    await json404(await request(base, '/api/outra', { method: 'DELETE' }), 'Rota da API não encontrada.');
    for (const [caminho, metodo] of [['/', 'GET'], ['/mapa', 'GET'], ['/admin/usuarios/3', 'GET'], ['/index.html', 'GET'], ['/assets/index.js', 'GET'], ['/mapa', 'POST']]) {
        await json404(await request(base, caminho, { method: metodo }), 'Recurso não encontrado.');
    }
    // Rotas autenticadas e fotos continuam disponíveis.
    assert.equal((await request(base, '/api/usuarios/me')).status, 401);
    assert.equal((await request(base, '/api/perdidos/1/foto')).status, 401);
    const foto = await request(base, `/uploads/${fotoPublica}`);
    assert.equal(foto.status, 200);
    assert.equal(foto.headers['content-type'], 'image/png');
    assert.equal(foto.headers['x-content-type-options'], 'nosniff');
    await json404(await request(base, `/uploads/nao-existe-${randomUUID()}.png`), 'Arquivo não encontrado.');
});

test('modo com frontend entrega a SPA e mantém 404 em JSON para a API', async () => {
    const pasta = pastaTemporaria();
    fs.writeFileSync(path.join(pasta, 'index.html'), '<!doctype html><div id="root">teste</div>');
    fs.mkdirSync(path.join(pasta, 'assets'));
    fs.writeFileSync(path.join(pasta, 'assets', 'app.js'), 'console.log(1)');
    const base = await subir({ servirFrontend: true, pastaFrontend: pasta });
    for (const caminho of ['/', '/mapa', '/admin/usuarios/3', '/perdidos/55?x=1']) {
        const pagina = await request(base, caminho);
        assert.equal(pagina.status, 200, caminho);
        assert.match(pagina.headers['content-type'], /text\/html/);
        assert.match(pagina.texto, /id="root">teste/);
    }
    assert.equal((await request(base, '/assets/app.js')).texto, 'console.log(1)');
    const arquivoFaltando = await request(base, '/nao-existe.png');
    assert.equal(arquivoFaltando.status, 404);
    assert.equal(arquivoFaltando.texto, 'Arquivo não encontrado.');
    await json404(await request(base, '/api/rota-inexistente'), 'Rota da API não encontrada.');
    await json404(await request(base, '/mapa', { method: 'POST' }), 'Recurso não encontrado.');
    const malformado = await request(base, '/%E0%A4%A');
    assert.equal(malformado.status, 400);
    assert.equal(malformado.json().erro, 'Requisição inválida.');
    assert.equal((await request(base, `/uploads/${fotoPublica}`)).status, 200);
    assert.equal((await request(base, '/api')).status, 200);
});

test('modo com frontend sem build: a API funciona e as páginas respondem 503 em JSON', async () => {
    const avisos = [];
    const original = console.warn;
    console.warn = mensagem => avisos.push(mensagem);
    let base;
    try { base = await subir({ servirFrontend: true, pastaFrontend: path.join(os.tmpdir(), `sem-build-${randomUUID()}`) }); }
    finally { console.warn = original; }
    assert.match(avisos.join(' '), /npm run build/);
    const pagina = await request(base, '/mapa');
    assert.equal(pagina.status, 503);
    assert.equal(pagina.json().erro, 'O frontend ainda não foi compilado.');
    assert.equal((await request(base, '/api')).status, 200);
    await json404(await request(base, '/api/rota-inexistente'), 'Rota da API não encontrada.');
});

test('CORS: origens permitidas recebem os cabeçalhos; outras não; clientes sem Origin continuam funcionando', async () => {
    const base = await subir({ origensCors: [frontendHospedado, 'http://localhost:5173'] });
    const permitida = await request(base, '/api', { headers: { Origin: frontendHospedado } });
    assert.equal(permitida.status, 200);
    assert.equal(permitida.headers['access-control-allow-origin'], frontendHospedado);
    assert.match(permitida.headers.vary, /Origin/);
    assert.equal((await request(base, '/api', { headers: { Origin: 'http://localhost:5173' } })).headers['access-control-allow-origin'], 'http://localhost:5173');
    for (const origem of ['https://site-malicioso.example', 'http://localhost:3000', 'null', `${frontendHospedado}.example`]) {
        const recusada = await request(base, '/api', { headers: { Origin: origem } });
        assert.equal(recusada.headers['access-control-allow-origin'], undefined, origem);
    }
    const semOrigem = await request(base, '/api');
    assert.equal(semOrigem.status, 200);
    assert.equal(semOrigem.headers['access-control-allow-origin'], undefined);
});

test('CORS: preflight com Authorization e Content-Type para origem permitida e recusa para as outras', async () => {
    const base = await subir({ origensCors: [frontendHospedado] });
    const preflight = await request(base, '/api/usuarios/me', { method: 'OPTIONS', headers: { Origin: frontendHospedado, 'Access-Control-Request-Method': 'PATCH', 'Access-Control-Request-Headers': 'authorization,content-type' } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers['access-control-allow-origin'], frontendHospedado);
    for (const metodo of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) assert.ok(preflight.headers['access-control-allow-methods'].split(',').includes(metodo), metodo);
    assert.deepEqual(preflight.headers['access-control-allow-headers'].split(',').sort(), ['Authorization', 'Content-Type']);
    assert.equal(preflight.headers['access-control-max-age'], '600');
    const recusado = await request(base, '/api/usuarios/me', { method: 'OPTIONS', headers: { Origin: 'https://site-malicioso.example', 'Access-Control-Request-Method': 'DELETE', 'Access-Control-Request-Headers': 'authorization' } });
    assert.equal(recusado.headers['access-control-allow-origin'], undefined);
    assert.equal(recusado.headers['access-control-allow-methods'], undefined);
});

test('CORS não substitui a autenticação: origem permitida sem token continua recebendo 401', async () => {
    const base = await subir({ origensCors: [frontendHospedado] });
    const resposta = await request(base, '/api/usuarios/me', { headers: { Origin: frontendHospedado } });
    assert.equal(resposta.status, 401);
    // O cabeçalho CORS permite ao frontend ler o erro e encerrar a sessão.
    assert.equal(resposta.headers['access-control-allow-origin'], frontendHospedado);
    const admin = await request(base, '/api/admin/resumo', { headers: { Origin: frontendHospedado, Authorization: 'Bearer token-invalido' } });
    assert.equal(admin.status, 401);
    const corpo = await request(base, '/api/login', { method: 'POST', headers: { Origin: frontendHospedado, 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    assert.equal(corpo.status, 400);
});

test('origens locais padrão permitem o Vite (5173) e o vite preview (4173)', async () => {
    const base = await subir({});
    for (const origem of ORIGENS_LOCAIS_PADRAO) assert.equal((await request(base, '/api', { headers: { Origin: origem } })).headers['access-control-allow-origin'], origem);
    assert.equal((await request(base, '/api', { headers: { Origin: frontendHospedado } })).headers['access-control-allow-origin'], undefined);
});

test('sem host fixo, o servidor escuta em todas as interfaces de rede', async () => {
    const servidor = criarApp({}).listen(0);
    await new Promise(resolve => servidor.once('listening', resolve));
    servidores.push(servidor);
    assert.ok(['::', '0.0.0.0'].includes(servidor.address().address), servidor.address().address);
});

test('server/server.js: modo padrão é somente API; --serve-frontend ativa o frontend', async () => {
    const somenteApi = await subirProcesso();
    assert.match(somenteApi.log, /Servidor rodando na porta \d+ \(somente API\)/);
    await json404(await request(somenteApi.base, '/mapa'), 'Recurso não encontrado.');
    assert.equal((await request(somenteApi.base, '/api')).status, 200);

    const comFrontend = await subirProcesso({}, ['--serve-frontend']);
    assert.match(comFrontend.log, /\(API e frontend\)/);
    await json404(await request(comFrontend.base, '/api/rota-inexistente'), 'Rota da API não encontrada.');
    const pagina = await request(comFrontend.base, '/mapa');
    // Com o build feito, a página do React; sem ele, o aviso 503. Nunca o 404 do modo somente API.
    if (fs.existsSync(path.join(raiz, 'dist', 'index.html'))) assert.match(pagina.headers['content-type'], /text\/html/);
    else assert.equal(pagina.status, 503);

    const porVariavel = await subirProcesso({ SERVE_FRONTEND: 'true', CORS_ORIGIN: frontendHospedado });
    assert.match(porVariavel.log, /\(API e frontend\)/);
    assert.equal((await request(porVariavel.base, '/api', { headers: { Origin: frontendHospedado } })).headers['access-control-allow-origin'], frontendHospedado);
});

test('diagnóstico do banco (GET /api/teste-banco): desligado por padrão, ligado só com DIAGNOSTICO_BANCO=true', async () => {
    for (const valor of [undefined, '', 'false', ' FALSE ']) assert.equal(lerConfiguracaoServidor({ DIAGNOSTICO_BANCO: valor }, []).diagnosticoBanco, false, String(valor));
    for (const valor of ['true', ' TRUE ']) assert.equal(lerConfiguracaoServidor({ DIAGNOSTICO_BANCO: valor }, []).diagnosticoBanco, true, valor);
    assert.throws(() => lerConfiguracaoServidor({ DIAGNOSTICO_BANCO: 'sim' }, []), /DIAGNOSTICO_BANCO deve ser true ou false/);
    // Desligado: o mesmo 404 de qualquer rota inexistente, sem consultar o banco.
    const desligado = await subir({});
    await json404(await request(desligado, '/api/teste-banco'), 'Rota da API não encontrada.');
    assert.equal((await request(desligado, '/api')).status, 200, 'a rota de saúde GET /api não depende do diagnóstico');
    const ligado = await subirProcesso({ DIAGNOSTICO_BANCO: 'true' });
    assert.equal((await request(ligado.base, '/api/teste-banco')).json().mensagem, 'PostgreSQL conectado!');
    await json404(await request((await subirProcesso()).base, '/api/teste-banco'), 'Rota da API não encontrada.');
});

test('JWT_SECRET: o servidor não inicia sem segredo, com o texto de exemplo ou com menos de 32 caracteres', async () => {
    assert.equal(TAMANHO_MINIMO_JWT_SECRET, 32);
    assert.doesNotThrow(() => validarSegredoJwt({ JWT_SECRET: 'a'.repeat(32) }));
    for (const [segredo, mensagem] of [[undefined, /Defina JWT_SECRET/], ['   ', /Defina JWT_SECRET/], ['gere_um_segredo_aleatorio', /texto de exemplo/],
        ['gere_um_segredo_so_para_testes', /texto de exemplo/], ['a'.repeat(31), /pelo menos 32 caracteres/]]) {
        assert.throws(() => validarSegredoJwt({ JWT_SECRET: segredo }), erro => /^Configuração do servidor inválida/.test(erro.message) && mensagem.test(erro.message) && (!segredo || !segredo.trim() || !erro.message.includes(segredo)));
    }
    // server/server.js de verdade (com o ambiente de testes): recusa e não mostra o valor.
    for (const segredo of ['gere_um_segredo_aleatorio', 'curto-demais-para-assinar']) {
        // Porta válida (a validação do segredo vem depois da porta); o processo sai antes de escutar.
        const resultado = spawnSync(process.execPath, ['server/server.js'], { cwd: raiz, env: { ...process.env, SERVE_FRONTEND: '', CORS_ORIGIN: '', PORT: '1', JWT_SECRET: segredo }, encoding: 'utf8', timeout: 15000 });
        assert.notEqual(resultado.status, 0);
        assert.match(resultado.stderr, /Configuração do servidor inválida/);
        assert.match(resultado.stderr, /JWT_SECRET/);
        assert.doesNotMatch(resultado.stdout, /Servidor rodando/);
        assert.ok(!resultado.stderr.includes(segredo), 'o segredo não aparece na mensagem');
    }
});

test('server/server.js não sobe com SERVE_FRONTEND ou CORS_ORIGIN inválidos', async () => {
    for (const [env, mensagem] of [[{ SERVE_FRONTEND: 'talvez' }, /SERVE_FRONTEND deve ser true ou false/], [{ CORS_ORIGIN: '*' }, /CORS_ORIGIN/]]) {
        const resultado = await executarAteSair(env);
        assert.notEqual(resultado.codigo, 0);
        assert.match(resultado.erro, /Configuração do servidor inválida/);
        assert.match(resultado.erro, mensagem);
    }
});
