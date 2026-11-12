const pool = require('../config/database');
const { serialize } = require('./avistamentoController');

const PAGE_SIZE = 20;
const ANIMAL_STATUSES = ['Pendente', 'Validado', 'Recusado'];
// CORRECAO_SOLICITADA existe no banco, mas o sistema não tem fluxo para o solicitante corrigir o pedido:
// ela só é listada; o painel não cria decisões com esse status.
const REQUEST_STATUSES = ['PENDENTE', 'APROVADA', 'RECUSADA', 'CORRECAO_SOLICITADA'];
// Versão do cadastro com microssegundos, como texto: um Date do JavaScript perderia a precisão do PostgreSQL.
const version = `coalesce(to_char(a.data_atualizacao, 'YYYY-MM-DD"T"HH24:MI:SS.US'), '')`;
const animalFields = `a.id_animal, a.nome, a.especie, a.raca, a.cor, a.genero, a.foto, a.idade_aproximada, a.caracteristicas,
    a.situacao, a.status_castracao, a.status_vacinacao, a.fonte_informacao, a.status_validacao, a.data_cadastro,
    a.data_atualizacao, a.data_validacao, a.observacao_validacao, a.id_usuario_validador, ${version} AS versao,
    a.id_usuario_cadastrador, u.nome AS cadastrador_nome, val.nome AS validador_nome`;
const animalFrom = `FROM Animal a JOIN Usuario u ON u.id_usuario = a.id_usuario_cadastrador LEFT JOIN Usuario val ON val.id_usuario = a.id_usuario_validador`;
const requestFrom = `FROM Solicitacao_Associacao_Avistamento s
    JOIN Avistamento v ON v.id_avistamento = s.id_avistamento
    JOIN Animal a ON a.id_animal = s.id_animal_proposto
    JOIN Usuario sol ON sol.id_usuario = s.id_usuario_solicitante
    LEFT JOIN Usuario val ON val.id_usuario = s.id_usuario_validador`;

// Só animais validados recebem novos vínculos; a solicitação fica pendente até a validação ou a recusa do pedido.
function notValidatedReason(status) {
    return status === 'Recusado'
        ? 'O animal proposto teve o cadastro recusado e não pode receber novos vínculos. Recuse esta solicitação ou aguarde o reenvio do cadastro.'
        : 'O animal proposto ainda não foi validado. Valide o cadastro antes de aprovar esta associação.';
}

function validId(id) { return typeof id === 'string' && /^[1-9]\d{0,18}$/.test(id) && BigInt(id) <= 9223372036854775807n; }

// Observação da decisão: opcional na aprovação e obrigatória na recusa.
function note(value, required) {
    if (value !== undefined && value !== null && typeof value !== 'string') throw new Error('Observação inválida.');
    const text = (value || '').trim();
    if (required && !text) throw new Error('Informe a justificativa da recusa.');
    if (text.length > 1000) throw new Error('A observação deve ter até 1000 caracteres.');
    if (text.includes('\0')) throw new Error('A observação contém caracteres inválidos.');
    return text || null;
}

function listParams(query, statuses) {
    const { q = '', status = '', offset = '0' } = query;
    if (typeof q !== 'string' || q.length > 100) throw new Error('Busca inválida (até 100 caracteres).');
    if (typeof status !== 'string' || !['', ...statuses].includes(status)) throw new Error('Situação inválida.');
    if (typeof offset !== 'string' || !/^\d{1,7}$/.test(offset)) throw new Error('Página inválida.');
    return { q: q.trim(), status, offset: Number(offset) };
}

async function countsBy(column, from) {
    const result = await pool.query(`SELECT ${column} AS status, count(*)::int AS n FROM ${from} GROUP BY 1`);
    return Object.fromEntries(result.rows.map(row => [row.status, row.n]));
}

