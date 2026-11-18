// Remoção dos registros e fotos criados numa validação manual, identificados pelas contas de teste
// (e-mails terminados no marcador, por padrão @validacao-supabase.invalid). Não depende de qual banco ou
// armazenamento é usado: recebe o pool e a camada de armazenamento prontos.
// Testado em tests/limpeza-validacao.test.cjs (banco de testes local); usado por scripts/limpar-validacao-supabase.cjs.
//
// Regras:
// - só entram as contas do marcador e o que pertence a elas (cadastros, avistamentos, publicações,
//   solicitações e notícias); nenhum outro registro é apagado ou alterado;
// - se algum registro de outra conta depender desses (ex.: avistamento de outra pessoa num animal da
//   validação, ou um animal de outra conta validado por uma conta da validação), nada é feito;
// - tudo numa transação; as fotos só são apagadas depois do COMMIT e só se nenhum registro restante
//   ainda as usa; sem confirmar, nada é gravado (simulação).
const { AREAS } = require('../server/storage');

const MARCADOR_PADRAO = '@validacao-supabase.invalid';

function validarMarcador(marcador) {
    if (typeof marcador !== 'string' || !/^@[a-z0-9-]+(\.[a-z0-9-]+)*\.invalid$/.test(marcador)) {
        throw new Error('O marcador deve ser um domínio reservado terminado em .invalid (ex.: @validacao-supabase.invalid), que nenhuma conta real pode usar.');
    }
}

const ids = linhas => linhas.map(linha => String(linha.id));

async function planejar(cliente, marcador) {
    const consulta = async (sql, parametros) => (await cliente.query(sql, parametros)).rows;
    // FOR UPDATE: as contas da validação não mudam enquanto a limpeza acontece.
    const usuarios = ids(await consulta(`SELECT id_usuario AS id FROM usuario WHERE lower(email) LIKE '%' || $1 ORDER BY 1 FOR UPDATE`, [marcador]));
    const vazio = { usuarios, animais: [], avistamentos: [], perdidos: [], associacoes: [], adocoes: [], noticias: [], bloqueios: [], fotos: { publica: [], privada: [] } };
    if (!usuarios.length) return vazio;
    const u = [usuarios];
    const plano = { ...vazio };
    plano.animais = ids(await consulta('SELECT id_animal AS id FROM animal WHERE id_usuario_cadastrador = ANY($1::bigint[]) ORDER BY 1', u));
    plano.avistamentos = ids(await consulta('SELECT id_avistamento AS id FROM avistamento WHERE id_usuario_autor = ANY($1::bigint[]) ORDER BY 1', u));
    plano.perdidos = ids(await consulta('SELECT id_perda AS id FROM publica_perda WHERE id_usuario_tutor = ANY($1::bigint[]) ORDER BY 1', u));
    plano.associacoes = ids(await consulta(`SELECT id_solicitacao AS id FROM solicitacao_associacao_avistamento
        WHERE id_usuario_solicitante = ANY($1::bigint[]) OR id_avistamento = ANY($2::bigint[]) OR id_animal_proposto = ANY($3::bigint[]) ORDER BY 1`, [usuarios, plano.avistamentos, plano.animais]));
    plano.adocoes = ids(await consulta(`SELECT id_solicitacao AS id FROM solicitacao_adocao
        WHERE id_usuario_solicitante = ANY($1::bigint[]) OR id_animal = ANY($2::bigint[]) ORDER BY 1`, [usuarios, plano.animais]));
    plano.noticias = ids(await consulta('SELECT id_noticia AS id FROM noticia WHERE id_usuario_autor = ANY($1::bigint[]) ORDER BY 1', u));

    // Registros de outras contas que dependem dos da validação: a limpeza não continua.
    // Cada consulta recebe exatamente os parâmetros que usa (o PostgreSQL exige o número certo).
    const bloqueios = [
        ['avistamento(s) de outras contas em animais da validação',
            `SELECT count(*)::int AS n FROM avistamento WHERE id_animal = ANY($2::bigint[]) AND NOT id_usuario_autor = ANY($1::bigint[])`,
            [usuarios, plano.animais]],
        ['solicitação(ões) de associação de outras contas ligadas à validação',
            `SELECT count(*)::int AS n FROM solicitacao_associacao_avistamento
            WHERE NOT id_usuario_solicitante = ANY($1::bigint[]) AND (id_avistamento = ANY($3::bigint[]) OR id_animal_proposto = ANY($2::bigint[]))`,
            [usuarios, plano.animais, plano.avistamentos]],
        ['solicitação(ões) de adoção de outras contas em animais da validação',
            `SELECT count(*)::int AS n FROM solicitacao_adocao WHERE id_animal = ANY($2::bigint[]) AND NOT id_usuario_solicitante = ANY($1::bigint[])`,
            [usuarios, plano.animais]],
        ['registro(s) de outras contas validado(s) por contas da validação',
            `SELECT
            (SELECT count(*) FROM animal WHERE id_usuario_validador = ANY($1::bigint[]) AND NOT id_usuario_cadastrador = ANY($1::bigint[]))
          + (SELECT count(*) FROM solicitacao_associacao_avistamento WHERE id_usuario_validador = ANY($1::bigint[]) AND NOT id_usuario_solicitante = ANY($1::bigint[]))
          + (SELECT count(*) FROM solicitacao_adocao WHERE id_usuario_validador = ANY($1::bigint[]) AND NOT id_usuario_solicitante = ANY($1::bigint[])) AS n`,
            [usuarios]]
    ];
    for (const [descricao, sql, parametros] of bloqueios) {
        const [{ n }] = await consulta(sql, parametros);
        if (Number(n) > 0) plano.bloqueios.push(`${n} ${descricao}`);
    }
    return plano;
}

