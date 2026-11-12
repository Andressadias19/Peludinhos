-- Impede que a exclusão de um animal apague em cascata seus avistamentos e solicitações de adoção.
-- Executar uma vez, após 005. Pode ser repetida sem efeito. Não altera nem apaga registros.
-- A API já bloqueia a exclusão de animais com dependências; esta migração é a mesma proteção no banco.
BEGIN;

ALTER TABLE Avistamento
    DROP CONSTRAINT IF EXISTS fk_avistamento_animal,
    ADD CONSTRAINT fk_avistamento_animal
        FOREIGN KEY (id_animal) REFERENCES Animal (id_animal) ON DELETE RESTRICT;

ALTER TABLE Solicitacao_adocao
    DROP CONSTRAINT IF EXISTS fk_solicitacao_animal,
    ADD CONSTRAINT fk_solicitacao_animal
        FOREIGN KEY (id_animal) REFERENCES Animal (id_animal) ON DELETE RESTRICT;

COMMIT;
