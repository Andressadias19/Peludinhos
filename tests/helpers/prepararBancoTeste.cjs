// npm run test:preparar: deixa o banco de testes com a estrutura atual e sem registros, e esvazia as pastas de fotos de teste.
// Estrutura: database/banco_peludinhos.sql seguido das migrações (repetíveis). Assim as colunas e os padrões ficam
// iguais aos de um banco atualizado pelas migrações, e as migrações são exercitadas a cada preparo.
// Usa as mesmas proteções dos testes: o .env.test é validado e o banco conectado é conferido antes do primeiro comando.
// Não copia dados do banco de desenvolvimento; as suítes criam os próprios registros.
const { pastasDeUpload, bancoDeTeste } = require('./bancoLocal.cjs');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const pool = require('../../server/config/database');
const { lerEstrutura } = require('./estruturaBanco.cjs');

const ESTRUTURA = path.join(__dirname, '..', '..', 'database', 'banco_peludinhos.sql');
const MIGRACOES = path.join(__dirname, '..', '..', 'database', 'migrations');
// Estrutura de um banco atualizado pelas migrações (só catálogos, sem registros); veja tests/estrutura-banco.test.cjs.
const ESPERADA = path.join(__dirname, '..', 'fixtures', 'estrutura-esperada.json');

(async () => {
    const cliente = await pool.connect();
    try {
        await cliente.query('BEGIN');
        await cliente.query('DROP SCHEMA IF EXISTS public CASCADE');
        await cliente.query('CREATE SCHEMA public');
        await cliente.query(fs.readFileSync(ESTRUTURA, 'utf8'));
        await cliente.query('COMMIT');
    } catch (erro) {
        await cliente.query('ROLLBACK').catch(() => {});
        throw erro;
    } finally {
        cliente.release();
    }
    // Cada migração abre e fecha a própria transação.
    const migracoes = fs.readdirSync(MIGRACOES).filter(nome => nome.endsWith('.sql')).sort();
    for (const nome of migracoes) await pool.query(fs.readFileSync(path.join(MIGRACOES, nome), 'utf8'));
    const tabelas = await pool.query("SELECT count(*)::int AS total FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'");
    // A estrutura criada precisa ser exatamente a esperada: sem constraints repetidas nem defaults faltando.
    const leitor = await pool.connect();
    try {
        assert.deepEqual(await lerEstrutura(leitor, 'public'), JSON.parse(fs.readFileSync(ESPERADA, 'utf8')),
            'a estrutura preparada difere de tests/fixtures/estrutura-esperada.json');
    } finally {
        leitor.release();
    }

    // As pastas já foram validadas pelo bancoLocal.cjs: nunca são, contêm ou ficam dentro de server/uploads*.
    for (const pasta of Object.values(pastasDeUpload)) {
        fs.rmSync(pasta, { recursive: true, force: true });
        fs.mkdirSync(pasta, { recursive: true });
    }
    console.log(`Banco ${bancoDeTeste} preparado com ${tabelas.rows[0].total} tabelas e ${migracoes.length} migrações, estrutura igual à esperada, sem registros; pastas de fotos de teste vazias.`);
    await pool.end();
})().catch(async erro => {
    console.error(`Falha ao preparar o banco de testes: ${erro.message}`);
    await pool.end().catch(() => {});
    process.exitCode = 1;
});
