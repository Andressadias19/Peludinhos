const pool = require('../config/database');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
// Mesmas validações e regras de foto do cadastro feito pelos usuários.
const { validate, imageExtension, photoName, uploads } = require('./animalController');

const PAGE_SIZE = 20;
const STATUSES = ['Pendente', 'Validado', 'Recusado'];
const EDITABLE = ['nome', 'especie', 'raca', 'cor', 'genero', 'idade_aproximada', 'caracteristicas', 'situacao',
    'status_castracao', 'status_vacinacao', 'fonte_informacao'];
const fields = `a.id_animal, a.nome, a.especie, a.raca, a.cor, a.genero, a.foto, a.idade_aproximada, a.caracteristicas,
    a.situacao, a.status_castracao, a.status_vacinacao, a.fonte_informacao, a.status_validacao, a.data_validacao,
    a.observacao_validacao, a.data_cadastro, a.data_atualizacao, a.id_usuario_cadastrador, u.nome AS cadastrador_nome`;

function validId(id) { return typeof id === 'string' && /^[1-9]\d{0,18}$/.test(id) && BigInt(id) <= 9223372036854775807n; }

async function removeFile(photo) {
    if (!photo || !photoName.test(path.basename(photo))) return;
    await fs.unlink(path.join(uploads, path.basename(photo))).catch(error => {
        if (error.code !== 'ENOENT') console.error('Foto do animal não pôde ser removida:', error);
    });
}

// Avistamentos e solicitações guardam histórico; com qualquer um deles a exclusão é bloqueada.
async function dependencies(db, id) {
    const result = await db.query(`SELECT
        (SELECT count(*) FROM Avistamento WHERE id_animal = $1)::int AS avistamentos,
        (SELECT count(*) FROM Solicitacao_Associacao_Avistamento WHERE id_animal_proposto = $1)::int AS solicitacoes_associacao,
        (SELECT count(*) FROM Solicitacao_adocao WHERE id_animal = $1)::int AS solicitacoes_adocao`, [id]);
    return result.rows[0];
}
const hasDependencies = deps => deps.avistamentos + deps.solicitacoes_associacao + deps.solicitacoes_adocao > 0;

async function listar(req, res) {
    const { q = '', status = '', especie = '', offset = '0' } = req.query;
    if (typeof q !== 'string' || q.length > 100) return res.status(400).json({ erro: 'Busca inválida (até 100 caracteres).' });
    if (!['', ...STATUSES].includes(status)) return res.status(400).json({ erro: 'Status de validação inválido.' });
    if (!['', 'Cachorro', 'Gato', 'Outro'].includes(especie)) return res.status(400).json({ erro: 'Espécie inválida.' });
    if (typeof offset !== 'string' || !/^\d{1,7}$/.test(offset)) return res.status(400).json({ erro: 'Página inválida.' });
    const where = `($1 = '' OR position(lower($1) in lower(concat_ws(' ', a.id_animal::text, a.nome, a.especie, a.raca,
            a.cor, a.genero, a.caracteristicas, u.nome))) > 0)
        AND ($2 = '' OR a.status_validacao = $2) AND ($3 = '' OR a.especie = $3)`;
    const values = [q.trim(), status, especie];
    try {
        const total = await pool.query(`SELECT count(*)::int AS n FROM Animal a JOIN Usuario u ON u.id_usuario = a.id_usuario_cadastrador WHERE ${where}`, values);
        const result = await pool.query(`SELECT ${fields},
            (SELECT count(*)::int FROM Avistamento v WHERE v.id_animal = a.id_animal) AS total_avistamentos
            FROM Animal a JOIN Usuario u ON u.id_usuario = a.id_usuario_cadastrador WHERE ${where}
            ORDER BY a.data_cadastro DESC NULLS LAST, a.id_animal DESC LIMIT ${PAGE_SIZE} OFFSET $4`, [...values, Number(offset)]);
        return res.json({ animais: result.rows, total: total.rows[0].n, limite: PAGE_SIZE, offset: Number(offset) });
    } catch (error) {
        console.error('Erro ao listar animais no painel:', error);
        return res.status(500).json({ erro: 'Não foi possível carregar os animais.' });
    }
}

