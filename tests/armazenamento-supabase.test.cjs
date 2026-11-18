// Driver Supabase Storage, só com simulações: nenhuma conexão externa, nenhum banco e nenhum valor real.
// - O Supabase Storage é simulado em memória atrás de um fetch falso (o SDK oficial é usado de verdade).
// - O fetch global é trocado por uma barreira: qualquer endereço fora do Supabase fictício e de 127.0.0.1 é recusado.
// - server/config/database.js é trocado por um banco falso ANTES de qualquer require do servidor:
//   este arquivo não lê o .env, não abre conexão com PostgreSQL e não toca nas pastas de fotos.
// Os testes de integração (banco peludinhos_test, STORAGE_DRIVER=local, pastas isoladas) não mudam.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const util = require('node:util');
const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');

const raiz = path.join(__dirname, '..');
const URL_FICTICIA = 'https://projeto-ficticio.supabase.co';
const base64url = valor => Buffer.from(JSON.stringify(valor)).toString('base64url');
const jwtFicticio = papel => `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url({ role: papel, iss: 'teste-ficticio' })}.assinatura-ficticia-sem-valor`;
const CHAVE = jwtFicticio('service_role');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nJkAAAAASUVORK5CYII=', 'base64');
const outroPng = Buffer.concat([png, Buffer.from('outro conteúdo')]);
const nome = (prefixo = 'animal') => `${prefixo}-${randomUUID()}.png`;
const codigo = (esperado, extras = {}) => erro => {
    assert.equal(erro.codigo, esperado, erro.message);
    for (const [campo, valor] of Object.entries(extras)) assert.equal(erro[campo], valor, `${campo}: ${erro.message}`);
    return true;
};
const semChave = valor => !String(valor).includes(CHAVE) && !String(valor).includes('assinatura-ficticia');

// ---------------------------------------------------------------- barreira de rede e banco falso

const fetchReal = globalThis.fetch;
let simuladorGlobal = null;
globalThis.fetch = (url, init) => {
    const destino = new URL(typeof url === 'string' ? url : url.url || String(url));
    if (destino.hostname === '127.0.0.1') return fetchReal(url, init);
    if (destino.origin === URL_FICTICIA && simuladorGlobal) return simuladorGlobal.fetch(url, init);
    return Promise.reject(new Error(`Conexão externa bloqueada pelo teste: ${destino.origin}`));
};

const banco = { consultas: [], responder: null };
async function consultar(sql, parametros) {
    banco.consultas.push(sql);
    if (/SELECT ativo FROM Usuario/.test(sql)) return { rows: [{ ativo: true }], rowCount: 1 };
    const resposta = banco.responder ? await banco.responder(sql, parametros) : undefined;
    if (resposta instanceof Error) throw resposta;
    return resposta || { rows: [], rowCount: 0 };
}
const bancoFalso = { query: consultar, connect: async () => ({ query: consultar, release() {} }), on() {}, end: async () => {} };
function substituirModulo(caminho, exportacoes) {
    const id = require.resolve(caminho);
    const modulo = new Module(id);
    modulo.filename = id;
    modulo.loaded = true;
    modulo.exports = exportacoes;
    require.cache[id] = modulo;
}
substituirModulo('../server/config/database', bancoFalso);

// A instância da aplicação (usada pelos controllers reais) é supabase, com valores fictícios.
Object.assign(process.env, {
    STORAGE_DRIVER: 'supabase', SUPABASE_URL: URL_FICTICIA, SUPABASE_SERVICE_ROLE_KEY: CHAVE, SUPABASE_TIMEOUT_MS: '1000',
    SUPABASE_BUCKET_PUBLICO: '', SUPABASE_BUCKET_PRIVADO: '', JWT_SECRET: 'segredo-ficticio-apenas-deste-teste'
});

const express = require('express');
const jwt = require('jsonwebtoken');
const storage = require('../server/storage');
const { lerConfiguracaoSupabase, criarDriverSupabase, BUCKETS_PADRAO, TEMPO_LIMITE_PADRAO } = require('../server/storage/supabase');
const { criarArmazenamento, AREAS } = storage;

// ---------------------------------------------------------------- Supabase Storage simulado

const json = (status, corpo) => new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });
const naoEncontrado = () => json(400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
const semBucket = () => json(400, { statusCode: '404', error: 'Bucket not found', message: 'Bucket not found' });
// Fica pendente até o sinal de tempo limite do driver abortar a requisição.
const pendurar = req => new Promise((_, rejeitar) => req.signal.addEventListener('abort', () => rejeitar(req.signal.reason), { once: true }));
const erroDeRede = codigoDeRede => Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error(`connect ${codigoDeRede}`), { code: codigoDeRede }) });