async function listarAnimais(req, res) {
    let params;
    try { params = listParams(req.query, ANIMAL_STATUSES); } catch (error) { return res.status(400).json({ erro: error.message }); }
    const where = `($1 = '' OR position(lower($1) in lower(concat_ws(' ', a.id_animal::text, a.nome, a.especie, a.raca, a.cor,
        a.caracteristicas, u.nome, u.email))) > 0) AND ($2 = '' OR a.status_validacao = $2)`;
    const values = [params.q, params.status];
    try {
        const total = await pool.query(`SELECT count(*)::int AS n ${animalFrom} WHERE ${where}`, values);
        // Pendentes primeiro, do que espera há mais tempo; decididos pela decisão mais recente.
        const result = await pool.query(`SELECT ${animalFields} ${animalFrom} WHERE ${where}
            ORDER BY (a.status_validacao = 'Pendente') DESC,
                CASE WHEN a.status_validacao = 'Pendente' THEN coalesce(a.data_atualizacao, a.data_cadastro) END ASC,
                a.data_validacao DESC NULLS LAST, a.id_animal DESC
            LIMIT ${PAGE_SIZE} OFFSET $3`, [...values, params.offset]);
        return res.json({ animais: result.rows, total: total.rows[0].n, limite: PAGE_SIZE, offset: params.offset, contagens: await countsBy('status_validacao', 'Animal') });
    } catch (error) {
        console.error('Erro ao listar validações de animais:', error);
        return res.status(500).json({ erro: 'Não foi possível carregar as validações de animais.' });
    }
}

async function buscarAnimal(req, res) {
    if (!validId(req.params.id)) return res.status(400).json({ erro: 'Identificador de animal inválido.' });
    try {
        const result = await pool.query(`SELECT ${animalFields}, u.email AS cadastrador_email,
            (SELECT count(*)::int FROM Avistamento v WHERE v.id_animal = a.id_animal) AS total_avistamentos
            ${animalFrom} WHERE a.id_animal = $1`, [req.params.id]);
        if (!result.rowCount) return res.status(404).json({ erro: 'Animal não encontrado.' });
        return res.json({ animal: result.rows[0] });
    } catch (error) {
        console.error('Erro ao consultar validação de animal:', error);
        return res.status(500).json({ erro: 'Não foi possível carregar o animal.' });
    }
}

function decidirAnimal(decisao) {
    return async (req, res) => {
        if (!validId(req.params.id)) return res.status(400).json({ erro: 'Identificador de animal inválido.' });
        const body = req.body || {};
        let observacao;
        try {
            observacao = note(body.observacao, decisao === 'Recusado');
            if (typeof body.versao !== 'string') throw new Error('Informe a versão do cadastro analisada.');
        } catch (error) { return res.status(400).json({ erro: error.message }); }
        let client;
        try {
            client = await pool.connect();
            await client.query('BEGIN');
            // FOR UPDATE: duas decisões ou uma decisão e uma edição do dono não se sobrepõem.
            const current = await client.query(`SELECT a.status_validacao, ${version} AS versao FROM Animal a WHERE a.id_animal = $1 FOR UPDATE`, [req.params.id]);
            if (!current.rowCount) {
                await client.query('ROLLBACK');
                return res.status(404).json({ erro: 'Animal não encontrado.' });
            }
            if (current.rows[0].status_validacao !== 'Pendente') {
                await client.query('ROLLBACK');
                return res.status(409).json({ erro: `Este cadastro já foi decidido (${current.rows[0].status_validacao}). Atualize a página.` });
            }
            if (current.rows[0].versao !== body.versao) {
                await client.query('ROLLBACK');
                return res.status(409).json({ erro: 'O cadastro foi alterado depois que você o abriu. Revise os dados atualizados antes de decidir.' });
            }
            await client.query(`UPDATE Animal SET status_validacao = $1, id_usuario_validador = $2, data_validacao = CURRENT_TIMESTAMP,
                observacao_validacao = $3 WHERE id_animal = $4`, [decisao, req.administrador.id_usuario, observacao, req.params.id]);
            const result = await client.query(`SELECT ${animalFields} ${animalFrom} WHERE a.id_animal = $1`, [req.params.id]);
            await client.query('COMMIT');
            return res.json({ mensagem: decisao === 'Validado' ? 'Cadastro validado.' : 'Cadastro recusado.', animal: result.rows[0] });
        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('Erro ao decidir validação de animal:', error);
            return res.status(500).json({ erro: 'Não foi possível registrar a decisão.' });
        } finally { client?.release(); }
    };
}

