const { pipeline } = require("node:stream");
const { armazenamento, TIPOS } = require("../storage");

// ENTREGA UMA FOTO PELA API (rotas autenticadas), SEM URL PÚBLICA
// Os bytes passam pelo backend; nada desta resposta fica em cache. O arquivo é aberto antes de responder,
// para "não encontrado" e falhas ainda virarem JSON em vez de um 200 incompleto.
async function enviarFotoProtegida(res, area, nome, contexto = "Erro ao enviar foto:") {
    res.set({ "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" });

    let arquivo;
    try {
        arquivo = await armazenamento.abrirLeitura(area, nome);
    } catch (erro) {
        if (erro.codigo === "ARQUIVO_NAO_ENCONTRADO" || erro.codigo === "NOME_DE_ARQUIVO_INVALIDO") {
            return res.status(404).json({ erro: "Foto não encontrada." });
        }
        console.error(contexto, erro);
        return res.status(500).json({ erro: "Não foi possível carregar a foto." });
    }

    res.set({ "Content-Type": TIPOS[nome.slice(nome.lastIndexOf(".") + 1)], "Content-Length": String(arquivo.tamanho) });
    // pipeline fecha o arquivo também quando o cliente desiste no meio da transferência
    pipeline(arquivo.stream, res, erro => {
        if (erro && erro.code !== "ERR_STREAM_PREMATURE_CLOSE") console.error(contexto, erro);
    });
}

module.exports = { enviarFotoProtegida };