function criarSimulador({ chave = CHAVE, buckets = { [BUCKETS_PADRAO.publico]: true, [BUCKETS_PADRAO.privado]: false } } = {}) {
    const objetos = new Map();
    const requisicoes = [];
    const simulador = { objetos, requisicoes, buckets, interceptar: null };
    simulador.fetch = async (url, init = {}) => {
        const endereco = new URL(String(url));
        const headers = new Headers(init.headers);
        const metodo = (init.method || 'GET').toUpperCase();
        const caminho = decodeURIComponent(endereco.pathname.replace(/^\/storage\/v1/, ''));
        const req = { metodo, caminho, headers, corpo: init.body, signal: init.signal, origem: endereco.origin };
        requisicoes.push(req);
        if (simulador.interceptar) {
            const resposta = await simulador.interceptar(req);
            if (resposta !== undefined) return resposta;
        }
        if (headers.get('authorization') !== `Bearer ${chave}` || headers.get('apikey') !== chave) return json(400, { statusCode: '403', error: 'Unauthorized', message: 'Invalid JWT' });
        let m;
        if ((m = caminho.match(/^\/bucket\/([^/]+)$/)) && metodo === 'GET') return m[1] in buckets ? json(200, { id: m[1], name: m[1], public: buckets[m[1]] }) : semBucket();
        if ((m = caminho.match(/^\/object\/info\/([^/]+)\/(.+)$/)) && metodo === 'GET') {
            if (!(m[1] in buckets)) return semBucket();
            const objeto = objetos.get(`${m[1]}/${m[2]}`);
            return objeto ? json(200, { name: m[2], size: objeto.bytes.length, content_type: objeto.tipo }) : naoEncontrado();
        }
        if ((m = caminho.match(/^\/object\/([^/]+)$/)) && metodo === 'DELETE') {
            if (!(m[1] in buckets)) return semBucket();
            const { prefixes } = JSON.parse(init.body);
            return json(200, prefixes.filter(item => objetos.delete(`${m[1]}/${item}`)).map(item => ({ name: item })));
        }
        if ((m = caminho.match(/^\/object\/([^/]+)\/(.+)$/))) {
            if (!(m[1] in buckets)) return semBucket();
            const chaveDoObjeto = `${m[1]}/${m[2]}`;
            if (metodo === 'POST') {
                if (objetos.has(chaveDoObjeto) && headers.get('x-upsert') !== 'true') return json(400, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' });
                objetos.set(chaveDoObjeto, { bytes: Buffer.from(init.body), tipo: headers.get('content-type'), cache: headers.get('cache-control') });
                return json(200, { Key: chaveDoObjeto, Id: randomUUID() });
            }
            if (metodo === 'GET') {
                const objeto = objetos.get(chaveDoObjeto);
                return objeto ? new Response(objeto.bytes, { status: 200, headers: { 'content-type': objeto.tipo, 'content-length': String(objeto.bytes.length) } }) : naoEncontrado();
            }
        }
        return json(400, { statusCode: '400', error: 'InvalidRequest', message: `rota não simulada: ${metodo} ${caminho}` });
    };
    return simulador;
}

function configuracaoCom(tempoLimiteMs, env = {}) {
    const lida = lerConfiguracaoSupabase({ SUPABASE_URL: URL_FICTICIA, SUPABASE_SERVICE_ROLE_KEY: CHAVE, ...env });
    if (!tempoLimiteMs) return lida;
    const configuracao = { ...lida, tempoLimiteMs };
    Object.defineProperty(configuracao, 'chave', { value: lida.chave, enumerable: false });
    return configuracao;
}
function novoSupabase({ simulador = criarSimulador(), tempoLimiteMs, env } = {}) {
    const driver = criarDriverSupabase(configuracaoCom(tempoLimiteMs, env), { fetch: simulador.fetch });
    return { armazenamento: criarArmazenamento({}, { driver }), simulador, driver };
}
function capturarErros() {
    const original = { error: console.error, warn: console.warn };
    const registros = [];
    console.error = (...args) => registros.push(util.format(...args));
    console.warn = (...args) => registros.push(util.format(...args));
    return { registros, restaurar: () => Object.assign(console, original) };
}
const objeto = (simulador, bucket, nomeDoArquivo) => simulador.objetos.get(`${bucket}/${nomeDoArquivo}`);

after(() => {
    servidor?.http.close();
    globalThis.fetch = fetchReal;
});

// ---------------------------------------------------------------- seleção e configuração

test('seleção do driver: supabase só com STORAGE_DRIVER=supabase; o local não exige nem lê credenciais do Supabase', () => {
    assert.equal(storage.lerDriver({}), 'local');
    assert.equal(storage.lerDriver({ STORAGE_DRIVER: 'supabase' }), 'supabase');
    // Local com variáveis SUPABASE_* ausentes ou até inválidas: nada é validado nem carregado.
    assert.equal(criarArmazenamento({ STORAGE_DRIVER: 'local', SUPABASE_URL: 'lixo', SUPABASE_BUCKET_PUBLICO: 'x', SUPABASE_BUCKET_PRIVADO: 'x' }).driver, 'local');
    const filho = spawnSync(process.execPath, ['-e', "const s = require('./server/storage'); s.criarArmazenamento({ UPLOADS_DIR: 'a', UPLOADS_PRIVATE_DIR: 'b' }); console.log(Object.keys(require.cache).some(id => id.includes('@supabase')))"],
        { cwd: raiz, env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot }, encoding: 'utf8' });
    assert.equal(filho.status, 0, filho.stderr);
    assert.equal(filho.stdout.trim(), 'false', 'no modo local o SDK do Supabase nem é carregado');
    const supabase = criarArmazenamento({ STORAGE_DRIVER: 'supabase', SUPABASE_URL: URL_FICTICIA, SUPABASE_SERVICE_ROLE_KEY: CHAVE }, { fetch: criarSimulador().fetch });
    assert.equal(supabase.driver, 'supabase');
    assert.deepEqual(supabase.descrever(), { driver: 'supabase', url: URL_FICTICIA, bucketPublico: 'peludinhos-publico', bucketPrivado: 'peludinhos-privado', tempoLimiteMs: TEMPO_LIMITE_PADRAO });
});

