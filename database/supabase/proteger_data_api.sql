-----------------------------------------------------------
-- PROTEÇÃO DO BANCO DO PELUDINHOS NO SUPABASE
-----------------------------------------------------------
-- O Supabase publica o schema public pela Data API (PostgREST) e, por padrão, dá aos papéis
-- anon, authenticated e service_role acesso a toda tabela criada nele. O Peludinhos não usa
-- a Data API: o frontend só fala com a API Express, e a API conecta direto ao PostgreSQL
-- (DATABASE_URL, usuário postgres, dono das tabelas).
--
-- Este script:
--   1. tira de anon, authenticated e service_role todo privilégio nas tabelas, sequências e funções do schema public;
--   2. faz o mesmo para objetos criados no futuro pelo usuário postgres;
--   3. liga o RLS em todas as tabelas, sem políticas: quem não é dono não lê nem grava nada;
--   4. confere o resultado e desfaz tudo se algo ficar acessível.
--
-- A API Express não é afetada: o dono das tabelas (postgres) não passa pelo RLS e mantém seus privilégios.
-- A chave service_role continua valendo para o Storage (buckets), que fica em outro schema.
--
-- Quando executar: UMA vez no SQL Editor do projeto Supabase, DEPOIS de database/banco_peludinhos.sql.
-- Pode ser repetido sem efeito. Não insere nem apaga registros.
-- NUNCA no banco de desenvolvimento: o script se recusa a rodar fora de um projeto Supabase.
-- Complemento recomendado no painel: desligar a Data API (veja o README, seção "Hospedagem").
-----------------------------------------------------------

BEGIN;

DO $$
BEGIN
    IF current_database() = 'peludinhos' THEN
        RAISE EXCEPTION 'Este script é só para o banco do Supabase; não execute no banco de desenvolvimento peludinhos.';
    END IF;
    IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role')) <> 3 THEN
        RAISE EXCEPTION 'Papéis anon, authenticated e service_role não encontrados: este banco não é de um projeto Supabase.';
    END IF;
END $$;

-- 1. Objetos existentes
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated, service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated, service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated, service_role;

-- 2. Objetos criados no futuro pelo usuário postgres (por exemplo, por novas migrações)
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated, service_role;

-- 3. RLS em todas as tabelas, sem políticas (sem FORCE: o dono das tabelas, usado pela API, continua sem restrição)
DO $$
DECLARE
    tabela record;
BEGIN
    FOR tabela IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tabela.tablename);
    END LOOP;
END $$;

-- 4. Conferência: qualquer problema desfaz o script inteiro
DO $$
DECLARE
    problema text;
BEGIN
    SELECT string_agg(c.relname || ' (' || r.rolname || ')', ', ' ORDER BY c.relname, r.rolname) INTO problema
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN pg_roles r
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'S')
      AND r.rolname IN ('anon', 'authenticated', 'service_role')
      AND CASE WHEN c.relkind = 'S' THEN has_sequence_privilege(r.oid, c.oid, 'USAGE, SELECT, UPDATE')
               ELSE has_table_privilege(r.oid, c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') END;
    IF problema IS NOT NULL THEN
        RAISE EXCEPTION 'Ainda há acesso pela Data API em: %', problema;
    END IF;

    SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO problema
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity;
    IF problema IS NOT NULL THEN
        RAISE EXCEPTION 'Tabelas sem RLS: %', problema;
    END IF;

    RAISE NOTICE 'Peludinhos protegido: % tabelas com RLS e sem acesso para anon, authenticated e service_role.',
        (SELECT count(*) FROM pg_tables WHERE schemaname = 'public');
END $$;

COMMIT;
