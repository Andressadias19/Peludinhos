const pool = require('../config/database');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
// Mesmas validações e regras de foto do registro feito pelos usuários.
const { validate, imageExtension, serialize, uploads } = require('./avistamentoController');

const PAGE_SIZE = 20;
const ASSOCIATIONS = {
    '': 'TRUE',
    vinculado: 'v.id_animal IS NOT NULL',
    sem_cadastro: 'v.id_animal IS NULL',
    pendente: `EXISTS (SELECT 1 FROM Solicitacao_Associacao_Avistamento s WHERE s.id_avistamento = v.id_avistamento AND s.status_solicitacao = 'PENDENTE')`,
};
const photoName = /^avistamento-[0-9a-f-]{36}\.(jpg|png|webp)$/;
const fields = `v.id_avistamento, v.id_animal, v.latitude, v.longitude, v.data_hora, v.foto, v.observacao, v.estado_saude,
    v.nome_observado AS nome, v.especie_observada AS especie, v.raca_observada AS raca, v.cor_observada AS cor,
    v.genero_observado AS genero, v.id_usuario_autor, u.nome AS autor_nome, a.nome AS animal_nome,
    a.status_validacao AS animal_status_validacao,
    EXISTS (SELECT 1 FROM Solicitacao_Associacao_Avistamento s
        WHERE s.id_avistamento = v.id_avistamento AND s.status_solicitacao = 'PENDENTE') AS associacao_pendente`;
const from = `FROM Avistamento v JOIN Usuario u ON u.id_usuario = v.id_usuario_autor LEFT JOIN Animal a ON a.id_animal = v.id_animal`;