async function listarAssociacoes(req, res) {
    let params;
    try { params = listParams(req.query, REQUEST_STATUSES); } catch (error) { return res.status(400).json({ erro: error.message }); }
    const where = `($1 = '' OR position(lower($1) in lower(concat_ws(' ', s.id_solicitacao::text, s.id_avistamento::text, a.id_animal::text,
        a.nome, sol.nome, s.justificativa, v.nome_observado, v.observacao))) > 0) AND ($2 = '' OR s.status_solicitacao = $2)`;
    const values = [params.q, params.status];
    try {
        const total = await pool.query(`SELECT count(*)::int AS n ${requestFrom} WHERE ${where}`, values);
        const result = await pool.query(`SELECT s.id_solicitacao, s.status_solicitacao, s.data_solicitacao, s.justificativa,
                s.data_decisao, s.observacao_decisao, s.id_avistamento, v.foto AS avistamento_foto, v.especie_observada,
                v.nome_observado, v.data_hora, v.id_animal AS avistamento_id_animal, s.id_animal_proposto, a.nome AS animal_nome,
                a.foto AS animal_foto, a.especie AS animal_especie, a.status_validacao AS animal_status_validacao,
                sol.nome AS solicitante_nome, val.nome AS validador_nome
            ${requestFrom} WHERE ${where}
            ORDER BY (s.status_solicitacao = 'PENDENTE') DESC,
                CASE WHEN s.status_solicitacao = 'PENDENTE' THEN s.data_solicitacao END ASC,
                s.data_decisao DESC NULLS LAST, s.id_solicitacao DESC
            LIMIT ${PAGE_SIZE} OFFSET $3`, [...values, params.offset]);
        return res.json({ solicitacoes: result.rows, total: total.rows[0].n, limite: PAGE_SIZE, offset: params.offset,
            contagens: await countsBy('status_solicitacao', 'Solicitacao_Associacao_Avistamento') });
    } catch (error) {
        console.error('Erro ao listar solicitações de associação:', error);
        return res.status(500).json({ erro: 'Não foi possível carregar as solicitações.' });
    }
}

async function buscarAssociacao(req, res) {
    if (!validId(req.params.id)) return res.status(400).json({ erro: 'Identificador de solicitação inválido.' });
    try {
        const request = await pool.query(`SELECT s.id_solicitacao, s.status_solicitacao, s.data_solicitacao, s.justificativa,
                s.data_decisao, s.observacao_decisao, s.id_avistamento, s.id_animal_proposto,
                sol.id_usuario AS id_solicitante, sol.nome AS solicitante_nome, sol.email AS solicitante_email, val.nome AS validador_nome
            ${requestFrom} WHERE s.id_solicitacao = $1`, [req.params.id]);
        if (!request.rowCount) return res.status(404).json({ erro: 'Solicitação não encontrada.' });
        const item = request.rows[0];
        const sighting = await pool.query(`SELECT v.id_avistamento, v.id_animal, v.latitude, v.longitude, v.data_hora, v.foto, v.observacao,
                v.estado_saude, v.nome_observado AS nome, v.especie_observada AS especie, v.raca_observada AS raca,
                v.cor_observada AS cor, v.genero_observado AS genero, autor.nome AS autor_nome
            FROM Avistamento v JOIN Usuario autor ON autor.id_usuario = v.id_usuario_autor WHERE v.id_avistamento = $1`, [item.id_avistamento]);
        const animal = await pool.query(`SELECT ${animalFields},
            (SELECT count(*)::int FROM Avistamento v WHERE v.id_animal = a.id_animal) AS total_avistamentos
            ${animalFrom} WHERE a.id_animal = $1`, [item.id_animal_proposto]);
        const history = await pool.query(`SELECT s.id_solicitacao, s.status_solicitacao, s.data_solicitacao, s.data_decisao,
                s.observacao_decisao, s.id_animal_proposto, a.nome AS animal_nome, sol.nome AS solicitante_nome, val.nome AS validador_nome
            ${requestFrom} WHERE s.id_avistamento = $1 AND s.id_solicitacao <> $2
            ORDER BY s.data_solicitacao DESC, s.id_solicitacao DESC`, [item.id_avistamento, req.params.id]);
        const pending = item.status_solicitacao === 'PENDENTE';
        const reason = !pending ? null
            : sighting.rows[0].id_animal !== null ? `O avistamento já está vinculado ao animal #${sighting.rows[0].id_animal}. Recuse esta solicitação.`
                : animal.rows[0].status_validacao !== 'Validado' ? notValidatedReason(animal.rows[0].status_validacao) : null;
        return res.json({
            solicitacao: item, avistamento: serialize(sighting.rows[0]), animal: animal.rows[0], outras_solicitacoes: history.rows,
            pode_aprovar: pending && !reason, motivo_bloqueio: reason,
        });
    } catch (error) {
        console.error('Erro ao consultar solicitação de associação:', error);
        return res.status(500).json({ erro: 'Não foi possível carregar a solicitação.' });
    }
}

