// Isola os testes de integração: só rodam no banco local de testes e só mexem nas pastas de fotos de teste.
// Deve ser o primeiro require de cada arquivo de teste que usa o banco, antes do pool e do servidor.
//
// 1. Lê as credenciais de teste do .env.test (nunca do .env de desenvolvimento) e recusa configurações
//    inseguras antes de qualquer conexão: banco remoto, DATABASE_URL, banco de desenvolvimento, nome sem
//    o sufixo _test, usuário postgres, pastas de fotos reais.
// 2. Antes da primeira consulta, confere o banco efetivamente conectado (nome, marcador e papel sem
//    privilégios de superusuário). Se algo não conferir, nenhuma consulta é executada.
// 3. Os servidores iniciados pelos testes herdam as mesmas regras (NODE_OPTIONS carrega este arquivo neles).
// 4. O armazenamento de fotos é sempre o driver local (STORAGE_DRIVER=local), nas pastas de teste.
const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const { validarAmbienteDeTeste, conferirBancoConectado, bloqueio, texto, RAIZ, CONSULTA_DO_BANCO } = require('./regrasAmbienteTeste.cjs');

const JA_CARREGADO = 'PELUDINHOS_AMBIENTE_DE_TESTE';
// Variáveis do .env que, se herdadas, poderiam levar o servidor de teste a outro banco.
const NEUTRALIZAR = ['DATABASE_URL', 'DATABASE_SSL', 'DATABASE_SSL_CA', 'DATABASE_SSL_CA_FILE'];

// Consulta feita por uma conexão própria, fora do pool, para não depender do que está sendo protegido.
async function verificarBancoConectado(configuracao, esperado) {
    const { Client } = require('pg');
    const cliente = new Client(configuracao);
    try {
        await cliente.connect();
        conferirBancoConectado((await cliente.query(CONSULTA_DO_BANCO)).rows[0], esperado);
    } finally {
        await cliente.end().catch(() => {});
    }
}

// Nenhuma consulta nem conexão do pool sai antes da verificação do banco conectado.
function protegerPool(pool, verificar) {
    let verificacao;
    const garantir = () => (verificacao ??= verificar());
    const consultar = pool.query.bind(pool);
    const conectar = pool.connect.bind(pool);
    pool.query = (...argumentos) => {
        const callback = typeof argumentos.at(-1) === 'function' ? argumentos.pop() : null;
        const resultado = garantir().then(() => consultar(...argumentos));
        if (!callback) return resultado;
        resultado.then(linhas => callback(undefined, linhas), callback);
    };
    // pg-pool chama connect(callback) internamente em query(); o callback recebe (erro, cliente, release)
    pool.connect = callback => {
        const resultado = garantir().then(() => conectar());
        if (!callback) return resultado;
        resultado.then(cliente => callback(undefined, cliente, cliente.release), erro => callback(erro));
    };
    return pool;
}

// APLICA AS REGRAS NESTE PROCESSO
function lerArquivo(arquivo) {
    return fs.existsSync(arquivo) ? dotenv.parse(fs.readFileSync(arquivo)) : null;
}

function carregarAmbienteDeTeste() {
    // O ambiente alternativo (--arquivo-env, usado na validação com o Supabase real) nunca vale nos testes,
    // nem no processo de teste nem nos servidores iniciados por ele.
    if (process.argv.some(item => typeof item === 'string' && item.startsWith('--arquivo-env')) || texto(process.env.PELUDINHOS_ARQUIVO_ENV)) {
        throw bloqueio(['a opção --arquivo-env (ambiente do Supabase real) não pode ser usada nos testes.']);
    }
    const herdado = process.env[JA_CARREGADO] === '1';
    if (!herdado) {
        // ARQUIVO_ENV_TESTE permite outro arquivo (usado pelos testes do próprio bloqueio); padrão: .env.test
        const arquivo = path.resolve(RAIZ, texto(process.env.ARQUIVO_ENV_TESTE) || '.env.test');
        const teste = lerArquivo(arquivo);
        if (!teste) {
            throw bloqueio([`arquivo ${path.relative(RAIZ, arquivo)} não encontrado. Copie .env.test.example para .env.test e siga a seção Testes do README.`]);
        }
        const dev = lerArquivo(path.join(RAIZ, '.env')) || {};
        validarAmbienteDeTeste(teste, dev);
        // Os valores de teste substituem os do terminal; o que poderia apontar para outro banco é anulado.
        // server.js carrega o .env com dotenv, que não sobrescreve variáveis já definidas (inclusive vazias).
        for (const nome of NEUTRALIZAR) process.env[nome] = '';
        // Variáveis SUPABASE_* do terminal ou do .env também são anuladas, e o armazenamento é sempre o local.
        for (const nome of [...Object.keys(process.env), ...Object.keys(dev)]) if (nome.startsWith('SUPABASE_')) process.env[nome] = '';
        Object.assign(process.env, teste);
        process.env.STORAGE_DRIVER = 'local';
        process.env[JA_CARREGADO] = '1';
        // Todo processo Node iniciado pelos testes (como server/server.js) carrega este arquivo primeiro.
        // Barras normais: dentro de aspas, o NODE_OPTIONS trata a barra invertida como escape.
        const opcao = `--require "${__filename.replaceAll(path.sep, '/')}"`;
        if (!(process.env.NODE_OPTIONS || '').includes(opcao)) process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS || ''} ${opcao}`.trim();
    }
    // No processo filho, as variáveis herdadas são validadas de novo (e precisam continuar válidas).
    const dev = lerArquivo(path.join(RAIZ, '.env')) || {};
    const ambiente = validarAmbienteDeTeste(process.env, dev);
    if (NEUTRALIZAR.some(nome => texto(process.env[nome]))) throw bloqueio(['variáveis de banco remoto (DATABASE_URL, DATABASE_SSL*) não podem estar definidas nos testes.']);
    for (const pasta of Object.values(ambiente.pastas)) fs.mkdirSync(pasta, { recursive: true });
    // Confere o armazenamento que o servidor (app.js e controllers) vai de fato usar: driver local nas pastas de teste.
    const usado = require('../../server/storage').armazenamento.descrever();
    if (usado.driver !== 'local' || path.relative(usado.publica, ambiente.pastas.publica) !== '' || path.relative(usado.privada, ambiente.pastas.privada) !== '') {
        throw bloqueio(['o servidor não está usando o armazenamento local nas pastas de fotos de teste.']);
    }
    protegerPool(require('../../server/config/database'), () => verificarBancoConectado(ambiente.configuracao, ambiente));
    return ambiente;
}

const ambiente = carregarAmbienteDeTeste();

module.exports = { pastasDeUpload: ambiente.pastas, bancoDeTeste: ambiente.banco, verificarBancoConectado, protegerPool };