// Fotos dos registros que serão apagados (nomes de arquivo, já validados pela camada de armazenamento).
// Fotos dos registros que serão apagados. O formato do valor no banco diz a área: "/uploads/<nome>" é público
// (animais, avistamentos, desaparecimentos e fotos de perfil antigas) e "<nome>" é privado (fotos de perfil atuais
// e fotos antigas de desaparecimentos). Os nomes já vêm validados pela camada de armazenamento.
async function fotosDoPlano(cliente, plano, armazenamento) {
    const valores = (await cliente.query(`SELECT foto_perfil AS v FROM usuario WHERE id_usuario = ANY($1::bigint[])
        UNION SELECT foto FROM animal WHERE id_animal = ANY($2::bigint[])
        UNION SELECT foto FROM avistamento WHERE id_avistamento = ANY($3::bigint[])
        UNION SELECT foto FROM publica_perda WHERE id_perda = ANY($4::bigint[])`, [plano.usuarios, plano.animais, plano.avistamentos, plano.perdidos])).rows.map(linha => linha.v);
    const nomes = area => [...new Set(valores.map(valor => armazenamento.nomeDaReferencia(area, valor)).filter(Boolean))].sort();
    return { publica: nomes(AREAS.PUBLICA), privada: nomes(AREAS.PRIVADA) };
}

// Depois de apagar os registros: só saem as fotos que nenhum registro restante usa (fotos compartilhadas ficam).
async function fotosSemUso(cliente, fotos) {
    const emUso = async valor => Number((await cliente.query(`SELECT (SELECT count(*) FROM usuario WHERE foto_perfil = $1)
        + (SELECT count(*) FROM animal WHERE foto = $1) + (SELECT count(*) FROM avistamento WHERE foto = $1)
        + (SELECT count(*) FROM publica_perda WHERE foto = $1) AS n`, [valor])).rows[0].n) > 0;
    const publicas = [];
    for (const nome of fotos.publica) if (!(await emUso(`/uploads/${nome}`))) publicas.push(nome);
    const privadas = [];
    for (const nome of fotos.privada) if (!(await emUso(nome))) privadas.push(nome);
    return { publica: publicas, privada: privadas };
}

async function limparValidacao({ pool, armazenamento, marcador = MARCADOR_PADRAO, confirmar = false }) {
    validarMarcador(marcador);
    const cliente = await pool.connect();
    let plano;
    let fotos = { publica: [], privada: [] };
    try {
        await cliente.query('BEGIN');
        plano = await planejar(cliente, marcador);
        plano.fotos = await fotosDoPlano(cliente, plano, armazenamento);
        if (!confirmar || plano.bloqueios.length || !plano.usuarios.length) {
            await cliente.query('ROLLBACK');
            return { ...plano, executado: false, bloqueado: plano.bloqueios.length > 0 };
        }
        // Ordem das chaves estrangeiras: dependentes primeiro.
        await cliente.query('DELETE FROM solicitacao_associacao_avistamento WHERE id_solicitacao = ANY($1::bigint[])', [plano.associacoes]);
        await cliente.query('DELETE FROM solicitacao_adocao WHERE id_solicitacao = ANY($1::bigint[])', [plano.adocoes]);
        await cliente.query('DELETE FROM noticia WHERE id_noticia = ANY($1::bigint[])', [plano.noticias]);
        await cliente.query('DELETE FROM avistamento WHERE id_avistamento = ANY($1::bigint[])', [plano.avistamentos]);
        await cliente.query('DELETE FROM animal WHERE id_animal = ANY($1::bigint[])', [plano.animais]);
        await cliente.query('DELETE FROM publica_perda WHERE id_perda = ANY($1::bigint[])', [plano.perdidos]);
        await cliente.query('DELETE FROM usuario WHERE id_usuario = ANY($1::bigint[])', [plano.usuarios]);
        fotos = await fotosSemUso(cliente, plano.fotos);
        await cliente.query('COMMIT');
    } catch (erro) {
        await cliente.query('ROLLBACK').catch(() => {});
        throw erro;
    } finally {
        cliente.release();
    }
    // Depois do COMMIT: uma foto que não puder ser apagada fica órfã e é informada, sem desfazer a limpeza do banco.
    const arquivos = { apagados: [], jaNaoExistiam: [], falhas: [] };
    for (const [area, nomes] of [[AREAS.PUBLICA, fotos.publica], [AREAS.PRIVADA, fotos.privada]]) {
        for (const nome of nomes) {
            try {
                (await armazenamento.excluir(area, nome) ? arquivos.apagados : arquivos.jaNaoExistiam).push(`${area}/${nome}`);
            } catch (erro) {
                arquivos.falhas.push(`${area}/${nome}: ${erro.message}`);
            }
        }
    }
    return { ...plano, fotosApagaveis: fotos, arquivos, executado: true, bloqueado: false };
}

module.exports = { limparValidacao, validarMarcador, MARCADOR_PADRAO };
