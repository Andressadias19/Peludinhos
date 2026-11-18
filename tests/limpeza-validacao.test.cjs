const { pastasDeUpload } = require('./helpers/bancoLocal.cjs');
// Limpeza da validação manual (scripts/limpezaValidacao.cjs), testada SÓ no banco de testes local com o driver
// local nas pastas isoladas. O comando real (scripts/limpar-validacao-supabase.cjs) recusa bancos locais; aqui
// também se confere essa recusa, sem nenhuma conexão.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const pool = require('../server/config/database');
const { armazenamento, AREAS } = require('../server/storage');
const { limparValidacao, validarMarcador, MARCADOR_PADRAO } = require('../scripts/limpezaValidacao.cjs');

const raiz = path.join(__dirname, '..');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nJkAAAAASUVORK5CYII=', 'base64');
// Marcador próprio deste arquivo: nunca coincide com contas de outras suítes.
const marcador = `@limpeza-${randomUUID().slice(0, 8)}.invalid`;
const reais = [];
const d = {};
const existe = (area, nome) => fs.existsSync(path.join(area === AREAS.PUBLICA ? pastasDeUpload.publica : pastasDeUpload.privada, nome));
const contar = async (tabela, coluna, ids) => (await pool.query(`SELECT count(*)::int AS n FROM ${tabela} WHERE ${coluna} = ANY($1::bigint[])`, [ids])).rows[0].n;
async function usuario(email, tipo = 'usuario', foto = null) {
    return (await pool.query(`INSERT INTO usuario (nome, email, senha_hash, tipo_usuario, foto_perfil) VALUES ('Teste limpeza', $1, 'x', $2, $3) RETURNING id_usuario`, [email, tipo, foto])).rows[0].id_usuario;
}
async function foto(area, prefixo) {
    return armazenamento.salvar(area, `${prefixo}-${randomUUID()}.png`, png);
}
async function avistamento(autor, animal, fotoRef) {
    return (await pool.query(`INSERT INTO avistamento (latitude, longitude, especie_observada, id_usuario_autor, id_animal, foto) VALUES (-2.4, -54.7, 'Gato', $1, $2, $3) RETURNING id_avistamento`, [autor, animal, fotoRef])).rows[0].id_avistamento;
}

before(async () => {
    d.fotoPerfil = await foto(AREAS.PUBLICA, 'usuario-1');
    d.fotoAnimal = await foto(AREAS.PUBLICA, 'animal');
    d.fotoAvistamento = await foto(AREAS.PUBLICA, 'avistamento');
    d.fotoPerdido = await foto(AREAS.PRIVADA, 'perda');
    d.fotoReal = await foto(AREAS.PUBLICA, 'animal');
    d.v1 = await usuario(`v1${marcador}`, 'usuario', d.fotoPerfil.referencia);
    d.v2 = await usuario(`admin${marcador}`, 'administrador');
    d.real = await usuario(`${randomUUID()}@example.invalid`);
    reais.push(d.real);
    d.animal = (await pool.query(`INSERT INTO animal (nome, especie, foto, id_usuario_cadastrador) VALUES ('A validação', 'Gato', $1, $2) RETURNING id_animal`, [d.fotoAnimal.referencia, d.v1])).rows[0].id_animal;
    d.animalReal = (await pool.query(`INSERT INTO animal (nome, especie, foto, id_usuario_cadastrador) VALUES ('A real', 'Cachorro', $1, $2) RETURNING id_animal`, [d.fotoReal.referencia, d.real])).rows[0].id_animal;
    d.avistamento = await avistamento(d.v1, d.animal, d.fotoAvistamento.referencia);
    // Avistamento da validação que reaproveita a foto de um animal real (cadastros antigos podiam repetir fotos).
    d.avistamentoCompartilhado = await avistamento(d.v1, null, d.fotoReal.referencia);
    d.perdido = (await pool.query(`INSERT INTO publica_perda (nome_animal, especie, local_desaparecimento, data_desaparecimento, foto, id_usuario_tutor)
        VALUES ('P', 'Cachorro', 'Praça', '2025-01-15', $1, $2) RETURNING id_perda`, [d.fotoPerdido.referencia, d.v1])).rows[0].id_perda;
    d.associacao = (await pool.query(`INSERT INTO solicitacao_associacao_avistamento (id_avistamento, id_animal_proposto, id_usuario_solicitante, justificativa)
        VALUES ($1, $2, $3, 'Justificativa com mais de vinte caracteres.') RETURNING id_solicitacao`, [d.avistamentoCompartilhado, d.animal, d.v1])).rows[0].id_solicitacao;
});

