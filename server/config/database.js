const { Pool } = require("pg");
require("./carregarAmbiente").carregarAmbiente();
const { montarConfiguracao, tratarErroDeConexaoOciosa } = require("./databaseConfig");

// DATABASE_URL (ex.: Supabase) ou DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME (PostgreSQL local);
// variáveis faltando ou inválidas impedem o servidor de subir, com a lista do que corrigir
const configuracao = montarConfiguracao(process.env);

const pool = new Pool(configuracao);

pool.on("error", tratarErroDeConexaoOciosa(configuracao));

module.exports = pool;
