const fs = require("fs");
const path = require("path");

// MONTA A CONFIGURAÇÃO DO POOL DO POSTGRESQL A PARTIR DAS VARIÁVEIS DE AMBIENTE
// sem abrir conexões: assim pode ser testada e conferida antes de o servidor subir

const RAIZ_DO_PROJETO = path.join(__dirname, "..", "..");

// a biblioteca pg dá prioridade aos parâmetros da DATABASE_URL sobre a opção ssl
// (ex.: sslmode=no-verify desliga a verificação do certificado e descarta o CA);
// por isso o SSL é configurado só pelas variáveis DATABASE_SSL*
const PARAMETROS_SSL_NA_URL = ["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert", "sslnegotiation", "uselibpqcompat"];

const POOL_MAX_PADRAO = 10;
const POOL_MAX_LIMITE = 100;
// sem limite (padrão da pg), uma requisição esperaria indefinidamente por um banco inacessível
const TEMPO_LIMITE_CONEXAO_PADRAO = 10000;
const TEMPO_LIMITE_CONEXAO_MINIMO = 1000;
const TEMPO_LIMITE_CONEXAO_MAXIMO = 120000;
const HOSTS_LOCAIS = ["localhost", "127.0.0.1", "::1"];


function texto(valor) {
    return typeof valor === "string" ? valor.trim() : "";
}


function lerBooleano(nome, valor, erros) {
    const normalizado = texto(valor).toLowerCase();

    if (normalizado === "" || normalizado === "false") {
        return false;
    }

    if (normalizado === "true") {
        return true;
    }

    erros.push(`${nome} deve ser true ou false.`);
    return false;
}


function lerInteiro(nome, valor, minimo, maximo, erros) {
    const normalizado = texto(valor);

    if (!/^\d+$/.test(normalizado) || Number(normalizado) < minimo || Number(normalizado) > maximo) {
        erros.push(`${nome} deve ser um número inteiro entre ${minimo} e ${maximo}.`);
        return undefined;
    }

    return Number(normalizado);
}


// CERTIFICADO DA AUTORIDADE CERTIFICADORA (CA), EM TEXTO OU ARQUIVO
// em painéis de hospedagem a variável costuma ficar numa linha só, com "\n" literais
function lerCertificado(env, erros) {
    const conteudo = texto(env.DATABASE_SSL_CA);
    const arquivo = texto(env.DATABASE_SSL_CA_FILE);

    if (conteudo && arquivo) {
        erros.push("Use apenas uma das variáveis DATABASE_SSL_CA ou DATABASE_SSL_CA_FILE.");
        return undefined;
    }

    let certificado = conteudo.replace(/\\n/g, "\n");

    if (arquivo) {
        const caminho = path.resolve(RAIZ_DO_PROJETO, arquivo);

        try {
            certificado = fs.readFileSync(caminho, "utf8");
        } catch (erro) {
            erros.push(`Não foi possível ler o certificado em DATABASE_SSL_CA_FILE (${caminho}).`);
            return undefined;
        }
    }

    if (certificado && !certificado.includes("-----BEGIN CERTIFICATE-----")) {
        erros.push("O certificado CA deve estar no formato PEM (-----BEGIN CERTIFICATE-----).");
        return undefined;
    }

    return certificado || undefined;
}


function configurarPorUrl(url, erros) {
    let endereco;

    try {
        endereco = new URL(url);
    } catch (erro) {
        erros.push("DATABASE_URL não é uma URL válida (formato: postgresql://usuario:senha@host:porta/banco).");
        return {};
    }

    if (!["postgres:", "postgresql:"].includes(endereco.protocol)) {
        erros.push("DATABASE_URL deve começar com postgresql:// ou postgres://.");
    }

    if (!endereco.hostname) {
        erros.push("DATABASE_URL precisa informar o host.");
    }

    if (!endereco.pathname || endereco.pathname === "/") {
        erros.push("DATABASE_URL precisa informar o nome do banco.");
    }

    const parametrosSsl = PARAMETROS_SSL_NA_URL.filter(function (parametro) {
        return endereco.searchParams.has(parametro);
    });

    if (parametrosSsl.length > 0) {
        erros.push(`Remova ${parametrosSsl.join(", ")} da DATABASE_URL e configure o SSL com DATABASE_SSL e DATABASE_SSL_CA.`);
    }

    return { connectionString: url };
}


