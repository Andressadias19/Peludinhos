const { bancoDeTeste } = require('./helpers/bancoLocal.cjs');
// Estrutura do banco: o procedimento de banco novo (só database/banco_peludinhos.sql) e o de banco existente
// (migrações) precisam chegar à MESMA estrutura, igual à de tests/fixtures/estrutura-esperada.json
// (tabelas, colunas, tipos, nulidade, defaults, identity, constraints, índices, triggers e funções).
// Roda só no banco de testes; o script base é aplicado num schema descartável, apagado no fim.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const pool = require('../server/config/database');
const { lerEstrutura, semSchema } = require('./helpers/estruturaBanco.cjs');

const raiz = path.join(__dirname, '..');
const esperada = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'estrutura-esperada.json'), 'utf8'));
const scriptBase = fs.readFileSync(path.join(raiz, 'database', 'banco_peludinhos.sql'), 'utf8');
const migracoes = fs.readdirSync(path.join(raiz, 'database', 'migrations')).filter(nome => nome.endsWith('.sql')).sort();
const schemaDescartavel = `estrutura_base_${randomBytes(6).toString('hex')}`;

after(async () => {
    await pool.query(`DROP SCHEMA IF EXISTS ${schemaDescartavel} CASCADE`);
    await pool.end();
});

test('o gabarito descreve a estrutura atual completa e não contém registros', () => {
    assert.deepEqual(esperada.tabelas, ['animal', 'avistamento', 'noticia', 'publica_perda', 'solicitacao_adocao', 'solicitacao_associacao_avistamento', 'usuario']);
    assert.deepEqual(Object.fromEntries(Object.entries(esperada).map(([chave, lista]) => [chave, lista.length])),
        { tabelas: 7, colunas: 82, constraints: 73, indices: 12, triggers: 0, funcoes: 0 });
    assert.ok(esperada.colunas.includes('animal.data_atualizacao timestamp without time zone nulo=YES padrao=CURRENT_TIMESTAMP identity=-'));
    for (const nome of ['chk_animal_idade_aproximada', 'chk_animal_status_castracao', 'chk_animal_status_vacinacao', 'chk_animal_fonte_informacao']) {
        assert.equal(esperada.constraints.filter(item => item.startsWith(`animal ${nome} `)).length, 1, nome);
    }
    assert.equal(esperada.constraints.filter(item => /^animal animal_\w+_check /.test(item)).length, 0, 'sem CHECKs com nome automático repetindo as nomeadas');
    assert.doesNotMatch(scriptBase, /INSERT\s+INTO/i, 'o script de banco novo não insere registros');
});

test('banco novo: só o script base cria exatamente a estrutura esperada', async () => {
    const cliente = await pool.connect();
    try {
        await cliente.query(`CREATE SCHEMA ${schemaDescartavel}`);
        await cliente.query(`SET search_path TO ${schemaDescartavel}`);
        await cliente.query(scriptBase);
        const criada = semSchema(await lerEstrutura(cliente, schemaDescartavel), schemaDescartavel);
        assert.deepEqual(criada, esperada);
    } finally {
        await cliente.query('RESET search_path').catch(() => {});
        cliente.release();
    }
});

test('banco do test:preparar (script base + migrações) tem a estrutura esperada, e repetir as migrações não muda nada', async () => {
    assert.equal((await pool.query('SELECT current_database() AS banco')).rows[0].banco, bancoDeTeste);
    const cliente = await pool.connect();
    try {
        assert.deepEqual(await lerEstrutura(cliente, 'public'), esperada, 'rode npm run test:preparar antes desta suíte');
        for (const nome of migracoes) await cliente.query(fs.readFileSync(path.join(raiz, 'database', 'migrations', nome), 'utf8'));
        assert.deepEqual(await lerEstrutura(cliente, 'public'), esperada);
    } finally {
        cliente.release();
    }
});
