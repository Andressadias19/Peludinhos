const pool = require('../config/database');
const { unvalidatedMessage } = require('./avistamentoController');

function validId(id) {
    return typeof id === 'string' && /^[1-9]\d{0,18}$/.test(id) && BigInt(id) <= 9223372036854775807n;
}

async function solicitar(req, res) {
    if (!validId(req.params.id)) return res.status(400).json({ erro: 'Identificador de avistamento inválido.' });
    const animalId = req.body?.id_animal;
    const justificativa = req.body?.justificativa;
    if (!validId(animalId)) return res.status(400).json({ erro: 'Selecione um cadastro de animal válido.' });
    if (typeof justificativa !== 'string' || justificativa.trim().length < 20 || justificativa.trim().length > 1000 || justificativa.includes('\0')) {
        return res.status(400).json({ erro: 'Explique a associação em 20 a 1000 caracteres.' });
    }

    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        const sighting = await client.query('SELECT id_animal FROM Avistamento WHERE id_avistamento = $1 FOR UPDATE', [req.params.id]);
        if (!sighting.rowCount) {
            await client.query('ROLLBACK');
            return res.status(404).json({ erro: 'Avistamento não encontrado.' });
        }
        if (sighting.rows[0].id_animal !== null) {
            await client.query('ROLLBACK');
            return res.status(409).json({ erro: 'Este avistamento já está associado a um cadastro.' });
        }
        const pending = await client.query(`SELECT id_solicitacao FROM Solicitacao_Associacao_Avistamento
            WHERE id_avistamento = $1 AND status_solicitacao = 'PENDENTE'`, [req.params.id]);
        if (pending.rowCount) {
            await client.query('ROLLBACK');
            return res.status(409).json({ erro: 'Já existe uma solicitação pendente para este avistamento.' });
        }
        const animal = await client.query('SELECT status_validacao FROM Animal WHERE id_animal = $1 FOR SHARE', [animalId]);
        if (!animal.rowCount) {
            await client.query('ROLLBACK');
            return res.status(404).json({ erro: 'Cadastro de animal não encontrado.' });
        }
        if (animal.rows[0].status_validacao !== 'Validado') {
            await client.query('ROLLBACK');
            return res.status(409).json({ erro: unvalidatedMessage });
        }
        const requester = await client.query('SELECT id_usuario FROM Usuario WHERE id_usuario = $1 AND ativo = TRUE', [req.usuario.id_usuario]);
        if (!requester.rowCount) {
            await client.query('ROLLBACK');
            return res.status(403).json({ erro: 'Esta conta não está ativa.' });
        }

        const created = await client.query(`INSERT INTO Solicitacao_Associacao_Avistamento
            (id_avistamento, id_animal_proposto, id_usuario_solicitante, justificativa)
            VALUES ($1, $2, $3, $4)
            RETURNING id_solicitacao, status_solicitacao, data_solicitacao`,
            [req.params.id, animalId, req.usuario.id_usuario, justificativa.trim()]);
        await client.query('COMMIT');
        return res.status(201).json({ mensagem: 'Solicitação enviada para análise da prefeitura.', solicitacao: created.rows[0] });
    } catch (error) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        if (error.code === '23505') return res.status(409).json({ erro: 'Já existe uma solicitação pendente para este avistamento.' });
        console.error('Erro ao solicitar associação de avistamento:', error);
        return res.status(500).json({ erro: 'Não foi possível enviar a solicitação.' });
    } finally { client?.release(); }
}

module.exports = { solicitar };