test('configuração do modo supabase: valida URL, chave service role, buckets diferentes e tempo limite, sem expor valores', () => {
    const valido = { SUPABASE_URL: URL_FICTICIA, SUPABASE_SERVICE_ROLE_KEY: CHAVE };
    const lida = lerConfiguracaoSupabase(valido);
    assert.deepEqual({ ...lida }, { url: URL_FICTICIA, bucketPublico: 'peludinhos-publico', bucketPrivado: 'peludinhos-privado', tempoLimiteMs: 15000 });
    assert.equal(lida.chave, CHAVE);
    assert.ok(semChave(JSON.stringify(lida)) && semChave(util.inspect(lida)) && semChave(String(Object.keys(lida))), 'a chave não aparece ao imprimir a configuração');
    assert.ok(Object.isFrozen(lida));
    assert.equal(lerConfiguracaoSupabase({ ...valido, SUPABASE_URL: `${URL_FICTICIA}/` }).url, URL_FICTICIA);
    assert.equal(lerConfiguracaoSupabase({ ...valido, SUPABASE_URL: 'http://127.0.0.1:54321' }).url, 'http://127.0.0.1:54321');
    assert.equal(lerConfiguracaoSupabase({ ...valido, SUPABASE_SERVICE_ROLE_KEY: `sb_secret_${'x'.repeat(30)}` }).chave, `sb_secret_${'x'.repeat(30)}`);
    assert.deepEqual(lerConfiguracaoSupabase({ ...valido, SUPABASE_BUCKET_PUBLICO: 'fotos-pub', SUPABASE_BUCKET_PRIVADO: 'fotos_priv', SUPABASE_TIMEOUT_MS: '5000' }).tempoLimiteMs, 5000);

    const recusa = (env, motivo) => assert.throws(() => lerConfiguracaoSupabase(env), erro => {
        assert.match(erro.message, /^Configuração do armazenamento inválida:/);
        assert.match(erro.message, motivo);
        assert.ok(semChave(erro.message), 'a mensagem não pode conter a chave');
        return true;
    });
    recusa({}, /Defina SUPABASE_URL.*Defina SUPABASE_SERVICE_ROLE_KEY/);
    recusa({ ...valido, SUPABASE_URL: 'projeto-ficticio.supabase.co' }, /SUPABASE_URL não é uma URL válida/);
    recusa({ ...valido, SUPABASE_URL: 'http://projeto-ficticio.supabase.co' }, /deve usar https/);
    recusa({ ...valido, SUPABASE_URL: 'ftp://projeto-ficticio.supabase.co' }, /deve usar https/);
    recusa({ ...valido, SUPABASE_URL: 'https://usuario:senha@projeto-ficticio.supabase.co' }, /não pode conter usuário ou senha/);
    for (const url of [`${URL_FICTICIA}/rest/v1`, `${URL_FICTICIA}/storage/v1`, `${URL_FICTICIA}?x=1`, `${URL_FICTICIA}#a`]) recusa({ ...valido, SUPABASE_URL: url }, /sem caminho, parâmetros ou #/);
    recusa({ ...valido, SUPABASE_SERVICE_ROLE_KEY: `${CHAVE} extra` }, /não pode conter espaços/);
    recusa({ ...valido, SUPABASE_SERVICE_ROLE_KEY: 'curta' }, /parece incompleta/);
    recusa({ ...valido, SUPABASE_SERVICE_ROLE_KEY: jwtFicticio('anon') }, /chave pública \(anon\/publishable\)/);
    recusa({ ...valido, SUPABASE_SERVICE_ROLE_KEY: `sb_publishable_${'x'.repeat(30)}` }, /chave pública/);
    recusa({ ...valido, SUPABASE_SERVICE_ROLE_KEY: jwtFicticio('authenticated') }, /não é uma chave service role/);
    recusa({ ...valido, SUPABASE_BUCKET_PUBLICO: 'fotos', SUPABASE_BUCKET_PRIVADO: 'fotos' }, /precisam ser buckets diferentes/);
    recusa({ ...valido, SUPABASE_BUCKET_PUBLICO: 'Fotos', SUPABASE_BUCKET_PRIVADO: 'fotos' }, /precisam ser buckets diferentes|SUPABASE_BUCKET_PUBLICO deve ter/);
    recusa({ ...valido, SUPABASE_BUCKET_PUBLICO: 'peludinhos-privado' }, /precisam ser buckets diferentes/);
    for (const bucket of ['ab', 'Fotos', 'fotos publicas', '../fotos', 'fotos/sub', '-fotos', 'f'.repeat(64)]) recusa({ ...valido, SUPABASE_BUCKET_PRIVADO: bucket }, /SUPABASE_BUCKET_PRIVADO deve ter de 3 a 63/);
    for (const tempo of ['500', '200000', 'abc', '1.5', '-1']) recusa({ ...valido, SUPABASE_TIMEOUT_MS: tempo }, /SUPABASE_TIMEOUT_MS deve ser/);
});

test('cliente Supabase: só de servidor (sem sessão e sem renovação de token), sem rede na criação e com a chave só nos cabeçalhos', async () => {
    const chamadas = [];
    const criarCliente = (...argumentos) => { chamadas.push(argumentos); return require('@supabase/supabase-js').createClient(...argumentos); };
    const simulador = criarSimulador();
    const driver = criarDriverSupabase(configuracaoCom(), { fetch: simulador.fetch, criarCliente });
    assert.equal(chamadas.length, 1);
    const [url, chave, opcoes] = chamadas[0];
    assert.equal(url, URL_FICTICIA);
    assert.equal(chave, CHAVE);
    assert.deepEqual(opcoes.auth, { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false });
    assert.equal(typeof opcoes.global.fetch, 'function');
    assert.equal(simulador.requisicoes.length, 0, 'criar o cliente não acessa a rede');
    const armazenamento = criarArmazenamento({}, { driver });
    await armazenamento.salvar(AREAS.PUBLICA, nome(), png);
    const [envio] = simulador.requisicoes;
    assert.equal(envio.origem, URL_FICTICIA);
    assert.equal(envio.headers.get('authorization'), `Bearer ${CHAVE}`);
    assert.ok(envio.signal instanceof AbortSignal, 'toda requisição sai com tempo limite');
    assert.ok(semChave(JSON.stringify(armazenamento.descrever())) && semChave(util.inspect(armazenamento, { depth: 4 })));
});

// ---------------------------------------------------------------- interface (mesmo contrato do driver local)

test('upload e leitura: sem sobrescrita, com Content-Type correto, cada área no seu bucket', async () => {
    const { armazenamento, simulador } = novoSupabase();
    const publico = nome('animal');
    const privado = `perda-${randomUUID()}.webp`;
    const webp = Buffer.from('RIFF0000WEBPVP8 conteudo');
    assert.deepEqual(await armazenamento.salvar(AREAS.PUBLICA, publico, png), { area: 'publica', nome: publico, referencia: `/uploads/${publico}` });
    assert.deepEqual(await armazenamento.salvar(AREAS.PRIVADA, privado, webp), { area: 'privada', nome: privado, referencia: privado });
    const [envioPublico, envioPrivado] = simulador.requisicoes;
    assert.equal(envioPublico.caminho, `/object/peludinhos-publico/${publico}`);
    assert.equal(envioPublico.headers.get('x-upsert'), 'false');
    assert.equal(envioPublico.headers.get('content-type'), 'image/png');
    assert.equal(envioPrivado.caminho, `/object/peludinhos-privado/${privado}`);
    assert.equal(envioPrivado.headers.get('content-type'), 'image/webp');
    assert.deepEqual(objeto(simulador, 'peludinhos-publico', publico).bytes, png);
    assert.equal(objeto(simulador, 'peludinhos-publico', privado), undefined, 'a foto privada não vai para o bucket público');
    assert.equal(objeto(simulador, 'peludinhos-privado', publico), undefined);

    assert.equal(await armazenamento.existe(AREAS.PUBLICA, publico), true);
    assert.equal(await armazenamento.existe(AREAS.PUBLICA, privado), false);
    assert.deepEqual(await armazenamento.ler(AREAS.PUBLICA, publico), png);
    const arquivo = await armazenamento.abrirLeitura(AREAS.PRIVADA, privado);
    assert.equal(arquivo.tamanho, webp.length);
    assert.equal(arquivo.tipo, 'image/webp');
    const partes = [];
    for await (const parte of arquivo.stream) partes.push(parte);
    assert.deepEqual(Buffer.concat(partes), webp);
});

test('arquivo inexistente: existe é false, leitura falha com ARQUIVO_NAO_ENCONTRADO e exclusão devolve false', async () => {
    const { armazenamento } = novoSupabase();
    const ausente = nome();
    assert.equal(await armazenamento.existe(AREAS.PUBLICA, ausente), false);
    await assert.rejects(armazenamento.ler(AREAS.PUBLICA, ausente), codigo('ARQUIVO_NAO_ENCONTRADO'));
    await assert.rejects(armazenamento.abrirLeitura(AREAS.PRIVADA, ausente), codigo('ARQUIVO_NAO_ENCONTRADO'));
    assert.equal(await armazenamento.excluir(AREAS.PUBLICA, ausente), false);
    // Outros formatos de "objeto não encontrado" que o Storage pode devolver.
    for (const resposta of [() => json(404, { statusCode: '404', error: 'not_found', message: 'Object not found' }), () => json(404, { code: 'NoSuchKey', message: 'The specified key does not exist' })]) {
        const { armazenamento: outro, simulador } = novoSupabase();
        simulador.interceptar = () => resposta();
        await assert.rejects(outro.ler(AREAS.PUBLICA, ausente), codigo('ARQUIVO_NAO_ENCONTRADO'));
        assert.equal(await outro.existe(AREAS.PUBLICA, ausente), false);
    }
});

test('colisão: um nome já existente nunca é sobrescrito e vira ARQUIVO_JA_EXISTE', async () => {
    const { armazenamento, simulador } = novoSupabase();
    const repetido = nome();
    await armazenamento.salvar(AREAS.PUBLICA, repetido, png);
    await assert.rejects(armazenamento.salvar(AREAS.PUBLICA, repetido, outroPng), codigo('ARQUIVO_JA_EXISTE'));
    assert.deepEqual(objeto(simulador, 'peludinhos-publico', repetido).bytes, png, 'o conteúdo original continua');
    assert.ok(simulador.requisicoes.every(req => req.metodo !== 'DELETE'), 'nada é apagado por causa da colisão');
    // Formato com status 409 direto.
    simulador.interceptar = req => (req.metodo === 'POST' ? json(409, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' }) : undefined);
    await assert.rejects(armazenamento.salvar(AREAS.PRIVADA, nome('perda'), png), codigo('ARQUIVO_JA_EXISTE'));
});

test('exclusão: apaga só o arquivo pedido, no bucket da área', async () => {
    const { armazenamento, simulador } = novoSupabase();
    const alvo = nome('perda');
    const vizinho = nome('perda');
    await armazenamento.salvar(AREAS.PRIVADA, alvo, png);
    await armazenamento.salvar(AREAS.PRIVADA, vizinho, png);
    await armazenamento.salvar(AREAS.PUBLICA, alvo, png);
    assert.equal(await armazenamento.excluir(AREAS.PRIVADA, alvo), true);
    const exclusao = simulador.requisicoes.find(req => req.metodo === 'DELETE');
    assert.equal(exclusao.caminho, '/object/peludinhos-privado');
    assert.deepEqual(JSON.parse(exclusao.corpo), { prefixes: [alvo] });
    assert.equal(objeto(simulador, 'peludinhos-privado', alvo), undefined);
    assert.ok(objeto(simulador, 'peludinhos-privado', vizinho));
    assert.ok(objeto(simulador, 'peludinhos-publico', alvo), 'o arquivo de mesmo nome na outra área continua');
    assert.equal(await armazenamento.excluir(AREAS.PRIVADA, alvo), false);
});

test('nomes inválidos e path traversal são recusados antes de qualquer requisição ao Supabase', async () => {
    const { armazenamento, simulador } = novoSupabase();
    for (const invalido of ['../animal-1.png', 'sub/animal-1.png', '%2e%2e%2fanimal-1.png', 'Animal-1.png', 'animal-1.svg', 'animal-1.png?x=1', 'animal-1.png#a', '', null]) {
        for (const operacao of [() => armazenamento.salvar(AREAS.PUBLICA, invalido, png), () => armazenamento.existe(AREAS.PUBLICA, invalido), () => armazenamento.ler(AREAS.PRIVADA, invalido),
            () => armazenamento.abrirLeitura(AREAS.PRIVADA, invalido), () => armazenamento.excluir(AREAS.PRIVADA, invalido)]) {
            await assert.rejects(operacao(), codigo('NOME_DE_ARQUIVO_INVALIDO'), String(invalido));
        }
    }
    await assert.rejects(armazenamento.salvar(AREAS.PUBLICA, nome(), Buffer.alloc(0)), codigo('CONTEUDO_INVALIDO'));
    await assert.rejects(armazenamento.salvar('bucket-qualquer', nome(), png), codigo('AREA_INVALIDA'));
    assert.equal(simulador.requisicoes.length, 0);
});

// ---------------------------------------------------------------- erros, rede e tempo limite

test('mapeamento de erros: só "objeto não encontrado" vira inexistente; bucket, permissão e indisponibilidade são falhas distintas', async () => {
    const casos = [
        // [resposta simulada, operação, código esperado, motivo, resultado incerto]
        [semBucket, 'salvar', 'FALHA_NO_ARMAZENAMENTO', 'CONFIGURACAO', undefined],
        [semBucket, 'existe', 'FALHA_NO_ARMAZENAMENTO', 'CONFIGURACAO', undefined],
        [semBucket, 'ler', 'FALHA_NO_ARMAZENAMENTO', 'CONFIGURACAO', undefined],
        [semBucket, 'excluir', 'FALHA_NO_ARMAZENAMENTO', 'CONFIGURACAO', undefined],
        [() => json(400, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' }), 'salvar', 'FALHA_NO_ARMAZENAMENTO', 'PERMISSAO', undefined],
        [() => json(401, { statusCode: '401', error: 'Unauthorized', message: 'Invalid JWT' }), 'existe', 'FALHA_NO_ARMAZENAMENTO', 'PERMISSAO', undefined],
        [() => json(403, { code: 'AccessDenied', message: 'Access denied' }), 'ler', 'FALHA_NO_ARMAZENAMENTO', 'PERMISSAO', undefined],
        [() => json(500, { statusCode: '500', error: 'internal', message: 'Internal Server Error' }), 'salvar', 'FALHA_NO_ARMAZENAMENTO', 'INDISPONIVEL', true],
        [() => new Response('<html>Bad Gateway</html>', { status: 502, statusText: 'Bad Gateway' }), 'salvar', 'FALHA_NO_ARMAZENAMENTO', 'INDISPONIVEL', true],
        [() => json(503, { message: 'Service Unavailable' }), 'salvar', 'FALHA_NO_ARMAZENAMENTO', 'INDISPONIVEL', undefined],
        [() => json(429, { message: 'Too Many Requests' }), 'salvar', 'FALHA_NO_ARMAZENAMENTO', 'INDISPONIVEL', undefined],
        [() => json(500, { message: 'Internal Server Error' }), 'existe', 'FALHA_NO_ARMAZENAMENTO', 'INDISPONIVEL', undefined],
        [() => json(500, { message: 'Internal Server Error' }), 'excluir', 'FALHA_NO_ARMAZENAMENTO', 'INDISPONIVEL', true],
        [() => json(400, { statusCode: '400', error: 'InvalidKey', message: 'Invalid key' }), 'salvar', 'FALHA_NO_ARMAZENAMENTO', 'DESCONHECIDO', undefined],
        [() => json(400, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' }), 'excluir', 'FALHA_NO_ARMAZENAMENTO', 'DESCONHECIDO', undefined]
    ];
    for (const [resposta, operacao, esperado, motivo, incerto] of casos) {
        const { armazenamento, simulador } = novoSupabase();
        simulador.interceptar = () => resposta();
        const chamada = operacao === 'salvar' ? armazenamento.salvar(AREAS.PUBLICA, nome(), png) : armazenamento[operacao](AREAS.PRIVADA, nome('perda'));
        await assert.rejects(chamada, codigo(esperado, { motivo, resultadoIncerto: incerto }), `${operacao} ${motivo}`);
    }
});

test('falhas de rede: conexão recusada não grava nada; conexão perdida no envio deixa o resultado incerto; nada vira "inexistente"', async () => {
    for (const [codigoDeRede, incerto] of [['ECONNREFUSED', undefined], ['ENOTFOUND', undefined], ['ECONNRESET', true], ['UND_ERR_SOCKET', true]]) {
        const { armazenamento, simulador } = novoSupabase();
        simulador.interceptar = () => { throw erroDeRede(codigoDeRede); };
        await assert.rejects(armazenamento.salvar(AREAS.PUBLICA, nome(), png), codigo('FALHA_NO_ARMAZENAMENTO', { motivo: 'INDISPONIVEL', resultadoIncerto: incerto }), codigoDeRede);
        await assert.rejects(armazenamento.existe(AREAS.PUBLICA, nome()), codigo('FALHA_NO_ARMAZENAMENTO', { motivo: 'INDISPONIVEL' }));
        await assert.rejects(armazenamento.ler(AREAS.PRIVADA, nome('perda')), codigo('FALHA_NO_ARMAZENAMENTO', { motivo: 'INDISPONIVEL' }));
    }
    // Gravou no Supabase, mas a resposta se perdeu: o erro avisa que o arquivo pode ter ficado lá.
    const { armazenamento, simulador } = novoSupabase();
    const original = simulador.fetch;
    const perdido = nome();
    simulador.interceptar = async req => { if (req.metodo === 'POST') { simulador.interceptar = null; await original(`${URL_FICTICIA}/storage/v1${req.caminho}`, { method: 'POST', headers: req.headers, body: req.corpo }); throw erroDeRede('ECONNRESET'); } };
    await assert.rejects(armazenamento.salvar(AREAS.PUBLICA, perdido, png), erro => erro.resultadoIncerto === true && /resultado é incerto/.test(erro.message));
    assert.ok(objeto(simulador, 'peludinhos-publico', perdido), 'o objeto existe no bucket; a camada não o apaga sozinha');
});

test('tempo limite: requisições sem resposta (ou com corpo travado) são abortadas e viram TEMPO_ESGOTADO', async () => {
    const { armazenamento, simulador } = novoSupabase({ tempoLimiteMs: 60 });
    simulador.interceptar = pendurar;
    const inicio = Date.now();
    await assert.rejects(armazenamento.salvar(AREAS.PUBLICA, nome(), png), codigo('FALHA_NO_ARMAZENAMENTO', { motivo: 'TEMPO_ESGOTADO', resultadoIncerto: true }));
    assert.ok(Date.now() - inicio < 2000, 'aborta no prazo configurado');
    await assert.rejects(armazenamento.existe(AREAS.PUBLICA, nome()), codigo('FALHA_NO_ARMAZENAMENTO', { motivo: 'TEMPO_ESGOTADO' }));
    await assert.rejects(armazenamento.excluir(AREAS.PUBLICA, nome()), codigo('FALHA_NO_ARMAZENAMENTO', { motivo: 'TEMPO_ESGOTADO', resultadoIncerto: true }));
    // Cabeçalhos chegam, mas o corpo da foto trava no meio.
    simulador.interceptar = req => new Response(new ReadableStream({
        start(controle) { controle.enqueue(png.subarray(0, 10)); req.signal.addEventListener('abort', () => controle.error(req.signal.reason), { once: true }); }
    }), { status: 200, headers: { 'content-type': 'image/png' } });
    await assert.rejects(armazenamento.abrirLeitura(AREAS.PRIVADA, nome('perda')), codigo('FALHA_NO_ARMAZENAMENTO', { motivo: 'TEMPO_ESGOTADO' }));
    // Resposta grande demais para ser uma foto do sistema.
    simulador.interceptar = () => new Response(Buffer.alloc(11 * 1024 * 1024), { status: 200 });
    await assert.rejects(armazenamento.ler(AREAS.PRIVADA, nome('perda')), codigo('FALHA_NO_ARMAZENAMENTO', { motivo: 'RESPOSTA_INVALIDA' }));
});

test('credenciais nunca aparecem em erros, causas, logs ou descrições, mesmo quando o erro remoto as contém', async () => {
    const { armazenamento, simulador } = novoSupabase();
    const textos = [];
    for (const interceptar of [
        () => { throw new Error(`falha ao chamar com Authorization: Bearer ${CHAVE} e apikey=${CHAVE}`); },
        () => json(500, { message: `erro interno ecoando ${CHAVE}` }),
        () => json(400, { statusCode: '403', message: `Invalid JWT ${CHAVE}` })
    ]) {
        simulador.interceptar = interceptar;
        for (const chamada of [armazenamento.salvar(AREAS.PUBLICA, nome(), png), armazenamento.ler(AREAS.PRIVADA, nome('perda'))]) {
            const erro = await chamada.catch(e => e);
            assert.equal(erro.codigo, 'FALHA_NO_ARMAZENAMENTO');
            textos.push(erro.message, erro.cause && erro.cause.message, util.inspect(erro, { depth: 6 }), JSON.stringify(erro));
        }
        const log = capturarErros();
        try { await armazenamento.descartar(AREAS.PUBLICA, nome(), 'Contexto:'); } finally { log.restaurar(); }
        textos.push(...log.registros);
    }
    textos.push(JSON.stringify(armazenamento.descrever()), util.inspect(armazenamento.descrever()));
    assert.ok(textos.length > 10);
    for (const texto of textos) assert.ok(semChave(texto), `chave exposta em: ${String(texto).slice(0, 120)}`);
});

// ---------------------------------------------------------------- inicialização: buckets e permissões

test('verificar(): recusa bucket ausente, chave sem permissão e bucket privado público; Supabase fora do ar só gera aviso', async () => {
    assert.equal(await novoSupabase().armazenamento.verificar(), undefined);
    const casos = [
        [{ buckets: { 'peludinhos-publico': true } }, /bucket privado peludinhos-privado não encontrado/],
        [{ buckets: { 'peludinhos-publico': true, 'peludinhos-privado': true } }, /bucket privado peludinhos-privado está marcado como público/],
        [{ buckets: { 'peludinhos-publico': false, 'peludinhos-privado': false } }, /bucket público peludinhos-publico não está marcado como público/],
        [{ chave: jwtFicticio('service_role').replace('assinatura', 'outra') }, /sem permissão para acessar o bucket/]
    ];
    for (const [opcoes, mensagem] of casos) {
        const { armazenamento } = novoSupabase({ simulador: criarSimulador(opcoes) });
        await assert.rejects(armazenamento.verificar(), erro => /^Configuração do armazenamento inválida:/.test(erro.message) && mensagem.test(erro.message) && semChave(erro.message));
    }
    const { armazenamento, simulador } = novoSupabase();
    simulador.interceptar = () => { throw erroDeRede('ECONNREFUSED'); };
    const log = capturarErros();
    try { await armazenamento.verificar(); } finally { log.restaurar(); }
    assert.equal(log.registros.length, 1);
    assert.match(log.registros[0], /não respondeu na inicialização/);
    // O driver local não tem nada remoto a verificar.
    assert.equal(await criarArmazenamento({ UPLOADS_DIR: 'a', UPLOADS_PRIVATE_DIR: 'b' }).verificar(), undefined);
});

// ---------------------------------------------------------------- aplicação real (rotas e controllers), com banco falso

let servidor;
async function subirAplicacao() {
    if (servidor) return servidor;
    assert.equal(require('../server/config/database'), bancoFalso, 'o banco é o falso: nenhum PostgreSQL é acessado');
    const criarApp = require('../server/app');
    assert.equal(storage.armazenamento.driver, 'supabase');
    const http = criarApp({}).listen(0, '127.0.0.1');
    await new Promise(resolve => http.once('listening', resolve));
    servidor = { http, base: `http://127.0.0.1:${http.address().port}` };
    return servidor;
}
const token = jwt.sign({ id_usuario: 1, tipo_usuario: 'usuario' }, 'segredo-ficticio-apenas-deste-teste', { expiresIn: '10m' });
const comToken = (opcoes = {}) => ({ ...opcoes, headers: { Authorization: `Bearer ${token}`, ...opcoes.headers } });
function formularioPerdido(foto) {
    const corpo = new FormData();
    for (const [chave, valor] of Object.entries({ nome_animal: 'Perdido simulado', especie: 'Cachorro', local_desaparecimento: 'Praça', data_desaparecimento: '2025-01-15' })) corpo.append(chave, valor);
    if (foto) corpo.append('foto', new Blob([foto], { type: 'image/png' }), 'foto.png');
    return corpo;
}
function usarSimulador() {
    simuladorGlobal = criarSimulador();
    banco.consultas = [];
    banco.responder = null;
    return simuladorGlobal;
}

test('/uploads no modo supabase: redireciona só nomes válidos e existentes do bucket público, para a URL montada pelo servidor', async () => {
    const { base } = await subirAplicacao();
    const simulador = usarSimulador();
    const publico = nome('animal');
    const somentePrivado = nome('perda');
    await storage.armazenamento.salvar(AREAS.PUBLICA, publico, png);
    await storage.armazenamento.salvar(AREAS.PRIVADA, somentePrivado, png);
    const pedir = (caminho, opcoes = {}) => fetch(base + caminho, { redirect: 'manual', ...opcoes });

    const resposta = await pedir(`/uploads/${publico}?redirect=https://outro-site.example`);
    assert.equal(resposta.status, 302);
    assert.equal(resposta.headers.get('location'), `${URL_FICTICIA}/storage/v1/object/public/peludinhos-publico/${publico}`);
    assert.equal(resposta.headers.get('cache-control'), 'public, max-age=300');
    assert.ok(semChave(resposta.headers.get('location')) && !/token|apikey/i.test(resposta.headers.get('location')));
    assert.equal((await pedir(`/uploads/${publico}`, { method: 'HEAD' })).status, 302);

    // Inexistente, privado, inválido ou tentativa de destino arbitrário: o mesmo 404 em JSON do modo local.
    simulador.requisicoes.length = 0;
    for (const caminho of [`/uploads/${nome()}`, `/uploads/${somentePrivado}`]) {
        const naoAchou = await pedir(caminho);
        assert.equal(naoAchou.status, 404, caminho);
        assert.equal((await naoAchou.json()).erro, 'Arquivo não encontrado.');
    }
    assert.ok(simulador.requisicoes.every(req => req.caminho.startsWith('/object/info/peludinhos-publico/')), 'só o bucket público é consultado');
    simulador.requisicoes.length = 0;
    for (const caminho of ['/uploads//outro-site.example/animal-1.png', '/uploads/https:%2F%2Foutro-site.example%2Fanimal-1.png', '/uploads/..%2fperda-1.png',
        `/uploads/${publico}/..`, '/uploads/%61nimal-1.png', '/uploads/Animal-1.png', '/uploads/a/animal-1.png', '/uploads/', `/uploads/${publico}%00`]) {
        const resposta404 = await pedir(caminho);
        assert.equal(resposta404.status, 404, caminho);
        assert.equal(resposta404.headers.get('location'), null);
    }
    assert.equal((await pedir(`/uploads/${publico}`, { method: 'POST' })).status, 404);
    assert.equal(simulador.requisicoes.length, 0, 'nomes inválidos não chegam ao Supabase');

    // Fotos de perfil são privadas: /uploads nunca as entrega, nem uma antiga que esteja no bucket público.
    const perfilAntigo = `usuario-1-${Date.now()}.png`;
    await storage.armazenamento.salvar(AREAS.PUBLICA, perfilAntigo, png);
    simulador.requisicoes.length = 0;
    const perfil = await pedir(`/uploads/${perfilAntigo}`);
    assert.equal(perfil.status, 404);
    assert.equal(perfil.headers.get('location'), null);
    assert.equal(simulador.requisicoes.length, 0, 'nem consulta o Supabase');

    // Existência em cache por alguns minutos; excluir pela camada limpa o cache.
    await pedir(`/uploads/${publico}`);
    assert.equal(simulador.requisicoes.length, 0, 'a segunda consulta usa o cache');
    await storage.armazenamento.excluir(AREAS.PUBLICA, publico);
    assert.equal((await pedir(`/uploads/${publico}`)).status, 404);

    // Supabase fora do ar: 503 em JSON, sem cache, sem detalhes internos.
    const indisponivel = nome('animal');
    simulador.interceptar = () => { throw erroDeRede('ECONNREFUSED'); };
    const log = capturarErros();
    let falha;
    try { falha = await pedir(`/uploads/${indisponivel}`); } finally { log.restaurar(); }
    assert.equal(falha.status, 503);
    assert.equal(falha.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await falha.json(), { erro: 'Não foi possível carregar a foto.' });
    assert.ok(log.registros.every(semChave));
});

test('foto antiga de desaparecimento (de quando eram privadas) continua lida pelo backend, com os mesmos cabeçalhos e sem URL do bucket', async () => {
    const { base } = await subirAplicacao();
    const simulador = usarSimulador();
    const arquivo = nome('perda');
    await storage.armazenamento.salvar(AREAS.PRIVADA, arquivo, png);
    banco.responder = sql => (/SELECT foto FROM Publica_Perda/.test(sql) ? { rows: [{ foto: arquivo }], rowCount: 1 } : undefined);

    assert.equal((await fetch(`${base}/api/perdidos/5/foto`)).status, 401, 'continua exigindo login');
    simulador.requisicoes.length = 0;
    const foto = await fetch(`${base}/api/perdidos/5/foto`, comToken({ redirect: 'manual' }));
    assert.equal(foto.status, 200);
    assert.equal(foto.headers.get('content-type'), 'image/png');
    assert.equal(foto.headers.get('content-length'), String(png.length));
    assert.equal(foto.headers.get('cache-control'), 'private, no-store');
    assert.equal(foto.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(foto.headers.get('location'), null);
    assert.deepEqual(Buffer.from(await foto.arrayBuffer()), png);
    assert.deepEqual(simulador.requisicoes.map(req => `${req.metodo} ${req.caminho}`), [`GET /object/peludinhos-privado/${arquivo}`], 'só o bucket privado, só pelo backend');

    // Não encontrada no bucket: 404 em JSON; falha ou demora do Supabase: 500 em JSON. Nunca um 200 incompleto.
    const casos = [[() => naoEncontrado(), 404, 'Foto não encontrada.'], [() => json(500, { message: 'erro' }), 500, 'Não foi possível carregar a foto.'], [pendurar, 500, 'Não foi possível carregar a foto.']];
    for (const [interceptar, status, mensagem] of casos) {
        simulador.interceptar = interceptar;
        const log = capturarErros();
        let resposta;
        try { resposta = await fetch(`${base}/api/perdidos/5/foto`, comToken()); } finally { log.restaurar(); }
        assert.equal(resposta.status, status);
        assert.match(resposta.headers.get('content-type'), /application\/json/);
        assert.equal(resposta.headers.get('cache-control'), 'private, no-store');
        assert.equal((await resposta.json()).erro, mensagem);
        assert.ok(log.registros.every(semChave));
    }
    // Valor do banco fora do formato: nenhuma requisição ao Supabase.
    simulador.interceptar = null;
    simulador.requisicoes.length = 0;
    banco.responder = () => ({ rows: [{ foto: '../peludinhos-publico/animal-1.png' }], rowCount: 1 });
    assert.equal((await fetch(`${base}/api/perdidos/5/foto`, comToken())).status, 404);
    assert.equal(simulador.requisicoes.length, 0);
});

test('compensação no modo supabase: foto enviada antes de a transação falhar é apagada; colisão e resultado incerto nunca apagam', async () => {
    const { base } = await subirAplicacao();
    const respostasDaPublicacao = falharNoInsert => sql => {
        if (/SELECT telefone FROM Usuario/.test(sql)) return { rows: [{ telefone: '93991234567' }], rowCount: 1 };
        if (/INSERT INTO Publica_Perda/.test(sql)) return falharNoInsert ? new Error('falha simulada no banco') : { rows: [{ id_perda: '9' }], rowCount: 1 };
        return undefined;
    };
    const publicar = () => fetch(`${base}/api/perdidos`, comToken({ method: 'POST', body: formularioPerdido(png) }));

    // 1. Upload gravado, INSERT falha: ROLLBACK e a foto nova é apagada do bucket público (desaparecimentos são públicos).
    let simulador = usarSimulador();
    banco.responder = respostasDaPublicacao(true);
    let log = capturarErros();
    let resposta;
    try { resposta = await publicar(); } finally { log.restaurar(); }
    assert.equal(resposta.status, 500);
    const envio = simulador.requisicoes.find(req => req.metodo === 'POST');
    const enviado = envio.caminho.split('/').at(-1);
    assert.match(enviado, /^perda-[0-9a-f-]{36}\.png$/);
    assert.equal(envio.caminho, `/object/peludinhos-publico/${enviado}`);
    const exclusao = simulador.requisicoes.find(req => req.metodo === 'DELETE');
    assert.equal(exclusao.caminho, '/object/peludinhos-publico');
    assert.deepEqual(JSON.parse(exclusao.corpo), { prefixes: [enviado] });
    assert.equal(simulador.objetos.size, 0, 'nenhuma foto órfã no bucket');
    assert.ok(banco.consultas.includes('ROLLBACK'));

    // 2. Colisão (o nome já existe no bucket): nada é apagado e o INSERT nem é tentado.
    simulador = usarSimulador();
    banco.responder = respostasDaPublicacao(false);
    simulador.interceptar = req => (req.metodo === 'POST' ? json(400, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' }) : undefined);
    log = capturarErros();
    try { resposta = await publicar(); } finally { log.restaurar(); }
    assert.equal(resposta.status, 500);
    assert.ok(simulador.requisicoes.every(req => req.metodo !== 'DELETE'), 'o arquivo preexistente nunca é apagado');
    assert.ok(!banco.consultas.some(sql => /INSERT INTO Publica_Perda/.test(sql)) && banco.consultas.includes('ROLLBACK'));

    // 3. Resultado incerto (tempo esgotado no envio, prazo de 1 s da instância): ROLLBACK, nada é apagado, e o log avisa.
    simulador = usarSimulador();
    banco.responder = respostasDaPublicacao(false);
    simulador.interceptar = req => (req.metodo === 'POST' ? pendurar(req) : undefined);
    log = capturarErros();
    try { resposta = await publicar(); } finally { log.restaurar(); }
    assert.equal(resposta.status, 500);
    assert.ok(simulador.requisicoes.every(req => req.metodo !== 'DELETE'));
    assert.ok(log.registros.some(registro => /resultado é incerto/.test(registro)));
    assert.ok(log.registros.every(semChave));

    // 4. Foto antiga que não pode ser apagada depois do COMMIT: a edição vale e o erro vai para o log.
    simulador = usarSimulador();
    const antiga = nome('perda');
    await storage.armazenamento.salvar(AREAS.PUBLICA, antiga, png);
    banco.responder = sql => {
        if (/FROM Publica_Perda WHERE id_perda = \$1 FOR UPDATE/.test(sql)) return { rows: [{ id_usuario_tutor: '1', foto: `/uploads/${antiga}` }], rowCount: 1 };
        if (/SELECT .* FROM Publica_Perda p WHERE p.id_perda/s.test(sql)) return { rows: [{ id_perda: '9', tem_foto: true }], rowCount: 1 };
        return undefined;
    };
    simulador.interceptar = req => (req.metodo === 'DELETE' ? json(500, { message: 'erro ao apagar' }) : undefined);
    log = capturarErros();
    try { resposta = await fetch(`${base}/api/perdidos/9`, comToken({ method: 'PUT', body: formularioPerdido(outroPng) })); } finally { log.restaurar(); }
    assert.equal(resposta.status, 200);
    assert.ok(banco.consultas.includes('COMMIT'));
    assert.deepEqual(JSON.parse(simulador.requisicoes.find(req => req.metodo === 'DELETE').corpo), { prefixes: [antiga] });
    assert.ok(log.registros.some(registro => registro.includes(`Foto ${antiga} não pôde ser apagada`)));
    assert.ok(log.registros.every(semChave));
});

test('foto de perfil no modo supabase: bucket privado, lida pelo backend só para a própria conta ou administradores', async () => {
    const { base } = await subirAplicacao();
    const simulador = usarSimulador();
    const arquivo = `usuario-1-${Date.now()}.png`;
    await storage.armazenamento.salvar(AREAS.PRIVADA, arquivo, png);
    assert.equal(simulador.requisicoes.at(-1).caminho, `/object/peludinhos-privado/${arquivo}`);
    banco.responder = sql => {
        if (/SELECT foto_perfil FROM Usuario/.test(sql)) return { rows: [{ foto_perfil: arquivo }], rowCount: 1 };
        if (/SELECT tipo_usuario FROM Usuario/.test(sql)) return { rows: [{ tipo_usuario: 'usuario' }], rowCount: 1 };
        return undefined;
    };
    assert.equal((await fetch(`${base}/api/usuarios/1/foto`)).status, 401);
    simulador.requisicoes.length = 0;
    const foto = await fetch(`${base}/api/usuarios/1/foto`, comToken({ redirect: 'manual' }));
    assert.equal(foto.status, 200);
    assert.equal(foto.headers.get('content-type'), 'image/png');
    assert.equal(foto.headers.get('cache-control'), 'private, no-store');
    assert.equal(foto.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(foto.headers.get('location'), null);
    assert.deepEqual(Buffer.from(await foto.arrayBuffer()), png);
    assert.deepEqual(simulador.requisicoes.map(req => `${req.metodo} ${req.caminho}`), [`GET /object/peludinhos-privado/${arquivo}`], 'só o bucket privado, só pelo backend');
    // Foto de outra conta, pedida por um usuário comum: 403, sem consultar o Storage.
    simulador.requisicoes.length = 0;
    assert.equal((await fetch(`${base}/api/usuarios/2/foto`, comToken())).status, 403);
    assert.equal(simulador.requisicoes.length, 0);
    // Pela rota pública, nunca.
    assert.equal((await fetch(`${base}/uploads/${arquivo}`, { redirect: 'manual' })).status, 404);
});