async function buscar(req, res) {
    if (!validId(req.params.id)) return res.status(400).json({ erro: 'Identificador de animal inválido.' });
    try {
        const result = await pool.query(`SELECT ${fields}, u.email AS cadastrador_email, a.id_usuario_validador, val.nome AS validador_nome
            FROM Animal a JOIN Usuario u ON u.id_usuario = a.id_usuario_cadastrador
            LEFT JOIN Usuario val ON val.id_usuario = a.id_usuario_validador WHERE a.id_animal = $1`, [req.params.id]);
        if (!result.rowCount) return res.status(404).json({ erro: 'Animal não encontrado.' });
        const deps = await dependencies(pool, req.params.id);
        const sightings = await pool.query(`SELECT id_avistamento, data_hora, observacao, foto FROM Avistamento
            WHERE id_animal = $1 ORDER BY data_hora DESC, id_avistamento DESC LIMIT 5`, [req.params.id]);
        return res.json({ animal: result.rows[0], dependencias: deps, pode_excluir: !hasDependencies(deps), avistamentos_recentes: sightings.rows });
    } catch (error) {
        console.error('Erro ao consultar animal no painel:', error);
        return res.status(500).json({ erro: 'Não foi possível carregar o animal.' });
    }
}

async function criar(req, res) {
    let data, extension;
    try {
        data = validate(req.body || {});
        if (req.file) {
            extension = imageExtension(req.file.buffer);
            if (!extension) throw new Error('Envie uma imagem JPG, PNG ou WEBP válida.');
        }
    } catch (error) { return res.status(400).json({ erro: error.message }); }
    let client, savedFile;
    let committed = false;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        let photo = null;
        if (req.file) {
            const filename = `animal-${randomUUID()}.${extension}`;
            savedFile = path.join(uploads, filename);
            await fs.mkdir(uploads, { recursive: true });
            await fs.writeFile(savedFile, req.file.buffer, { flag: 'wx' });
            photo = `/uploads/${filename}`;
        }
        // O administrador fica como cadastrador; como no cadastro comum, o registro nasce Pendente.
        const created = await client.query(`INSERT INTO Animal
            (nome, especie, raca, cor, genero, foto, idade_aproximada, caracteristicas, situacao,
             status_castracao, status_vacinacao, fonte_informacao, status_validacao, data_atualizacao, id_usuario_cadastrador)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'Pendente',CURRENT_TIMESTAMP,$13) RETURNING id_animal`,
            [data.nome, data.especie, data.raca, data.cor, data.genero, photo, data.idade_aproximada, data.caracteristicas,
                data.situacao, data.status_castracao, data.status_vacinacao, data.fonte_informacao, req.administrador.id_usuario]);
        const result = await client.query(`SELECT ${fields} FROM Animal a JOIN Usuario u ON u.id_usuario = a.id_usuario_cadastrador
            WHERE a.id_animal = $1`, [created.rows[0].id_animal]);
        await client.query('COMMIT'); committed = true;
        return res.status(201).json({ mensagem: 'Animal cadastrado. Validação pendente.', animal: result.rows[0] });
    } catch (error) {
        if (client && !committed) await client.query('ROLLBACK').catch(() => {});
        if (savedFile && !committed) await fs.unlink(savedFile).catch(() => {});
        console.error('Erro ao cadastrar animal pelo painel:', error);
        return res.status(500).json({ erro: 'Não foi possível cadastrar o animal.' });
    } finally { client?.release(); }
}

