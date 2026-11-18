const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

// CARREGA AS VARIÁVEIS DE AMBIENTE DO BACKEND
// Sem opção: o .env da pasta atual, como sempre (variáveis já definidas no terminal têm prioridade).
// Com --arquivo-env=<arquivo>: SOMENTE esse arquivo (relativo à raiz do projeto ou absoluto). O .env não é
// lido, então nada do ambiente de desenvolvimento (banco, senha, JWT_SECRET) é herdado; e os valores do
// arquivo prevalecem sobre variáveis com o mesmo nome que existam no terminal.
// Usado na validação local com o Supabase real: node server/server.js --arquivo-env=.env.supabase.local
const RAIZ_DO_PROJETO = path.join(__dirname, "..", "..");
const OPCAO = "--arquivo-env=";
let carregado = false;

function arquivoEscolhido(argv = process.argv) {
    const argumento = argv.find(item => typeof item === "string" && item.startsWith(OPCAO));
    return argumento === undefined ? null : argumento.slice(OPCAO.length).trim();
}

function carregarAmbiente(argv = process.argv) {
    if (carregado) return;
    carregado = true;

    const escolhido = arquivoEscolhido(argv);
    if (escolhido === null) {
        dotenv.config();
        return;
    }
    if (!escolhido) {
        throw new Error("Configuração do ambiente inválida: informe o arquivo em --arquivo-env=<arquivo>.");
    }

    const caminho = path.resolve(RAIZ_DO_PROJETO, escolhido);
    if (path.basename(caminho) === ".env") {
        throw new Error("Configuração do ambiente inválida: --arquivo-env serve para usar outro arquivo; para o .env, inicie sem essa opção.");
    }
    if (!fs.existsSync(caminho)) {
        throw new Error(`Configuração do ambiente inválida: arquivo ${escolhido} não encontrado.`);
    }

    dotenv.config({ path: caminho, override: true, quiet: true });
    process.env.PELUDINHOS_ARQUIVO_ENV = path.basename(caminho);
}

module.exports = { carregarAmbiente, arquivoEscolhido, OPCAO };
