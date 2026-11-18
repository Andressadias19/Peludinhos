// Erros da camada de armazenamento, com códigos independentes do driver (disco local ou Supabase Storage).
// codigo: ARQUIVO_NAO_ENCONTRADO, ARQUIVO_JA_EXISTE, NOME_DE_ARQUIVO_INVALIDO, AREA_INVALIDA, CONTEUDO_INVALIDO,
//         FALHA_NO_ARMAZENAMENTO
// Em FALHA_NO_ARMAZENAMENTO, detalhes opcionais (usados pelo driver remoto):
//   motivo: PERMISSAO, INDISPONIVEL, TEMPO_ESGOTADO, CONFIGURACAO, RESPOSTA_INVALIDA ou DESCONHECIDO
//   resultadoIncerto: true quando uma gravação ou exclusão pode ter acontecido mesmo com o erro
//                     (ex.: a conexão caiu depois de enviar o arquivo)
class ErroDeArmazenamento extends Error {
    constructor(codigo, mensagem, causa, detalhes = {}) {
        super(mensagem, causa ? { cause: causa } : undefined);
        this.name = "ErroDeArmazenamento";
        this.codigo = codigo;
        if (detalhes.motivo) this.motivo = detalhes.motivo;
        if (detalhes.resultadoIncerto) this.resultadoIncerto = true;
    }
}

module.exports = { ErroDeArmazenamento };
