const path = require("path");

// PASTAS DAS FOTOS NO DISCO
// pública: servida em /uploads (animais, avistamentos, desaparecimentos)
// privada: fotos de perfil, entregues só por GET /api/usuarios/:id/foto (e fotos antigas de desaparecimentos,
// de quando eram privadas, por GET /api/perdidos/:id/foto)
// UPLOADS_DIR e UPLOADS_PRIVATE_DIR permitem outras pastas (os testes usam pastas próprias);
// caminhos relativos partem da raiz do projeto
const RAIZ_DO_PROJETO = path.join(__dirname, "..", "..");
const PASTA_PUBLICA_PADRAO = path.join(RAIZ_DO_PROJETO, "server", "uploads");
const PASTA_PRIVADA_PADRAO = path.join(RAIZ_DO_PROJETO, "server", "uploads-perdidos");


function texto(valor) {
    return typeof valor === "string" ? valor.trim() : "";
}

// no Windows, C:\Pasta e c:\pasta são o mesmo lugar
function normalizar(pasta) {
    const resolvida = path.resolve(pasta);
    return process.platform === "win32" ? resolvida.toLowerCase() : resolvida;
}

// true se as duas pastas são a mesma ou se uma está dentro da outra
function pastasSeSobrepoem(a, b) {
    const relativo = path.relative(normalizar(a), normalizar(b));
    const dentro = relativo === "" || (!relativo.startsWith("..") && !path.isAbsolute(relativo));
    const relativoInverso = path.relative(normalizar(b), normalizar(a));
    const fora = !relativoInverso.startsWith("..") && !path.isAbsolute(relativoInverso);
    return dentro || fora;
}


// LÊ E VALIDA AS PASTAS
function lerPastasDeUpload(env = process.env) {
    const publica = path.resolve(RAIZ_DO_PROJETO, texto(env.UPLOADS_DIR) || PASTA_PUBLICA_PADRAO);
    const privada = path.resolve(RAIZ_DO_PROJETO, texto(env.UPLOADS_PRIVATE_DIR) || PASTA_PRIVADA_PADRAO);

    // a pasta pública é servida inteira em /uploads: a privada não pode coincidir com ela nem ficar dentro dela
    if (pastasSeSobrepoem(publica, privada)) {
        throw new Error("Configuração das pastas de fotos inválida: UPLOADS_DIR e UPLOADS_PRIVATE_DIR "
            + "precisam ser pastas diferentes, sem uma dentro da outra.");
    }

    return { publica, privada };
}

// Lidas de process.env no momento do acesso, não no primeiro require: quem carrega este módulo
// antes do dotenv (ou antes do ambiente de testes) não fica preso às pastas padrão.
// app.js e os controllers guardam o valor ao serem carregados, depois do dotenv.
module.exports = {
    get pastaPublica() { return lerPastasDeUpload(process.env).publica; },
    get pastaPrivada() { return lerPastasDeUpload(process.env).privada; },
    lerPastasDeUpload,
    pastasSeSobrepoem,
    PASTA_PUBLICA_PADRAO,
    PASTA_PRIVADA_PADRAO
};
