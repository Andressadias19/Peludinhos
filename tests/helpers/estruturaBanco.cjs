// Lê a estrutura de um schema do PostgreSQL (só catálogos, nenhum registro), num formato comparável
// entre bancos: tabelas, colunas (tipo, nulidade, default, identity), constraints, índices, triggers e funções.
// Usado por tests/estrutura-banco.test.cjs e para gerar tests/fixtures/estrutura-esperada.json.
// A ordem física das colunas não entra: colunas acrescentadas por migração ficam no fim da tabela,
// e o código sempre usa os nomes.

async function lerEstrutura(cliente, schema) {
    const linhas = async (sql) => (await cliente.query(sql, [schema])).rows.map(linha => linha.x).sort();
    return {
        tabelas: await linhas(`SELECT table_name AS x FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE'`),
        colunas: await linhas(`SELECT table_name || '.' || column_name || ' ' || data_type
                || coalesce('(' || character_maximum_length || ')', '') || ' nulo=' || is_nullable
                || ' padrao=' || coalesce(column_default, '-') || ' identity=' || coalesce(identity_generation, '-') AS x
            FROM information_schema.columns WHERE table_schema = $1`),
        constraints: await linhas(`SELECT c.conrelid::regclass::text || ' ' || c.conname || ' ' || pg_get_constraintdef(c.oid) AS x
            FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = $1`),
        indices: await linhas(`SELECT tablename || ' ' || indexname || ' ' || regexp_replace(indexdef, ' ON [a-z0-9_]+\\.', ' ON ') AS x
            FROM pg_indexes WHERE schemaname = $1`),
        triggers: await linhas(`SELECT t.tgrelid::regclass::text || ' ' || t.tgname AS x FROM pg_trigger t
            JOIN pg_class r ON r.oid = t.tgrelid JOIN pg_namespace n ON n.oid = r.relnamespace WHERE n.nspname = $1 AND NOT t.tgisinternal`),
        funcoes: await linhas(`SELECT p.proname AS x FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = $1`)
    };
}

// Nomes qualificados pelo schema (ex.: "outro_schema.animal") viram só o nome da tabela.
function semSchema(estrutura, schema) {
    const prefixo = new RegExp(`(^|[ (])${schema}\\.`, 'g');
    return Object.fromEntries(Object.entries(estrutura).map(([chave, lista]) => [chave, lista.map(item => item.replace(prefixo, '$1')).sort()]));
}

module.exports = { lerEstrutura, semSchema };
