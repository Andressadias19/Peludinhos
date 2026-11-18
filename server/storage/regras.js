// Regras de nomes e tipos das fotos, comuns à fachada e aos drivers (sem dependências entre eles).

const AREAS = Object.freeze({ PUBLICA: "publica", PRIVADA: "privada" });
const PREFIXO_PUBLICO = "/uploads/";
// Nomes gerados pelo servidor: prefixo-identificador.extensão (ex.: animal-<uuid>.png, usuario-13-1700000000000.jpg).
// Sem barras, pontos extras, maiúsculas, espaços ou caracteres codificados: nenhum nome aceito sai da pasta
// ou do bucket da área, nem forma outro endereço quando usado numa URL.
const NOME_DE_ARQUIVO = /^[a-z]+(?:-[a-z0-9]+)+\.(?:jpg|png|webp)$/;
const TAMANHO_MAXIMO_DO_NOME = 200;
const TIPOS = Object.freeze({ jpg: "image/jpeg", png: "image/png", webp: "image/webp" });

function nomeValido(nome) {
    return typeof nome === "string" && nome.length <= TAMANHO_MAXIMO_DO_NOME && NOME_DE_ARQUIVO.test(nome);
}

function tipoDoArquivo(nome) {
    return TIPOS[nome.slice(nome.lastIndexOf(".") + 1)];
}

module.exports = { AREAS, PREFIXO_PUBLICO, NOME_DE_ARQUIVO, TAMANHO_MAXIMO_DO_NOME, TIPOS, nomeValido, tipoDoArquivo };