function validId(id) { return typeof id === 'string' && /^[1-9]\d{0,18}$/.test(id) && BigInt(id) <= 9223372036854775807n; }
function validDate(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
        && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

// Só apaga arquivos gerados para avistamentos e que nenhum outro registro ainda usa (cadastros antigos podiam repetir a foto).
async function removeFile(photo) {
    const name = path.basename(photo || '');
    if (!photoName.test(name)) return;
    const used = await pool.query('SELECT (SELECT count(*) FROM Avistamento WHERE foto = $1) + (SELECT count(*) FROM Animal WHERE foto = $1) AS n', [photo]);
    if (Number(used.rows[0].n) > 0) return;
    await fs.unlink(path.join(uploads, name)).catch(error => {
        if (error.code !== 'ENOENT') console.error('Foto do avistamento não pôde ser removida:', error);
    });
}

async function listar(req, res) {
    const { q = '', associacao = '', especie = '', inicio = '', fim = '', offset = '0' } = req.query;
    if (typeof q !== 'string' || q.length > 100) return res.status(400).json({ erro: 'Busca inválida (até 100 caracteres).' });
    if (typeof associacao !== 'string' || !Object.hasOwn(ASSOCIATIONS, associacao)) return res.status(400).json({ erro: 'Filtro de associação inválido.' });
    if (!['', 'Cachorro', 'Gato', 'Outro'].includes(especie)) return res.status(400).json({ erro: 'Espécie inválida.' });
    if ((inicio && !validDate(inicio)) || (fim && !validDate(fim))) return res.status(400).json({ erro: 'Informe datas válidas no formato AAAA-MM-DD.' });
    if (inicio && fim && inicio > fim) return res.status(400).json({ erro: 'A data inicial deve ser anterior ou igual à data final.' });
    if (typeof offset !== 'string' || !/^\d{1,7}$/.test(offset)) return res.status(400).json({ erro: 'Página inválida.' });
    const where = `($1 = '' OR position(lower($1) in lower(concat_ws(' ', v.id_avistamento::text, v.observacao, v.estado_saude,
            v.nome_observado, v.especie_observada, v.raca_observada, v.cor_observada, u.nome, a.nome, a.id_animal::text))) > 0)
        AND ($2 = '' OR v.especie_observada = $2)
        AND ($3 = '' OR v.data_hora >= NULLIF($3, '')::date)
        AND ($4 = '' OR v.data_hora < NULLIF($4, '')::date + interval '1 day')
        AND ${ASSOCIATIONS[associacao]}`;
    const values = [q.trim(), especie, inicio, fim];
    try {
        const total = await pool.query(`SELECT count(*)::int AS n ${from} WHERE ${where}`, values);
        const result = await pool.query(`SELECT ${fields} ${from} WHERE ${where}
            ORDER BY v.data_hora DESC, v.id_avistamento DESC LIMIT ${PAGE_SIZE} OFFSET $5`, [...values, Number(offset)]);
        return res.json({ avistamentos: result.rows.map(serialize), total: total.rows[0].n, limite: PAGE_SIZE, offset: Number(offset) });
    } catch (error) {
        console.error('Erro ao listar avistamentos no painel:', error);
        return res.status(500).json({ erro: 'Não foi possível carregar os avistamentos.' });
    }
}

async function buscar(req, res) {
    if (!validId(req.params.id)) return res.status(400).json({ erro: 'Identificador de avistamento inválido.' });
    try {
        const result = await pool.query(`SELECT ${fields}, u.email AS autor_email, a.foto AS animal_foto ${from} WHERE v.id_avistamento = $1`, [req.params.id]);
        if (!result.rowCount) return res.status(404).json({ erro: 'Avistamento não encontrado.' });
        const requests = await pool.query(`SELECT s.id_solicitacao, s.status_solicitacao, s.data_solicitacao, s.justificativa,
            s.id_animal_proposto, a.nome AS animal_proposto_nome, u.nome AS solicitante_nome
            FROM Solicitacao_Associacao_Avistamento s JOIN Animal a ON a.id_animal = s.id_animal_proposto
            JOIN Usuario u ON u.id_usuario = s.id_usuario_solicitante
            WHERE s.id_avistamento = $1 ORDER BY s.data_solicitacao DESC, s.id_solicitacao DESC`, [req.params.id]);
        return res.json({ avistamento: serialize(result.rows[0]), solicitacoes: requests.rows, pode_excluir: requests.rowCount === 0 });
    } catch (error) {
        console.error('Erro ao consultar avistamento no painel:', error);
        return res.status(500).json({ erro: 'Não foi possível carregar o avistamento.' });
    }
}

// O vínculo com um animal não muda aqui: só por uma solicitação de associação, que já tem fluxo próprio.
async function editar(req, res) {
    if (!validId(req.params.id)) return res.status(400).json({ erro: 'Identificador de avistamento inválido.' });
    const body = req.body || {};
    if (body.id_animal !== undefined) return res.status(400).json({ erro: 'O vínculo com um animal só pode mudar por uma solicitação de associação.' });
    if (body.remover_foto !== undefined && !['true', 'false'].includes(body.remover_foto)) return res.status(400).json({ erro: 'Valor para remover a foto inválido.' });
    let extension;
    if (req.file) {
        if (body.remover_foto === 'true') return res.status(400).json({ erro: 'Envie uma nova foto ou remova a atual, não as duas coisas.' });
        extension = imageExtension(req.file.buffer);
        if (!extension) return res.status(400).json({ erro: 'Envie uma imagem JPG, PNG ou WEBP válida.' });
    }

    let client, savedFile;
    let committed = false;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        const current = await client.query('SELECT id_animal, foto FROM Avistamento WHERE id_avistamento = $1 FOR UPDATE', [req.params.id]);
        if (!current.rowCount) {
            await client.query('ROLLBACK');
            return res.status(404).json({ erro: 'Avistamento não encontrado.' });
        }
        const old = current.rows[0];
        let data;
        try {
            // Avistamento vinculado: valida como no registro comum com animal selecionado, que recusa características observadas.
            data = validate(old.id_animal ? { ...body, id_animal: String(old.id_animal) } : body);
        } catch (error) {
            await client.query('ROLLBACK');
            return res.status(400).json({ erro: error.message });
        }
        let photo = old.foto;
        if (req.file) {
            const filename = `avistamento-${randomUUID()}.${extension}`;
            savedFile = path.join(uploads, filename);
            await fs.mkdir(uploads, { recursive: true });
            await fs.writeFile(savedFile, req.file.buffer, { flag: 'wx' });
            photo = `/uploads/${filename}`;
        } else if (body.remover_foto === 'true') photo = null;
        if (old.id_animal) {
            await client.query(`UPDATE Avistamento SET latitude = $1, longitude = $2, foto = $3, observacao = $4, estado_saude = $5
                WHERE id_avistamento = $6`, [data.latitude, data.longitude, photo, data.observacao, data.estado_saude, req.params.id]);
        } else {
            await client.query(`UPDATE Avistamento SET latitude = $1, longitude = $2, foto = $3, observacao = $4, estado_saude = $5,
                nome_observado = $6, especie_observada = $7, raca_observada = $8, cor_observada = $9, genero_observado = $10
                WHERE id_avistamento = $11`, [data.latitude, data.longitude, photo, data.observacao, data.estado_saude,
                data.nome, data.especie, data.raca, data.cor, data.genero, req.params.id]);
        }
        const result = await client.query(`SELECT ${fields} ${from} WHERE v.id_avistamento = $1`, [req.params.id]);
        await client.query('COMMIT'); committed = true;
        if (old.foto && old.foto !== photo) await removeFile(old.foto);
        return res.json({ mensagem: 'Avistamento atualizado.', avistamento: serialize(result.rows[0]) });
    } catch (error) {
        if (client && !committed) await client.query('ROLLBACK').catch(() => {});
        if (savedFile && !committed) await fs.unlink(savedFile).catch(() => {});
        console.error('Erro ao editar avistamento pelo painel:', error);
        return res.status(500).json({ erro: 'Não foi possível atualizar o avistamento.' });
    } finally { client?.release(); }
}

