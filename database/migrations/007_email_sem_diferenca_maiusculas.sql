-- E-mails sem diferença entre maiúsculas e minúsculas: Ana@exemplo.com e ana@exemplo.com são a mesma conta.
-- Executar uma vez, após 006. Pode ser repetida sem efeito. Não exclui usuários.
-- A API já normaliza o e-mail no cadastro e no login; esta migração garante o mesmo no banco.
BEGIN;

-- Contas que só diferem na grafia do e-mail precisam de decisão manual: a migração para e lista os ids.
DO $$
DECLARE
    conflitos TEXT;
BEGIN
    SELECT string_agg(ids, '; ') INTO conflitos FROM (
        SELECT string_agg(id_usuario::text, ', ' ORDER BY id_usuario) AS ids
        FROM Usuario GROUP BY lower(btrim(email)) HAVING count(*) > 1
    ) grupos;
    IF conflitos IS NOT NULL THEN
        RAISE EXCEPTION 'Há contas com o mesmo e-mail em grafias diferentes (ids: %). Resolva antes de executar esta migração.', conflitos;
    END IF;
END $$;

-- Grava os e-mails já existentes no mesmo formato usado pela API (sem espaços e em minúsculas).
UPDATE Usuario SET email = lower(btrim(email)) WHERE email <> lower(btrim(email));

CREATE UNIQUE INDEX IF NOT EXISTS uq_usuario_email_minusculo ON Usuario (lower(email));

COMMIT;