after(async () => {
    // Garante que nada fique para trás mesmo se um teste falhar no meio.
    await limparValidacao({ pool, armazenamento, marcador, confirmar: true }).catch(() => {});
    await pool.query('DELETE FROM avistamento WHERE id_usuario_autor = ANY($1::bigint[])', [reais]);
    await pool.query('DELETE FROM animal WHERE id_usuario_cadastrador = ANY($1::bigint[])', [reais]);
    await pool.query('DELETE FROM usuario WHERE id_usuario = ANY($1::bigint[])', [reais]);
    await armazenamento.excluir(AREAS.PUBLICA, d.fotoReal.nome).catch(() => {});
    await pool.end();
});

test('o marcador precisa ser um domínio reservado .invalid', () => {
    assert.doesNotThrow(() => validarMarcador(MARCADOR_PADRAO));
    assert.equal(MARCADOR_PADRAO, '@validacao-supabase.invalid');
    for (const invalido of ['', 'validacao', '@gmail.com', '@example.com', 'validacao-supabase.invalid', '@x.invalid.com', "@a'.invalid", '@.invalid', null]) {
        assert.throws(() => validarMarcador(invalido), /domínio reservado terminado em \.invalid/, String(invalido));
    }
});

test('simulação: lista só os registros e fotos das contas de validação, sem remover nada', async () => {
    const r = await limparValidacao({ pool, armazenamento, marcador });
    assert.equal(r.executado, false);
    assert.equal(r.bloqueado, false);
    assert.deepEqual(r.usuarios.sort(), [String(d.v1), String(d.v2)].sort());
    assert.deepEqual(r.animais, [String(d.animal)]);
    assert.deepEqual(r.avistamentos.sort(), [String(d.avistamento), String(d.avistamentoCompartilhado)].sort());
    assert.deepEqual(r.perdidos, [String(d.perdido)]);
    assert.deepEqual(r.associacoes, [String(d.associacao)]);
    assert.deepEqual(r.fotos.publica, [d.fotoPerfil.nome, d.fotoAnimal.nome, d.fotoAvistamento.nome, d.fotoReal.nome].sort());
    assert.deepEqual(r.fotos.privada, [d.fotoPerdido.nome]);
    assert.equal(await contar('usuario', 'id_usuario', [d.v1, d.v2]), 2);
    assert.ok([d.fotoPerfil, d.fotoAnimal, d.fotoAvistamento].every(f => existe(AREAS.PUBLICA, f.nome)) && existe(AREAS.PRIVADA, d.fotoPerdido.nome));
});

test('dependência de outra conta bloqueia a limpeza inteira, mesmo com confirmação', async () => {
    const deOutraConta = await avistamento(d.real, d.animal, null);
    let r = await limparValidacao({ pool, armazenamento, marcador, confirmar: true });
    assert.equal(r.executado, false);
    assert.match(r.bloqueios.join(' '), /1 avistamento\(s\) de outras contas em animais da validação/);
    await pool.query('DELETE FROM avistamento WHERE id_avistamento = $1', [deOutraConta]);
    // Animal de outra conta validado por um administrador da validação: apagar a conta mudaria esse registro.
    await pool.query('UPDATE animal SET id_usuario_validador = $1 WHERE id_animal = $2', [d.v2, d.animalReal]);
    r = await limparValidacao({ pool, armazenamento, marcador, confirmar: true });
    assert.equal(r.executado, false);
    assert.match(r.bloqueios.join(' '), /registro\(s\) de outras contas validado\(s\)/);
    await pool.query('UPDATE animal SET id_usuario_validador = NULL WHERE id_animal = $1', [d.animalReal]);
    assert.equal(await contar('usuario', 'id_usuario', [d.v1, d.v2]), 2, 'nada foi removido');
});

