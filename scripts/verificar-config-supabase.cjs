// npm run supabase:verificar: confere o arquivo da validação local com o Supabase real (padrão .env.supabase.local)
// SEM abrir nenhuma conexão. Usa as mesmas validações do servidor e mais as desta validação.
// Nunca mostra senha, chave, segredo ou a URL completa do banco; só nomes de variáveis e o resultado.
// Uso: node scripts/verificar-config-supabase.cjs [--arquivo-env=<arquivo>]
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const dotenv = require('dotenv');
const { montarConfiguracao, ehBancoLocal } = require('../server/config/databaseConfig');
const { lerConfiguracaoServidor, validarSegredoJwt } = require('../server/config/serverConfig');
const { lerConfiguracaoSupabase } = require('../server/storage/supabase');

const RAIZ = path.join(__dirname, '..');
const PADRAO = '.env.supabase.local';
const opcao = process.argv.find(item => item.startsWith('--arquivo-env='));
const escolhido = opcao ? opcao.slice('--arquivo-env='.length).trim() : PADRAO;
const arquivo = path.resolve(RAIZ, escolhido);
const texto = valor => (typeof valor === 'string' ? valor.trim() : '');
// Textos dos arquivos de exemplo: indicam que o campo ainda não foi preenchido.
const MARCAS_DE_EXEMPLO = ['[YOUR-PASSWORD]', 'SEU_PROJETO', 'SUA_SENHA', 'coloque_a_chave', 'gere_um_segredo'];

const resultados = [];
const ok = descricao => resultados.push({ ok: true, descricao });
const falha = descricao => resultados.push({ ok: false, descricao });
const aviso = descricao => resultados.push({ ok: true, aviso: true, descricao });
function conferir(descricao, funcao) {
    try {
        const extra = funcao();
        ok(extra ? `${descricao} (${extra})` : descricao);
        return true;
    } catch (erro) {
        falha(`${descricao}: ${erro.message.replace(/^Configuração [^:]+ inválida:\s*-?\s*/, '')}`);
        return false;
    }
}
// Fora do repositório o arquivo não pode ser versionado; dentro, precisa estar no .gitignore.
function ignoradoPeloGit(caminho) {
    const relativo = path.relative(RAIZ, caminho);
    if (relativo.startsWith('..') || path.isAbsolute(relativo)) return 'fora do repositório';
    const resultado = spawnSync('git', ['check-ignore', '-q', relativo], { cwd: RAIZ });
    if (resultado.status !== 0) throw new Error(`${relativo} NÃO está ignorado pelo Git`);
    return 'ignorado pelo Git';
}
function lerOutro(nome) {
    const caminho = path.join(RAIZ, nome);
    return fs.existsSync(caminho) ? dotenv.parse(fs.readFileSync(caminho)) : {};
}

