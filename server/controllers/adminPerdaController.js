const pool = require('../config/database');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
// Mesmas validações, pasta privada de fotos e campos de resposta das publicações feitas pelos tutores.
const { validate, imageExtension, deletePhoto, validId, fields, uploads } = require('./perdaController');

const PAGE_SIZE = 20;
const STATUSES = ['PERDIDO', 'ENCONTRADO'];
const tutorFields = `u.id_usuario AS id_usuario_tutor, u.nome AS tutor_nome, u.telefone AS tutor_telefone`;
const from = 'FROM Publica_Perda p JOIN Usuario u ON u.id_usuario = p.id_usuario_tutor';

function validDate(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
        && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
const loadOne = (db, id) => db.query(`SELECT ${fields}, ${tutorFields}, u.email AS tutor_email ${from} WHERE p.id_perda = $1`, [id]);

async function listar(req, res) {
    const { q = '', status = '', especie = '', inicio = '', fim = '', offset = '0' } = req.query;
    if (typeof q !== 'string' || q.length > 100) return res.status(400).json({ erro: 'Busca inválida (até 100 caracteres).' });
    if (!['', ...STATUSES].includes(status)) return res.status(400).json({ erro: 'Situação inválida.' });
    if (!['', 'Cachorro', 'Gato', 'Outro'].includes(especie)) return res.status(400).json({ erro: 'Espécie inválida.' });
    if ((inicio && !validDate(inicio)) || (fim && !validDate(fim))) return res.status(400).json({ erro: 'Informe datas válidas no formato AAAA-MM-DD.' });
    if (inicio && fim && inicio > fim) return res.status(400).json({ erro: 'A data inicial deve ser anterior ou igual à data final.' });
    if (typeof offset !== 'string' || !/^\d{1,7}$/.test(offset)) return res.status(400).json({ erro: 'Página inválida.' });
    // O período considera a data do desaparecimento informada pelo tutor.
    const where = `($1 = '' OR position(lower($1) in lower(concat_ws(' ', p.id_perda::text, p.nome_animal, p.especie, p.raca, p.cor,
            p.genero, p.local_desaparecimento, p.descricao, u.nome))) > 0)
        AND ($2 = '' OR p.status_perda = $2) AND ($3 = '' OR p.especie = $3)
        AND ($4 = '' OR p.data_desaparecimento >= NULLIF($4, '')::date)
        AND ($5 = '' OR p.data_desaparecimento < NULLIF($5, '')::date + interval '1 day')`;
    const values = [q.trim(), status, especie, inicio, fim];
    try {
        const total = await pool.query(`SELECT count(*)::int AS n ${from} WHERE ${where}`, values);
        const result = await pool.query(`SELECT ${fields}, ${tutorFields} ${from} WHERE ${where}
            ORDER BY p.data_publicacao DESC, p.id_perda DESC LIMIT ${PAGE_SIZE} OFFSET $6`, [...values, Number(offset)]);
        return res.json({ desaparecimentos: result.rows, total: total.rows[0].n, limite: PAGE_SIZE, offset: Number(offset) });
    } catch (error) {
        console.error('Erro ao listar desaparecimentos no painel:', error);
        return res.status(500).json({ erro: 'Não foi possível carregar os desaparecimentos.' });
    }
}

async function buscar(req, res) {
    if (!validId(req.params.id)) return res.status(400).json({ erro: 'Identificador de publicação inválido.' });
    try {
        const result = await loadOne(pool, req.params.id);
        if (!result.rowCount) return res.status(404).json({ erro: 'Publicação não encontrada.' });
        return res.json({ desaparecimento: result.rows[0] });
    } catch (error) {
        console.error('Erro ao consultar desaparecimento no painel:', error);
        return res.status(500).json({ erro: 'Não foi possível carregar esta publicação.' });
    }
}

// Igual à edição do tutor, sem a checagem de autoria; tutor, data de publicação e id nunca mudam.
// A situação é opcional: sem status_perda, a atual é mantida.
async function editar(req, res) {
    if (!validId(req.params.id)) return res.status(400).json({ erro: 'Identificador de publicação inválido.' });
    const body = req.body || {};
    let data, extension;
    try {
        data = validate(body);
        if (body.status_perda !== undefined && !STATUSES.includes(body.status_perda)) throw new Error('Informe a situação PERDIDO ou ENCONTRADO.');
        if (body.remover_foto !== undefined && !['true', 'false'].includes(body.remover_foto)) throw new Error('Valor de remover_foto inválido.');
        if (req.file) {
            if (body.remover_foto === 'true') throw new Error('Envie uma nova foto ou remova a atual, não as duas coisas.');
            extension = imageExtension(req.file.buffer);
            if (!extension) throw new Error('Envie uma imagem JPG, PNG ou WEBP válida.');
        }
    } catch (error) { return res.status(400).json({ erro: error.message }); }

    let client, savedFile;
    let committed = false;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        const current = await client.query('SELECT foto, status_perda FROM Publica_Perda WHERE id_perda = $1 FOR UPDATE', [req.params.id]);
        if (!current.rowCount) {
            await client.query('ROLLBACK');
            return res.status(404).json({ erro: 'Publicação não encontrada.' });
        }
        const oldPhoto = current.rows[0].foto;
        let photo = oldPhoto;
        if (req.file) {
            photo = `perda-${randomUUID()}.${extension}`;
            savedFile = path.join(uploads, photo);
            await fs.mkdir(uploads, { recursive: true });
            await fs.writeFile(savedFile, req.file.buffer, { flag: 'wx' });
        } else if (body.remover_foto === 'true') photo = null;
        await client.query(`UPDATE Publica_Perda SET nome_animal = $1, especie = $2, raca = $3, cor = $4, genero = $5, foto = $6,
            local_desaparecimento = $7, data_desaparecimento = $8, descricao = $9, status_perda = $10 WHERE id_perda = $11`,
            [data.nome_animal, data.especie, data.raca, data.cor, data.genero, photo, data.local_desaparecimento,
                data.data_desaparecimento, data.descricao, body.status_perda ?? current.rows[0].status_perda, req.params.id]);
        const result = await loadOne(client, req.params.id);
        await client.query('COMMIT'); committed = true;
        if (oldPhoto && oldPhoto !== photo) await deletePhoto(oldPhoto);
        return res.json({ mensagem: 'Publicação atualizada.', desaparecimento: result.rows[0] });
    } catch (error) {
        if (client && !committed) await client.query('ROLLBACK').catch(() => {});
        if (savedFile && !committed) await fs.unlink(savedFile).catch(() => {});
        console.error('Erro ao editar desaparecimento pelo painel:', error);
        return res.status(500).json({ erro: 'Não foi possível atualizar a publicação. Tente novamente.' });
    } finally { client?.release(); }
}

