-- Guarda propostas de vínculo sem alterar o avistamento original.
-- A associação real só deve ocorrer após análise da prefeitura.

CREATE TABLE IF NOT EXISTS Solicitacao_Associacao_Avistamento (
    id_solicitacao BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_avistamento BIGINT NOT NULL REFERENCES Avistamento (id_avistamento),
    id_animal_proposto BIGINT NOT NULL REFERENCES Animal (id_animal),
    id_usuario_solicitante BIGINT NOT NULL REFERENCES Usuario (id_usuario),
    justificativa TEXT NOT NULL CHECK (char_length(btrim(justificativa)) BETWEEN 20 AND 1000),
    status_solicitacao VARCHAR(30) NOT NULL DEFAULT 'PENDENTE'
        CHECK (status_solicitacao IN ('PENDENTE', 'APROVADA', 'RECUSADA', 'CORRECAO_SOLICITADA')),
    data_solicitacao TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    id_usuario_validador BIGINT REFERENCES Usuario (id_usuario),
    data_decisao TIMESTAMP,
    observacao_decisao TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_solicitacao_associacao_pendente_avistamento
    ON Solicitacao_Associacao_Avistamento (id_avistamento)
    WHERE status_solicitacao = 'PENDENTE';

CREATE INDEX IF NOT EXISTS idx_solicitacao_associacao_status_data
    ON Solicitacao_Associacao_Avistamento (status_solicitacao, data_solicitacao DESC);