async function excluir(req, res) {
    if (!validId(req.params.id)) return res.status(400).json({ erro: 'Identificador de avistamento inválido.' });
    if (req.body?.confirmar !== true) return res.status(400).json({ erro: 'Confirme a exclusão enviando { "confirmar": true }.' });
    let client;
    let committed = false;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        // FOR UPDATE espera uma solicitação de associação em andamento, que trava o mesmo avistamento.
        const current = await client.query('SELECT foto FROM Avistamento WHERE id_avistamento = $1 FOR UPDATE', [req.params.id]);
        if (!current.rowCount) {
            await client.query('ROLLBACK');
            return res.status(404).json({ erro: 'Avistamento não encontrado.' });
        }
        // Solicitações (de qualquer status) guardam o histórico da análise; não são apagadas junto.
        const requests = await client.query('SELECT count(*)::int AS n FROM Solicitacao_Associacao_Avistamento WHERE id_avistamento = $1', [req.params.id]);
        if (requests.rows[0].n > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ erro: 'Este avistamento tem solicitações de associação e não pode ser excluído.', dependencias: { solicitacoes_associacao: requests.rows[0].n } });
        }
        await client.query('DELETE FROM Avistamento WHERE id_avistamento = $1', [req.params.id]);
        await client.query('COMMIT'); committed = true;
        await removeFile(current.rows[0].foto);
        return res.json({ mensagem: 'Avistamento excluído.' });
    } catch (error) {
        if (client && !committed) await client.query('ROLLBACK').catch(() => {});
        if (error.code === '23503') return res.status(409).json({ erro: 'Este avistamento recebeu um vínculo durante a exclusão e não pode ser excluído.' });
        console.error('Erro ao excluir avistamento pelo painel:', error);
        return res.status(500).json({ erro: 'Não foi possível excluir o avistamento.' });
    } finally { client?.release(); }
}

module.exports = { listar, buscar, editar, excluir };