// Nenhuma tabela referencia Publica_Perda: a exclusão não afeta outros registros.
async function excluir(req, res) {
    if (!validId(req.params.id)) return res.status(400).json({ erro: 'Identificador de publicação inválido.' });
    if (req.body?.confirmar !== true) return res.status(400).json({ erro: 'Confirme a exclusão enviando { "confirmar": true }.' });
    let client;
    let committed = false;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        const current = await client.query('SELECT foto FROM Publica_Perda WHERE id_perda = $1 FOR UPDATE', [req.params.id]);
        if (!current.rowCount) {
            await client.query('ROLLBACK');
            return res.status(404).json({ erro: 'Publicação não encontrada.' });
        }
        await client.query('DELETE FROM Publica_Perda WHERE id_perda = $1', [req.params.id]);
        await client.query('COMMIT'); committed = true;
        // A foto só é apagada depois do COMMIT; se a transação falhar, ela continua junto do registro.
        if (current.rows[0].foto) await deletePhoto(current.rows[0].foto);
        return res.json({ mensagem: 'Publicação excluída.' });
    } catch (error) {
        if (client && !committed) await client.query('ROLLBACK').catch(() => {});
        if (error.code === '23503') return res.status(409).json({ erro: 'Esta publicação recebeu um vínculo e não pode ser excluída.' });
        console.error('Erro ao excluir desaparecimento pelo painel:', error);
        return res.status(500).json({ erro: 'Não foi possível excluir a publicação. Tente novamente.' });
    } finally { client?.release(); }
}

module.exports = { listar, buscar, editar, excluir };