function verificar() {
    if (!fs.existsSync(arquivo)) {
        falha(`arquivo ${escolhido} não encontrado: copie .env.supabase.local.example para ${PADRAO} e preencha`);
        return;
    }
    conferir(`arquivo ${escolhido}`, () => ignoradoPeloGit(arquivo));
    const env = dotenv.parse(fs.readFileSync(arquivo));

    // Campos ainda com o texto de exemplo.
    const pendentes = Object.entries(env).filter(([, valor]) => MARCAS_DE_EXEMPLO.some(marca => valor.includes(marca))).map(([nome]) => nome);
    if (pendentes.length) falha(`ainda com o texto de exemplo: ${pendentes.join(', ')}`);
    else ok('nenhum campo com texto de exemplo');

    // Nada de variáveis públicas do frontend nem do banco local neste arquivo.
    const publicas = Object.keys(env).filter(nome => nome.startsWith('VITE_'));
    if (publicas.length) falha(`variáveis VITE_* não pertencem a este arquivo (seriam públicas): ${publicas.join(', ')}`);
    const locais = Object.keys(env).filter(nome => /^DB_(HOST|PORT|USER|PASSWORD|NAME)$/.test(nome));
    if (locais.length) aviso(`${locais.join(', ')} são ignoradas quando há DATABASE_URL; podem ser removidas`);

    // Banco: Session pooler do Supabase, TLS com verificação do certificado.
    let referenciaDoProjeto = null;
    const url = texto(env.DATABASE_URL);
    if (!url) {
        falha('defina DATABASE_URL com a URI do Session pooler');
    } else if (!pendentes.includes('DATABASE_URL')) {
        conferir('DATABASE_URL aponta para o Session pooler do Supabase (porta 5432, banco postgres)', () => {
            const endereco = new URL(url);
            if (!endereco.hostname.endsWith('.pooler.supabase.com')) throw new Error('o host não é *.pooler.supabase.com');
            if (endereco.port !== '5432') throw new Error('use a porta 5432 (Session pooler), não a 6543 (Transaction pooler)');
            if (decodeURIComponent(endereco.pathname.slice(1)) !== 'postgres') throw new Error('o banco deve ser postgres');
            const usuario = decodeURIComponent(endereco.username);
            if (!/^postgres\.[a-z0-9]+$/.test(usuario)) throw new Error('o usuário deve ter o formato postgres.<projeto>');
            if (!endereco.password) throw new Error('a senha do banco não foi preenchida');
            referenciaDoProjeto = usuario.slice('postgres.'.length);
            return `host ${endereco.hostname}`;
        });
    }
    let configuracaoDoBanco = null;
    if (url && !pendentes.includes('DATABASE_URL')) {
        conferir('configuração do banco válida', () => { configuracaoDoBanco = montarConfiguracao(env); });
    }
    if (configuracaoDoBanco) {
        conferir('banco remoto (não é o PostgreSQL local de desenvolvimento ou de testes)', () => {
            if (ehBancoLocal(configuracaoDoBanco)) throw new Error('aponta para um banco local');
        });
        conferir('TLS ligado, com verificação do certificado e CA do Supabase', () => {
            const ssl = configuracaoDoBanco.ssl;
            if (!ssl || ssl.rejectUnauthorized !== true) throw new Error('DATABASE_SSL=true é obrigatório');
            if (!ssl.ca) throw new Error('informe o certificado em DATABASE_SSL_CA_FILE (ou DATABASE_SSL_CA)');
            const certificado = new crypto.X509Certificate(ssl.ca);
            if (!certificado.ca) throw new Error('o arquivo não é o certificado de uma autoridade certificadora (CA)');
            if (new Date(certificado.validTo) <= new Date()) throw new Error(`o certificado venceu em ${certificado.validTo}`);
            return `válido até ${new Date(certificado.validTo).toISOString().slice(0, 10)}`;
        });
        if (texto(env.DATABASE_SSL_CA_FILE)) conferir('arquivo do certificado', () => ignoradoPeloGit(path.resolve(RAIZ, texto(env.DATABASE_SSL_CA_FILE))));
    }

    // Storage: driver supabase, mesmo projeto do banco, buckets diferentes.
    conferir('STORAGE_DRIVER=supabase', () => { if (texto(env.STORAGE_DRIVER).toLowerCase() !== 'supabase') throw new Error('defina STORAGE_DRIVER=supabase'); });
    if (!pendentes.some(nome => nome.startsWith('SUPABASE_'))) {
        conferir('configuração do Supabase Storage válida (URL, chave service role, buckets diferentes, tempo limite)', () => {
            const supabase = lerConfiguracaoSupabase(env);
            if (referenciaDoProjeto && new URL(supabase.url).hostname !== `${referenciaDoProjeto}.supabase.co`) {
                throw new Error('SUPABASE_URL e DATABASE_URL são de projetos diferentes');
            }
            return `buckets ${supabase.bucketPublico} e ${supabase.bucketPrivado}`;
        });
    }

    // Servidor: porta, CORS, segredo novo.
    conferir('PORT, SERVE_FRONTEND, CORS_ORIGIN e DIAGNOSTICO_BANCO válidos', () => {
        const servidor = lerConfiguracaoServidor(env, []);
        if (servidor.servirFrontend) throw new Error('use SERVE_FRONTEND=false (frontend separado)');
        const portaDev = texto(lerOutro('.env').PORT) || '3001';
        if (String(servidor.porta) === portaDev) aviso(`PORT igual à do desenvolvimento (${portaDev}): os dois não poderão rodar ao mesmo tempo`);
        return `porta ${servidor.porta}`;
    });
    if (!pendentes.includes('JWT_SECRET')) {
        conferir('JWT_SECRET forte e diferente dos ambientes de desenvolvimento e de testes', () => {
            validarSegredoJwt(env);
            const segredo = texto(env.JWT_SECRET);
            if (segredo === texto(lerOutro('.env').JWT_SECRET)) throw new Error('é o mesmo do .env');
            if (segredo === texto(lerOutro('.env.test').JWT_SECRET)) throw new Error('é o mesmo do .env.test');
        });
    }
}

verificar();
console.log(`Verificação de ${escolhido} (sem conexão com o Supabase):`);
for (const item of resultados) console.log(`  ${item.ok ? (item.aviso ? '[AVISO]' : '[OK]   ') : '[ERRO] '} ${item.descricao}`);
const erros = resultados.filter(item => !item.ok).length;
console.log(erros ? `\n${erros} problema(s): corrija o arquivo antes de iniciar.` : '\nTudo certo para iniciar com: npm.cmd run start:supabase');
process.exitCode = erros ? 1 : 0;