function configurarPorVariaveis(env, erros) {
    const faltando = ["DB_HOST", "DB_USER", "DB_NAME"].filter(function (nome) {
        return !texto(env[nome]);
    });

    if (faltando.length > 0) {
        erros.push(`Defina DATABASE_URL ou as variáveis ${faltando.join(", ")}.`);
    }

    const configuracao = {
        host: texto(env.DB_HOST),
        user: texto(env.DB_USER),
        password: env.DB_PASSWORD,
        database: texto(env.DB_NAME)
    };

    if (texto(env.DB_PORT)) {
        configuracao.port = lerInteiro("DB_PORT", env.DB_PORT, 1, 65535, erros);
    }

    return configuracao;
}


// DATABASE_URL tem prioridade; sem ela, valem as variáveis DB_* usadas desde o início do projeto
function montarConfiguracao(env = process.env) {
    const erros = [];
    const url = texto(env.DATABASE_URL);

    const configuracao = url
        ? configurarPorUrl(url, erros)
        : configurarPorVariaveis(env, erros);

    const usarSsl = lerBooleano("DATABASE_SSL", env.DATABASE_SSL, erros);
    const certificado = lerCertificado(env, erros);

    if (certificado && !usarSsl) {
        erros.push("DATABASE_SSL_CA e DATABASE_SSL_CA_FILE exigem DATABASE_SSL=true.");
    }

    // a verificação do certificado nunca é desligada: rejectUnauthorized fica sempre true
    // ssl: false explícito também impede que PGSSLMODE do sistema mude o comportamento
    configuracao.ssl = usarSsl
        ? Object.assign({ rejectUnauthorized: true }, certificado ? { ca: certificado } : {})
        : false;

    configuracao.max = texto(env.DB_POOL_MAX)
        ? lerInteiro("DB_POOL_MAX", env.DB_POOL_MAX, 1, POOL_MAX_LIMITE, erros)
        : POOL_MAX_PADRAO;

    // tempo máximo para abrir uma conexão nova (connectionTimeoutMillis da pg), em milissegundos
    configuracao.connectionTimeoutMillis = texto(env.DB_CONNECTION_TIMEOUT_MS)
        ? lerInteiro("DB_CONNECTION_TIMEOUT_MS", env.DB_CONNECTION_TIMEOUT_MS, TEMPO_LIMITE_CONEXAO_MINIMO, TEMPO_LIMITE_CONEXAO_MAXIMO, erros)
        : TEMPO_LIMITE_CONEXAO_PADRAO;

    if (erros.length > 0) {
        // só nomes de variáveis e regras: nenhum valor (senha, URL) entra na mensagem
        throw new Error("Configuração do banco de dados inválida:\n- " + erros.join("\n- "));
    }

    return configuracao;
}


function hostDaConfiguracao(configuracao) {
    if (configuracao.connectionString) {
        try {
            return new URL(configuracao.connectionString).hostname.replace(/^\[|\]$/g, "");
        } catch (erro) {
            return "";
        }
    }

    return configuracao.host || "";
}


// localhost, endereço de loopback ou socket Unix (caminho absoluto)
function ehBancoLocal(configuracao) {
    const host = hostDaConfiguracao(configuracao).toLowerCase();

    return HOSTS_LOCAIS.includes(host) || host.startsWith("/");
}


// TEXTO DE ERRO SEGURO PARA O LOG
// substitui a URL de conexão e a senha (inclusive a da URL) caso apareçam na mensagem
function descreverErro(erro, configuracao = {}) {
    const segredos = [configuracao.connectionString, configuracao.password];

    if (configuracao.connectionString) {
        try {
            const senhaDaUrl = new URL(configuracao.connectionString).password;
            segredos.push(senhaDaUrl, decodeURIComponent(senhaDaUrl));
        } catch (erro) {
            // URL inválida já foi recusada em montarConfiguracao
        }
    }

    let mensagem = String((erro && erro.message) || "erro desconhecido");

    segredos
        .filter(function (segredo) {
            return typeof segredo === "string" && segredo.length > 0;
        })
        .forEach(function (segredo) {
            mensagem = mensagem.split(segredo).join("***");
        });

    return `${(erro && erro.code) || "sem código"}: ${mensagem}`;
}


// sem um ouvinte do evento "error", uma conexão ociosa derrubada pelo servidor
// (queda do banco, reinício do pooler) encerraria o processo Node inteiro
function tratarErroDeConexaoOciosa(configuracao) {
    return function (erro) {
        console.error("Conexão ociosa com o PostgreSQL encerrada:", descreverErro(erro, configuracao));
    };
}


module.exports = {
    montarConfiguracao,
    ehBancoLocal,
    descreverErro,
    tratarErroDeConexaoOciosa,
    POOL_MAX_PADRAO,
    TEMPO_LIMITE_CONEXAO_PADRAO
};