async function editar(req, res) {
    if (!validId(req.params.id)) return res.status(400).json({ erro: 'Identificador de animal inválido.' });
    let data, extension;
    try {
        data = validate(req.body || {});
        if (req.body?.remover_foto !== undefined && !['true', 'false'].includes(req.body.remover_foto)) throw new Error('Valor para remover a foto inválido.');
        if (req.file) {
            if (req.body.remover_foto === 'true') throw new Error('Envie uma nova foto ou remova a atual, não as duas coisas.');
            extension = imageExtension(req.file.buffer);
            if (!extension) throw new Error('Envie uma imagem JPG, PNG ou WEBP válida.');
        }
    } catch (error) { return res.status(400).json({ erro: error.message }); }

    let client, savedFile;
    let committed = false;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        const current = await client.query('SELECT * FROM Animal WHERE id_animal = $1 FOR UPDATE', [req.params.id]);
        if (!current.rowCount) {
            await client.query('ROLLBACK');
            return res.status(404).json({ erro: 'Animal não encontrado.' });
        }
        const old = current.rows[0];
        let photo = old.foto;
        if (req.file) {
            const filename = `animal-${randomUUID()}.${extension}`;
            savedFile = path.join(uploads, filename);
            await fs.mkdir(uploads, { recursive: true });
            await fs.writeFile(savedFile, req.file.buffer, { flag: 'wx' });
            photo = `/uploads/${filename}`;
        } else if (req.body.remover_foto === 'true') photo = null;
        // Todos os campos do cadastro passam por validação; só uma mudança real reinicia o status.
        const changed = photo !== old.foto || EDITABLE.some(key => (data[key] ?? null) !== (old[key] ?? null));
        if (changed) {
            await client.query(`UPDATE Animal SET nome = $1, especie = $2, raca = $3, cor = $4, genero = $5, foto = $6,
                idade_aproximada = $7, caracteristicas = $8, situacao = $9, status_castracao = $10, status_vacinacao = $11,
                fonte_informacao = $12, status_validacao = 'Pendente', id_usuario_validador = NULL, data_validacao = NULL,
                observacao_validacao = NULL, data_atualizacao = CURRENT_TIMESTAMP WHERE id_animal = $13`,
                [data.nome, data.especie, data.raca, data.cor, data.genero, photo, data.idade_aproximada, data.caracteristicas,
                    data.situacao, data.status_castracao, data.status_vacinacao, data.fonte_informacao, req.params.id]);
        }
        const result = await client.query(`SELECT ${fields} FROM Animal a JOIN Usuario u ON u.id_usuario = a.id_usuario_cadastrador
            WHERE a.id_animal = $1`, [req.params.id]);
        await client.query('COMMIT'); committed = true;
        if (changed && old.foto && old.foto !== photo) await removeFile(old.foto);
        return res.json({
            mensagem: changed ? 'Cadastro atualizado. A validação voltou para Pendente.' : 'Nenhuma alteração encontrada.',
            alterado: changed, animal: result.rows[0],
        });
    } catch (error) {
        if (client && !committed) await client.query('ROLLBACK').catch(() => {});
        if (savedFile && !committed) await fs.unlink(savedFile).catch(() => {});
        console.error('Erro ao editar animal pelo painel:', error);
        return res.status(500).json({ erro: 'Não foi possível atualizar o cadastro.' });
    } finally { client?.release(); }
}

async function excluir(req, res) {
    if (!validId(req.params.id)) return res.status(400).json({ erro: 'Identificador de animal inválido.' });
    // Confirmação explícita no corpo: um DELETE enviado por engano não apaga nada.
    if (req.body?.confirmar !== true) return res.status(400).json({ erro: 'Confirme a exclusão enviando { "confirmar": true }.' });
    let client;
    let committed = false;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        // FOR UPDATE espera avistamentos em andamento, que travam o animal com FOR SHARE antes de gravar.
        const current = await client.query('SELECT foto FROM Animal WHERE id_animal = $1 FOR UPDATE', [req.params.id]);
        if (!current.rowCount) {
            await client.query('ROLLBACK');
            return res.status(404).json({ erro: 'Animal não encontrado.' });
        }
        const deps = await dependencies(client, req.params.id);
        if (hasDependencies(deps)) {
            await client.query('ROLLBACK');
            return res.status(409).json({ erro: 'Este animal tem histórico vinculado e não pode ser excluído.', dependencias: deps });
        }
        await client.query('DELETE FROM Animal WHERE id_animal = $1', [req.params.id]);
        await client.query('COMMIT'); committed = true;
        await removeFile(current.rows[0].foto);
        return res.json({ mensagem: 'Animal excluído.' });
    } catch (error) {
        if (client && !committed) await client.query('ROLLBACK').catch(() => {});
        // Uma dependência criada entre a conferência e o DELETE é barrada pela chave estrangeira.
        if (error.code === '23503') return res.status(409).json({ erro: 'Este animal recebeu um vínculo durante a exclusão e não pode ser excluído.' });
        console.error('Erro ao excluir animal pelo painel:', error);
        return res.status(500).json({ erro: 'Não foi possível excluir o animal.' });
    } finally { client?.release(); }
}

module.exports = { listar, buscar, criar, editar, excluir };
