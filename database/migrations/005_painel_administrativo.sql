-- Papel de administrador e registro da validação de cadastros de animais.
-- Executar uma vez, após 004. Pode ser repetida sem efeito. Não apaga registros nem promove usuários.
BEGIN;

-- Valores fora do padrão não são convertidos por suposição: a migração para e informa o que corrigir.
DO $$
DECLARE
    invalidos TEXT;
BEGIN
    SELECT string_agg(DISTINCT tipo_usuario, ', ') INTO invalidos
    FROM Usuario WHERE tipo_usuario NOT IN ('usuario', 'administrador');
    IF invalidos IS NOT NULL THEN
        RAISE EXCEPTION 'Usuario.tipo_usuario tem valores fora do padrão (usuario, administrador): %', invalidos;
    END IF;
END $$;

ALTER TABLE Usuario ALTER COLUMN tipo_usuario SET DEFAULT 'usuario';

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_usuario_tipo_usuario' AND conrelid = 'usuario'::regclass) THEN
        ALTER TABLE Usuario ADD CONSTRAINT chk_usuario_tipo_usuario
            CHECK (tipo_usuario IN ('usuario', 'administrador'));
    END IF;
END $$;

ALTER TABLE Animal
    ADD COLUMN IF NOT EXISTS data_validacao TIMESTAMP,
    ADD COLUMN IF NOT EXISTS observacao_validacao TEXT;

-- Cadastros sem status sempre foram tratados como Pendente pelas telas; só a grafia é padronizada.
UPDATE Animal SET status_validacao = 'Pendente'
    WHERE status_validacao IS NULL OR (lower(btrim(status_validacao)) = 'pendente' AND status_validacao <> 'Pendente');
UPDATE Animal SET status_validacao = 'Validado'
    WHERE lower(btrim(status_validacao)) = 'validado' AND status_validacao <> 'Validado';
UPDATE Animal SET status_validacao = 'Recusado'
    WHERE lower(btrim(status_validacao)) = 'recusado' AND status_validacao <> 'Recusado';

DO $$
DECLARE
    invalidos TEXT;
BEGIN
    SELECT string_agg(DISTINCT status_validacao, ', ') INTO invalidos
    FROM Animal WHERE status_validacao NOT IN ('Pendente', 'Validado', 'Recusado');
    IF invalidos IS NOT NULL THEN
        RAISE EXCEPTION 'Animal.status_validacao tem valores fora do padrão (Pendente, Validado, Recusado): %', invalidos;
    END IF;
END $$;

ALTER TABLE Animal ALTER COLUMN status_validacao SET DEFAULT 'Pendente';
ALTER TABLE Animal ALTER COLUMN status_validacao SET NOT NULL;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_animal_status_validacao' AND conrelid = 'animal'::regclass) THEN
        ALTER TABLE Animal ADD CONSTRAINT chk_animal_status_validacao
            CHECK (status_validacao IN ('Pendente', 'Validado', 'Recusado'));
    END IF;
END $$;

COMMIT;

-----------------------------------------------------------
-- PRIMEIRO ADMINISTRADOR (executar separadamente, à mão)
-----------------------------------------------------------
-- 1. Confira a conta que será promovida (troque o e-mail entre aspas):
--      SELECT id_usuario, nome, email, tipo_usuario, ativo FROM Usuario WHERE email = 'seu-email@exemplo.com';
-- 2. Promova somente se a consulta acima retornou exatamente a conta esperada:
--      UPDATE Usuario SET tipo_usuario = 'administrador'
--      WHERE email = 'seu-email@exemplo.com' AND ativo = TRUE
--      RETURNING id_usuario, nome, email, tipo_usuario;
-- Para rebaixar: troque 'administrador' por 'usuario'. O acesso administrativo cai na
-- requisição seguinte, mesmo com um token emitido antes da mudança.