test('confirmada: remove só os registros e as fotos da validação; registros reais e fotos compartilhadas ficam', async () => {
    const r = await limparValidacao({ pool, armazenamento, marcador, confirmar: true });
    assert.equal(r.executado, true);
    assert.equal(await contar('usuario', 'id_usuario', [d.v1, d.v2]), 0);
    assert.equal(await contar('animal', 'id_animal', [d.animal]), 0);
    assert.equal(await contar('avistamento', 'id_avistamento', [d.avistamento, d.avistamentoCompartilhado]), 0);
    assert.equal(await contar('publica_perda', 'id_perda', [d.perdido]), 0);
    assert.equal(await contar('solicitacao_associacao_avistamento', 'id_solicitacao', [d.associacao]), 0);
    assert.deepEqual(r.arquivos.apagados.sort(), [`publica/${d.fotoPerfil.nome}`, `publica/${d.fotoAnimal.nome}`, `publica/${d.fotoAvistamento.nome}`, `privada/${d.fotoPerdido.nome}`].sort());
    assert.deepEqual(r.arquivos.falhas, []);
    assert.ok(![d.fotoPerfil, d.fotoAnimal, d.fotoAvistamento].some(f => existe(AREAS.PUBLICA, f.nome)) && !existe(AREAS.PRIVADA, d.fotoPerdido.nome));
    // Registros da outra conta e a foto ainda usada por eles continuam.
    assert.equal(await contar('usuario', 'id_usuario', [d.real]), 1);
    assert.equal((await pool.query('SELECT foto FROM animal WHERE id_animal = $1', [d.animalReal])).rows[0].foto, d.fotoReal.referencia);
    assert.ok(existe(AREAS.PUBLICA, d.fotoReal.nome), 'foto compartilhada com um registro real não é apagada');
    // Repetir não encontra mais nada.
    const de_novo = await limparValidacao({ pool, armazenamento, marcador, confirmar: true });
    assert.deepEqual([de_novo.usuarios, de_novo.executado], [[], false]);
});

test('o comando real recusa bancos locais e o driver local antes de qualquer conexão', () => {
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'peludinhos-limpeza-'));
    try {
        const executar = variaveis => {
            const arquivo = path.join(pasta, `${randomUUID()}.env`);
            fs.writeFileSync(arquivo, Object.entries(variaveis).map(([nome, valor]) => `${nome}=${valor}`).join('\n'));
            return spawnSync(process.execPath, ['scripts/limpar-validacao-supabase.cjs', `--arquivo-env=${arquivo}`, '--confirmar'],
                { cwd: raiz, env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot }, encoding: 'utf8', timeout: 20000 });
        };
        const local = executar({ DB_HOST: 'localhost', DB_PORT: '5432', DB_USER: 'qualquer', DB_PASSWORD: 'qualquer', DB_NAME: 'peludinhos', STORAGE_DRIVER: 'supabase' });
        assert.equal(local.status, 1);
        assert.match(local.stderr, /Limpeza não executada: A configuração aponta para um PostgreSQL local/);
        const driverLocal = executar({ DATABASE_URL: 'postgresql://postgres.ficticio:x@aws-0-sa-east-1.pooler.supabase.com:5432/postgres', DATABASE_SSL: 'true', STORAGE_DRIVER: 'local' });
        assert.equal(driverLocal.status, 1);
        assert.match(driverLocal.stderr, /Defina STORAGE_DRIVER=supabase/);
    } finally {
        fs.rmSync(pasta, { recursive: true, force: true });
    }
});
