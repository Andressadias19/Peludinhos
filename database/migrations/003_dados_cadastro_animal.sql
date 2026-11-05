-- Dados estruturados para identificação e acompanhamento de animais.
-- Registros antigos recebem valores desconhecidos; não inferimos saúde ou situação a partir de CADASTRADO.

ALTER TABLE Animal
    ADD COLUMN IF NOT EXISTS idade_aproximada VARCHAR(20) NOT NULL DEFAULT 'DESCONHECIDA',
    ADD COLUMN IF NOT EXISTS caracteristicas VARCHAR(500),
    ADD COLUMN IF NOT EXISTS status_castracao VARCHAR(20) NOT NULL DEFAULT 'DESCONHECIDO',
    ADD COLUMN IF NOT EXISTS status_vacinacao VARCHAR(20) NOT NULL DEFAULT 'DESCONHECIDA',
    ADD COLUMN IF NOT EXISTS fonte_informacao VARCHAR(30) NOT NULL DEFAULT 'NAO_INFORMADA',
    ADD COLUMN IF NOT EXISTS data_atualizacao TIMESTAMP;

ALTER TABLE Animal ALTER COLUMN situacao SET DEFAULT 'NAO_INFORMADA';
UPDATE Animal SET situacao = 'NAO_INFORMADA' WHERE situacao = 'CADASTRADO';
ALTER TABLE Animal ALTER COLUMN data_atualizacao SET DEFAULT CURRENT_TIMESTAMP;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_animal_idade_aproximada') THEN
        ALTER TABLE Animal ADD CONSTRAINT chk_animal_idade_aproximada
            CHECK (idade_aproximada IN ('FILHOTE', 'ADULTO', 'IDOSO', 'DESCONHECIDA'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_animal_status_castracao') THEN
        ALTER TABLE Animal ADD CONSTRAINT chk_animal_status_castracao
            CHECK (status_castracao IN ('CASTRADO', 'NAO_CASTRADO', 'DESCONHECIDO'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_animal_status_vacinacao') THEN
        ALTER TABLE Animal ADD CONSTRAINT chk_animal_status_vacinacao
            CHECK (status_vacinacao IN ('ATUALIZADA', 'INCOMPLETA', 'DESCONHECIDA'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_animal_fonte_informacao') THEN
        ALTER TABLE Animal ADD CONSTRAINT chk_animal_fonte_informacao
            CHECK (fonte_informacao IN ('OBSERVACAO_DIRETA', 'INFORMADO_POR_TERCEIRO', 'REGISTRO_VETERINARIO', 'NAO_INFORMADA'));
    END IF;
END $$;