function decidirAssociacao(decisao) {
    return async (req, res) => {
        if (!validId(req.params.id)) return res.status(400).json({ erro: 'Identificador de solicitação inválido.' });
        let observacao;
        try { observacao = note(req.body?.observacao, decisao === 'RECUSADA'); } catch (error) { return res.status(400).json({ erro: error.message }); }
        let client;
        try {
            client = await pool.connect();
            await client.query('BEGIN');
            const current = await client.query(`SELECT id_avistamento, id_animal_proposto, status_solicitacao
                FROM Solicitacao_Associacao_Avistamento WHERE id_solicitacao = $1 FOR UPDATE`, [req.params.id]);
            if (!current.rowCount) {
                await client.query('ROLLBACK');
                return res.status(404).json({ erro: 'Solicitação não encontrada.' });
            }
            const request = current.rows[0];
            if (request.status_solicitacao !== 'PENDENTE') {
                await client.query('ROLLBACK');
                return res.status(409).json({ erro: 'Esta solicitação já foi decidida. Atualize a página.' });
            }
            if (decisao === 'APROVADA') {
                // As chaves estrangeiras garantem que avistamento e animal existem; os locks evitam mudanças no meio da decisão.
                const sighting = await client.query('SELECT id_animal FROM Avistamento WHERE id_avistamento = $1 FOR UPDATE', [request.id_avistamento]);
                // O status é conferido de novo aqui: o animal pode ter sido recusado ou editado (voltando a Pendente) depois do pedido.
                const animal = await client.query('SELECT status_validacao FROM Animal WHERE id_animal = $1 FOR SHARE', [request.id_animal_proposto]);
                if (sighting.rows[0].id_animal !== null) {
                    await client.query('ROLLBACK');
                    return res.status(409).json({ erro: `O avistamento já está vinculado ao animal #${sighting.rows[0].id_animal}. Recuse esta solicitação.` });
                }
                if (animal.rows[0].status_validacao !== 'Validado') {
                    await client.query('ROLLBACK');
                    return res.status(409).json({ erro: notValidatedReason(animal.rows[0].status_validacao) });
                }
                // Só o vínculo muda: as características observadas no relato são preservadas.
                await client.query('UPDATE Avistamento SET id_animal = $1 WHERE id_avistamento = $2', [request.id_animal_proposto, request.id_avistamento]);
            }
            await client.query(`UPDATE Solicitacao_Associacao_Avistamento SET status_solicitacao = $1, id_usuario_validador = $2,
                data_decisao = CURRENT_TIMESTAMP, observacao_decisao = $3 WHERE id_solicitacao = $4`,
                [decisao, req.administrador.id_usuario, observacao, req.params.id]);
            await client.query('COMMIT');
            return res.json({ mensagem: decisao === 'APROVADA' ? `Associação aprovada. O avistamento #${request.id_avistamento} agora está vinculado ao animal #${request.id_animal_proposto}.` : 'Solicitação recusada. O avistamento continua sem vínculo.' });
        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('Erro ao decidir solicitação de associação:', error);
            return res.status(500).json({ erro: 'Não foi possível registrar a decisão.' });
        } finally { client?.release(); }
    };
}

module.exports = {
    listarAnimais, buscarAnimal, aprovarAnimal: decidirAnimal('Validado'), recusarAnimal: decidirAnimal('Recusado'),
    listarAssociacoes, buscarAssociacao, aprovarAssociacao: decidirAssociacao('APROVADA'), recusarAssociacao: decidirAssociacao('RECUSADA'),
};
