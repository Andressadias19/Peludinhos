// Regras do ambiente de testes, sem efeitos colaterais: não lê arquivos, não altera process.env, não conecta.
// Usadas por bancoLocal.cjs e testadas diretamente em tests/isolamento.test.cjs.
const path = require('node:path');
const { montarConfiguracao, ehBancoLocal } = require('../../server/config/databaseConfig');
const { pastasSeSobrepoem, PASTA_PUBLICA_PADRAO, PASTA_PRIVADA_PADRAO } = require('../../server/config/uploadsConfig');

const RAIZ = path.join(__dirname, '..', '..');
const SUFIXO_DO_BANCO = '_test';
// Gravado com COMMENT ON DATABASE na criação do banco de testes (veja o README).
const MARCADOR_DO_BANCO = 'peludinhos:testes-automatizados';
const BANCOS_PROIBIDOS = ['peludinhos', 'postgres', 'template0', 'template1'];
const USUARIOS_PROIBIDOS = ['postgres'];
const OBRIGATORIAS = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'JWT_SECRET', 'UPLOADS_DIR', 'UPLOADS_PRIVATE_DIR'];

const texto = valor => (typeof valor === 'string' ? valor.trim() : '');
const bloqueio = motivos => new Error(`Testes bloqueados: ${motivos.join(' ')}`);

// REGRAS ESTÁTICAS (sem conexão). teste: variáveis do .env.test; dev: variáveis do .env de desenvolvimento.
function validarAmbienteDeTeste(teste, dev = {}) {
    const motivos = [];
    const faltando = OBRIGATORIAS.filter(nome => !texto(teste[nome]));
    if (faltando.length) motivos.push(`Defina ${faltando.join(', ')} no arquivo de ambiente de testes.`);
    if (texto(teste.DATABASE_URL)) motivos.push('DATABASE_URL não é aceita nos testes: use DB_HOST, DB_PORT, DB_USER, DB_PASSWORD e DB_NAME de um PostgreSQL local.');
    if (motivos.length) throw bloqueio(motivos);

    const banco = texto(teste.DB_NAME);
    const usuario = texto(teste.DB_USER);
    let configuracao;
    try {
        configuracao = montarConfiguracao({ DB_HOST: teste.DB_HOST, DB_PORT: teste.DB_PORT, DB_USER: usuario, DB_PASSWORD: teste.DB_PASSWORD, DB_NAME: banco });
    } catch (erro) {
        throw bloqueio([erro.message]);
    }
    if (!ehBancoLocal(configuracao)) motivos.push('DB_HOST não aponta para um PostgreSQL local (localhost, 127.0.0.1, ::1 ou socket Unix).');
    if (!banco.endsWith(SUFIXO_DO_BANCO)) motivos.push(`DB_NAME precisa terminar em ${SUFIXO_DO_BANCO}, para indicar um banco exclusivo de testes.`);
    if (BANCOS_PROIBIDOS.includes(banco.toLowerCase())) motivos.push(`O banco ${banco} não pode ser usado pelos testes.`);
    if (texto(dev.DB_NAME) && texto(dev.DB_NAME).toLowerCase() === banco.toLowerCase()) motivos.push('DB_NAME de testes é o mesmo banco do .env de desenvolvimento.');
    if (texto(dev.DATABASE_URL)) {
        try {
            if (decodeURIComponent(new URL(dev.DATABASE_URL).pathname.slice(1)).toLowerCase() === banco.toLowerCase()) motivos.push('DB_NAME de testes é o mesmo banco da DATABASE_URL do .env.');
        } catch { /* URL inválida: o servidor de desenvolvimento já a recusa */ }
    }
    if (USUARIOS_PROIBIDOS.includes(usuario.toLowerCase()) || (texto(dev.DB_USER) && texto(dev.DB_USER).toLowerCase() === usuario.toLowerCase())) {
        motivos.push('DB_USER de testes precisa ser um usuário PostgreSQL exclusivo, diferente do usuário de desenvolvimento e do postgres.');
    }
    if (texto(dev.JWT_SECRET) && texto(dev.JWT_SECRET) === texto(teste.JWT_SECRET)) motivos.push('JWT_SECRET de testes precisa ser diferente do usado em desenvolvimento.');
    // Armazenamento: só o driver local, nas pastas de teste; nada de armazenamento remoto (futuro Supabase Storage).
    if (texto(teste.STORAGE_DRIVER) && texto(teste.STORAGE_DRIVER).toLowerCase() !== 'local') motivos.push('STORAGE_DRIVER de testes precisa ser local: os testes nunca usam armazenamento remoto.');
    const remotas = Object.keys(teste).filter(nome => nome.startsWith('SUPABASE_') && texto(teste[nome]));
    if (remotas.length) motivos.push(`Variáveis de serviços remotos não são aceitas nos testes: ${remotas.join(', ')}.`);

    const publica = path.resolve(RAIZ, texto(teste.UPLOADS_DIR));
    const privada = path.resolve(RAIZ, texto(teste.UPLOADS_PRIVATE_DIR));
    for (const [nome, pasta] of [['UPLOADS_DIR', publica], ['UPLOADS_PRIVATE_DIR', privada]]) {
        if ([PASTA_PUBLICA_PADRAO, PASTA_PRIVADA_PADRAO].some(real => pastasSeSobrepoem(pasta, real))) {
            motivos.push(`${nome} não pode ser, conter nem ficar dentro das pastas reais de fotos (server/uploads e server/uploads-perdidos).`);
        }
    }
    if (pastasSeSobrepoem(publica, privada)) motivos.push('UPLOADS_DIR e UPLOADS_PRIVATE_DIR precisam ser pastas diferentes, sem uma dentro da outra.');
    if (motivos.length) throw bloqueio(motivos);

    return { banco, usuario, configuracao, pastas: { publica, privada } };
}

// REGRA DO BANCO CONECTADO: linha devolvida pela CONSULTA_DO_BANCO.
const CONSULTA_DO_BANCO = `SELECT current_database() AS banco, current_user AS usuario, r.rolsuper AS superusuario,
    shobj_description(d.oid, 'pg_database') AS marcador, pg_get_userbyid(d.datdba) AS dono
    FROM pg_database d JOIN pg_roles r ON r.rolname = current_user WHERE d.datname = current_database()`;

function conferirBancoConectado(linha, esperado) {
    const motivos = [];
    if (!linha) throw bloqueio(['não foi possível identificar o banco conectado.']);
    if (linha.banco !== esperado.banco) motivos.push(`conectado ao banco ${linha.banco}, mas o esperado era ${esperado.banco}.`);
    if (!String(linha.banco).endsWith(SUFIXO_DO_BANCO)) motivos.push(`o banco conectado não termina em ${SUFIXO_DO_BANCO}.`);
    if (linha.marcador !== MARCADOR_DO_BANCO) motivos.push(`o banco conectado não tem o marcador de testes (COMMENT ON DATABASE ... IS '${MARCADOR_DO_BANCO}').`);
    if (linha.superusuario) motivos.push(`o usuário ${linha.usuario} é superusuário; use um usuário exclusivo de testes, sem privilégios especiais.`);
    if (motivos.length) throw bloqueio(motivos);
}

module.exports = { validarAmbienteDeTeste, conferirBancoConectado, bloqueio, texto, RAIZ, CONSULTA_DO_BANCO, MARCADOR_DO_BANCO, SUFIXO_DO_BANCO };
