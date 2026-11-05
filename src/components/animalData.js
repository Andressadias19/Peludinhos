export const ageLabels = {
  FILHOTE: 'Filhote', ADULTO: 'Adulto', IDOSO: 'Idoso', DESCONHECIDA: 'Não informada',
};

export const situationLabels = {
  NAO_INFORMADA: 'Não informada', EM_SITUACAO_DE_RUA: 'Em situação de rua', RESGATADO: 'Resgatado',
  EM_TRATAMENTO: 'Em tratamento', ACOLHIDO: 'Acolhido', DISPONIVEL_PARA_ADOCAO: 'Disponível para adoção',
  ADOTADO: 'Adotado', FALECIDO: 'Falecido',
};

export const castrationLabels = {
  CASTRADO: 'Castrado', NAO_CASTRADO: 'Não castrado', DESCONHECIDO: 'Não informado',
};

export const vaccinationLabels = {
  ATUALIZADA: 'Atualizada', INCOMPLETA: 'Incompleta', DESCONHECIDA: 'Não informada',
};

export const informationSourceLabels = {
  OBSERVACAO_DIRETA: 'Observação direta', INFORMADO_POR_TERCEIRO: 'Informada por outra pessoa',
  REGISTRO_VETERINARIO: 'Registro veterinário', NAO_INFORMADA: 'Não informada',
};

export function labelFor(options, value) {
  return options[value] || 'Não informado';
}
