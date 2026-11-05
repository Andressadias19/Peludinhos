const pool = require('../config/database');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const uploads = path.join(__dirname, '..', 'uploads');
const photoName = /^animal-[0-9a-f-]{36}\.(jpg|png|webp)$/;
function validId(id) { return /^[1-9]\d{0,18}$/.test(id) && BigInt(id) <= 9223372036854775807n; }
function validate(body) {
    const data = {};
    for (const [key, max] of Object.entries({ nome: 100, raca: 50, cor: 50, genero: 20, caracteristicas: 500 })) {
        if (body[key] !== undefined && typeof body[key] !== 'string') throw new Error(`Campo ${key} inválido.`);
        data[key] = body[key]?.trim() || null;
        if (data[key]?.includes('\0') || data[key]?.length > max) throw new Error(`Campo ${key} inválido (até ${max} caracteres).`);
    }
    if (!['Cachorro', 'Gato', 'Outro'].includes(body.especie)) throw new Error('Selecione a espécie do animal.');
    data.especie = body.especie;
    if (data.genero && !['Macho', 'Fêmea'].includes(data.genero)) throw new Error('Sexo do animal inválido.');
    const choices = {
        idade_aproximada: ['FILHOTE', 'ADULTO', 'IDOSO', 'DESCONHECIDA'],
        situacao: ['EM_SITUACAO_DE_RUA', 'RESGATADO', 'EM_TRATAMENTO', 'ACOLHIDO', 'DISPONIVEL_PARA_ADOCAO', 'ADOTADO', 'FALECIDO', 'NAO_INFORMADA'],
        status_castracao: ['CASTRADO', 'NAO_CASTRADO', 'DESCONHECIDO'],
        status_vacinacao: ['ATUALIZADA', 'INCOMPLETA', 'DESCONHECIDA'],
        fonte_informacao: ['OBSERVACAO_DIRETA', 'INFORMADO_POR_TERCEIRO', 'REGISTRO_VETERINARIO', 'NAO_INFORMADA'],
    };
    const defaults = { idade_aproximada: 'DESCONHECIDA', situacao: 'NAO_INFORMADA', status_castracao: 'DESCONHECIDO', status_vacinacao: 'DESCONHECIDA', fonte_informacao: 'NAO_INFORMADA' };
    for (const [key, allowed] of Object.entries(choices)) {
        const value = body[key] === undefined || body[key] === '' ? defaults[key] : body[key];
        if (typeof value !== 'string' || !allowed.includes(value)) throw new Error(`Campo ${key} inválido.`);
        data[key] = value;
    }
    return data;
}
function imageExtension(buffer) {
    if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
    if (buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'png';
    if (buffer.length > 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
    return null;
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
        const author = await client.query('SELECT id_usuario FROM Usuario WHERE id_usuario = $1 AND ativo = TRUE', [req.usuario.id_usuario]);
        if (!author.rowCount) {
            await client.query('ROLLBACK');
            return res.status(403).json({ erro: 'Esta conta não está ativa.' });
        }
        let photo = null;
        if (req.file) {
            const filename = `animal-${randomUUID()}.${extension}`;
            savedFile = path.join(uploads, filename);
            await fs.mkdir(uploads, { recursive: true });
            await fs.writeFile(savedFile, req.file.buffer, { flag: 'wx' });
            photo = `/uploads/${filename}`;
        }
        // Cadastrador não é automaticamente tutor nem validador.
        const result = await client.query(`INSERT INTO Animal
            (nome, especie, raca, cor, genero, foto, idade_aproximada, caracteristicas, situacao,
             status_castracao, status_vacinacao, fonte_informacao, status_validacao, data_atualizacao, id_usuario_cadastrador)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'Pendente',CURRENT_TIMESTAMP,$13)
            RETURNING id_animal, nome, especie, raca, cor, genero, foto, idade_aproximada, caracteristicas,
                situacao, status_castracao, status_vacinacao, fonte_informacao, status_validacao, data_atualizacao`,
            [data.nome, data.especie, data.raca, data.cor, data.genero, photo, data.idade_aproximada, data.caracteristicas,
                data.situacao, data.status_castracao, data.status_vacinacao, data.fonte_informacao, req.usuario.id_usuario]);
        await client.query('COMMIT'); committed = true;
        return res.status(201).json({ mensagem: 'Animal cadastrado. Validação pendente.', animal: result.rows[0] });
    } catch (error) {
        if (client && !committed) await client.query('ROLLBACK').catch(() => {});
        if (savedFile && !committed) await fs.unlink(savedFile).catch(() => {});
        console.error('Erro ao cadastrar animal:', error);
        return res.status(500).json({ erro: 'Não foi possível cadastrar o animal.' });
    } finally { client?.release(); }
}

async function buscarParaEdicao(req, res) {
    if (!validId(req.params.id)) return res.status(400).json({ erro: 'Identificador de animal inválido.' });
    try {
        const result = await pool.query(`SELECT id_animal, nome, especie, raca, cor, genero, foto, idade_aproximada,
            caracteristicas, situacao, status_castracao, status_vacinacao, fonte_informacao, status_validacao, data_atualizacao
            FROM Animal WHERE id_animal = $1 AND id_usuario_cadastrador = $2`, [req.params.id, req.usuario.id_usuario]);
        if (!result.rowCount) return res.status(404).json({ erro: 'Cadastro não encontrado ou você não tem permissão para editá-lo.' });
        return res.json({ animal: result.rows[0] });
    } catch (error) {
        console.error('Erro ao carregar cadastro para edição:', error);
        return res.status(500).json({ erro: 'Não foi possível carregar o cadastro.' });
    }
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
        const current = await client.query(`SELECT a.id_usuario_cadastrador, a.foto, a.status_validacao
            FROM Animal a JOIN Usuario u ON u.id_usuario = a.id_usuario_cadastrador
            WHERE a.id_animal = $1 AND u.ativo = TRUE FOR UPDATE OF a`, [req.params.id]);
        if (!current.rowCount) {
            await client.query('ROLLBACK');
            return res.status(404).json({ erro: 'Cadastro não encontrado.' });
        }
        if (String(current.rows[0].id_usuario_cadastrador) !== String(req.usuario.id_usuario)) {
            await client.query('ROLLBACK');
            return res.status(403).json({ erro: 'Você só pode editar cadastros que criou.' });
        }
        const oldPhoto = current.rows[0].foto;
        let photo = oldPhoto;
        if (req.file) {
            const filename = `animal-${randomUUID()}.${extension}`;
            savedFile = path.join(uploads, filename);
            await fs.mkdir(uploads, { recursive: true });
            await fs.writeFile(savedFile, req.file.buffer, { flag: 'wx' });
            photo = `/uploads/${filename}`;
        } else if (req.body.remover_foto === 'true') photo = null;
        const updated = await client.query(`UPDATE Animal SET nome = $1, especie = $2, raca = $3, cor = $4,
            genero = $5, foto = $6, idade_aproximada = $7, caracteristicas = $8, situacao = $9,
            status_castracao = $10, status_vacinacao = $11, fonte_informacao = $12,
            status_validacao = 'Pendente', id_usuario_validador = NULL, data_atualizacao = CURRENT_TIMESTAMP
            WHERE id_animal = $13
            RETURNING id_animal, nome, especie, raca, cor, genero, foto, idade_aproximada, caracteristicas,
                situacao, status_castracao, status_vacinacao, fonte_informacao, status_validacao, data_atualizacao`,
            [data.nome, data.especie, data.raca, data.cor, data.genero, photo, data.idade_aproximada, data.caracteristicas,
                data.situacao, data.status_castracao, data.status_vacinacao, data.fonte_informacao, req.params.id]);
        await client.query('COMMIT'); committed = true;
        if (oldPhoto && oldPhoto !== photo && photoName.test(path.basename(oldPhoto))) {
            await fs.unlink(path.join(uploads, path.basename(oldPhoto))).catch(error => {
                if (error.code !== 'ENOENT') console.error('Foto antiga do animal não pôde ser removida:', error);
            });
        }
        return res.json({ mensagem: 'Cadastro atualizado. A validação voltou para Pendente.', animal: updated.rows[0] });
    } catch (error) {
        if (client && !committed) await client.query('ROLLBACK').catch(() => {});
        if (savedFile && !committed) await fs.unlink(savedFile).catch(() => {});
        console.error('Erro ao editar cadastro de animal:', error);
        return res.status(500).json({ erro: 'Não foi possível atualizar o cadastro.' });
    } finally { client?.release(); }
}

module.exports = { criar, buscarParaEdicao, editar };
