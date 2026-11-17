const pool = require('../config/database');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

// Pasta privada: não é servida por express.static; as fotos saem só por GET /api/perdidos/:id/foto.
const uploads = path.join(__dirname, '..', 'uploads-perdidos');
const contentTypes = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
// Formato dos nomes gerados pelo servidor; qualquer outro valor nunca vira caminho de arquivo.
const photoName = /^perda-[0-9a-f-]{36}\.(jpg|png|webp)$/;

// data_desaparecimento sai como texto YYYY-MM-DD para o navegador não deslocar o dia pelo fuso.
// O nome do arquivo da foto não é exposto; o cliente recebe apenas tem_foto.
const fields = `p.id_perda, p.nome_animal, p.especie, p.raca, p.cor, p.genero, (p.foto IS NOT NULL) AS tem_foto,
    p.local_desaparecimento, to_char(p.data_desaparecimento, 'YYYY-MM-DD') AS data_desaparecimento,
    p.descricao, p.status_perda, p.data_publicacao`;

function validId(id) {
    return /^[1-9]\d{0,18}$/.test(id) && BigInt(id) <= 9223372036854775807n;
}

function imageExtension(buffer) {
    if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
    if (buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'png';
    if (buffer.length > 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
    return null;
}

function deletePhoto(filename) {
    if (!photoName.test(filename || '')) return Promise.resolve();
    // Chamado só depois do COMMIT: se falhar, o banco já está correto e o arquivo fica órfão (inacessível pela API).
    return fs.unlink(path.join(uploads, filename)).catch(error => {
        if (error.code !== 'ENOENT') console.error(`Foto ${filename} não pôde ser apagada; o banco já foi atualizado e o arquivo ficou órfão em uploads-perdidos:`, error);
    });
}

function today() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function validate(body) {
    const limits = { nome_animal: 100, raca: 50, cor: 50, genero: 20, local_desaparecimento: 255, descricao: 1000, data_desaparecimento: 10 };
    const data = {};
    for (const [key, max] of Object.entries(limits)) {
        if (body[key] !== undefined && typeof body[key] !== 'string') throw new Error(`Campo ${key} inválido.`);
        // O PostgreSQL não aceita \0 em texto; sem esta checagem a gravação falharia com erro 500.
        if (body[key]?.includes('\0')) throw new Error(`O campo ${key} contém caracteres inválidos.`);
        data[key] = body[key]?.trim() || null;
        if (data[key]?.length > max) throw new Error(`O campo ${key} deve ter até ${max} caracteres.`);
    }
    if (!['Cachorro', 'Gato', 'Outro'].includes(body.especie)) throw new Error('Selecione a espécie do animal.');
    data.especie = body.especie;
    if (data.genero && !['Macho', 'Fêmea'].includes(data.genero)) throw new Error('Sexo do animal inválido.');
    if (!data.local_desaparecimento) throw new Error('Informe o local do desaparecimento.');
    if (!data.data_desaparecimento) throw new Error('Informe a data do desaparecimento.');
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data.data_desaparecimento);
    const date = match && new Date(Date.UTC(match[1], match[2] - 1, match[3]));
    if (!match || match[1] < 1900 || date.getUTCMonth() !== match[2] - 1 || date.getUTCDate() !== Number(match[3])) {
        throw new Error('Data do desaparecimento inválida.');
    }
    if (data.data_desaparecimento > today()) throw new Error('A data do desaparecimento não pode ser futura.');
    return data;
}

async function listar(req, res) {
    const rawLimit = req.query.limit ?? '200';
    if (typeof rawLimit !== 'string' || !/^\d+$/.test(rawLimit) || Number(rawLimit) < 1 || Number(rawLimit) > 500) {
        return res.status(400).json({ erro: 'O limite deve estar entre 1 e 500.' });
    }
    try {
        // A listagem não traz dados do tutor; o contato fica só nos detalhes.
        const result = await pool.query(`SELECT ${fields} FROM Publica_Perda p
            ORDER BY p.data_publicacao DESC, p.id_perda DESC LIMIT $1`, [Number(rawLimit)]);
        return res.json({ perdidos: result.rows });
    } catch (error) {
        console.error('Erro ao listar animais perdidos:', error);
        return res.status(500).json({ erro: 'Não foi possível carregar os animais perdidos.' });
    }
}

async function buscar(req, res) {
    if (!validId(req.params.id)) return res.status(400).json({ erro: 'Identificador de publicação inválido.' });
    try {
        const result = await pool.query(`SELECT ${fields}, u.nome AS tutor_nome, u.telefone AS tutor_telefone,
            (p.id_usuario_tutor = $2) AS eh_autor
            FROM Publica_Perda p JOIN Usuario u ON u.id_usuario = p.id_usuario_tutor
            WHERE p.id_perda = $1`, [req.params.id, req.usuario.id_usuario]);
        if (!result.rowCount) return res.status(404).json({ erro: 'Publicação não encontrada.' });
        return res.json({ perdido: result.rows[0] });
    } catch (error) {
        console.error('Erro ao buscar animal perdido:', error);
        return res.status(500).json({ erro: 'Não foi possível carregar esta publicação.' });
    }
}

async function criar(req, res) {
    let data;
    let extension;
    try {
        data = validate(req.body || {});
        if (req.file) {
            extension = imageExtension(req.file.buffer);
            if (!extension) throw new Error('Envie uma imagem JPG, PNG ou WEBP válida.');
        }
    } catch (error) { return res.status(400).json({ erro: error.message }); }

    let client;
    let savedFile;
    let committed = false;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        // O telefone fica só em Usuario; a publicação exige que ele exista para o contato nos detalhes.
        const tutor = await client.query('SELECT telefone FROM Usuario WHERE id_usuario = $1', [req.usuario.id_usuario]);
        if (!tutor.rowCount) {
            await client.query('ROLLBACK');
            return res.status(403).json({ erro: 'Usuário não encontrado.' });
        }
        if (!tutor.rows[0].telefone?.trim()) {
            await client.query('ROLLBACK');
            return res.status(400).json({ erro: 'Cadastre um telefone no seu perfil para publicar um desaparecimento.' });
        }
        let photo = null;
        if (req.file) {
            photo = `perda-${randomUUID()}.${extension}`;
            savedFile = path.join(uploads, photo);
            await fs.mkdir(uploads, { recursive: true });
            await fs.writeFile(savedFile, req.file.buffer, { flag: 'wx' });
        }
        const created = await client.query(`INSERT INTO Publica_Perda
            (nome_animal, especie, raca, cor, genero, foto, local_desaparecimento, data_desaparecimento, descricao, status_perda, id_usuario_tutor)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'PERDIDO',$10) RETURNING id_perda`,
            [data.nome_animal, data.especie, data.raca, data.cor, data.genero, photo, data.local_desaparecimento,
                data.data_desaparecimento, data.descricao, req.usuario.id_usuario]);
        const result = await client.query(`SELECT ${fields} FROM Publica_Perda p WHERE p.id_perda = $1`, [created.rows[0].id_perda]);
        await client.query('COMMIT');
        committed = true;
        return res.status(201).json({ mensagem: 'Desaparecimento publicado!', perdido: result.rows[0] });
    } catch (error) {
        if (client && !committed) await client.query('ROLLBACK').catch(() => {});
        if (savedFile && !committed) await fs.unlink(savedFile).catch(() => {});
        console.error('Erro ao publicar animal perdido:', error);
        return res.status(500).json({ erro: 'Não foi possível publicar o desaparecimento. Tente novamente.' });
    } finally { client?.release(); }
}

// PUT substitui todos os campos editáveis: um campo opcional ausente ou vazio passa a ser null.
// A foto é a exceção: sem arquivo e sem remover_foto=true, a atual é mantida.
// id_perda, id_usuario_tutor, status_perda e data_publicacao nunca são alterados aqui.
async function editar(req, res) {
    if (!validId(req.params.id)) return res.status(400).json({ erro: 'Identificador de publicação inválido.' });
    const body = req.body || {};
    let data;
    let extension;
    try {
        data = validate(body);
        if (body.remover_foto !== undefined && !['true', 'false'].includes(body.remover_foto)) throw new Error('Valor de remover_foto inválido.');
        if (req.file) {
            if (body.remover_foto === 'true') throw new Error('Envie uma nova foto ou remova a atual, não as duas coisas.');
            extension = imageExtension(req.file.buffer);
            if (!extension) throw new Error('Envie uma imagem JPG, PNG ou WEBP válida.');
        }
    } catch (error) { return res.status(400).json({ erro: error.message }); }

    let client;
    let savedFile;
    let committed = false;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        // FOR UPDATE impede que duas edições simultâneas da mesma publicação se sobreponham.
        const current = await client.query('SELECT id_usuario_tutor, foto FROM Publica_Perda WHERE id_perda = $1 FOR UPDATE', [req.params.id]);
        if (!current.rowCount) {
            await client.query('ROLLBACK');
            return res.status(404).json({ erro: 'Publicação não encontrada.' });
        }
        if (String(current.rows[0].id_usuario_tutor) !== String(req.usuario.id_usuario)) {
            await client.query('ROLLBACK');
            return res.status(403).json({ erro: 'Você só pode editar suas próprias publicações.' });
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
            local_desaparecimento = $7, data_desaparecimento = $8, descricao = $9 WHERE id_perda = $10`,
            [data.nome_animal, data.especie, data.raca, data.cor, data.genero, photo, data.local_desaparecimento,
                data.data_desaparecimento, data.descricao, req.params.id]);
        const result = await client.query(`SELECT ${fields} FROM Publica_Perda p WHERE p.id_perda = $1`, [req.params.id]);
        await client.query('COMMIT');
        committed = true;
        // A foto antiga só é apagada depois do COMMIT, para nunca ficar um registro apontando para arquivo inexistente.
        if (oldPhoto && oldPhoto !== photo) await deletePhoto(oldPhoto);
        return res.json({ mensagem: 'Publicação atualizada!', perdido: result.rows[0] });
    } catch (error) {
        if (client && !committed) await client.query('ROLLBACK').catch(() => {});
        if (savedFile && !committed) await fs.unlink(savedFile).catch(() => {});
        console.error('Erro ao editar animal perdido:', error);
        return res.status(500).json({ erro: 'Não foi possível atualizar a publicação. Tente novamente.' });
    } finally { client?.release(); }
}

async function alterarStatus(req, res) {
    if (!validId(req.params.id)) return res.status(400).json({ erro: 'Identificador de publicação inválido.' });
    const status = req.body?.status_perda;
    if (!['PERDIDO', 'ENCONTRADO'].includes(status)) return res.status(400).json({ erro: 'Informe o status PERDIDO ou ENCONTRADO.' });
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        const current = await client.query('SELECT id_usuario_tutor, status_perda FROM Publica_Perda WHERE id_perda = $1 FOR UPDATE', [req.params.id]);
        if (!current.rowCount) {
            await client.query('ROLLBACK');
            return res.status(404).json({ erro: 'Publicação não encontrada.' });
        }
        if (String(current.rows[0].id_usuario_tutor) !== String(req.usuario.id_usuario)) {
            await client.query('ROLLBACK');
            return res.status(403).json({ erro: 'Você só pode alterar o status das suas próprias publicações.' });
        }
        // Só o status muda; reenviar o status atual não grava nada.
        if (current.rows[0].status_perda !== status) {
            await client.query('UPDATE Publica_Perda SET status_perda = $1 WHERE id_perda = $2', [status, req.params.id]);
        }
        const result = await client.query(`SELECT ${fields} FROM Publica_Perda p WHERE p.id_perda = $1`, [req.params.id]);
        await client.query('COMMIT');
        return res.json({ mensagem: status === 'ENCONTRADO' ? 'Publicação marcada como encontrada!' : 'Publicação marcada como perdida.', perdido: result.rows[0] });
    } catch (error) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        console.error('Erro ao alterar status de animal perdido:', error);
        return res.status(500).json({ erro: 'Não foi possível alterar o status. Tente novamente.' });
    } finally { client?.release(); }
}

async function excluir(req, res) {
    if (!validId(req.params.id)) return res.status(400).json({ erro: 'Identificador de publicação inválido.' });
    let client;
    let committed = false;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        const current = await client.query('SELECT id_usuario_tutor, foto FROM Publica_Perda WHERE id_perda = $1 FOR UPDATE', [req.params.id]);
        if (!current.rowCount) {
            await client.query('ROLLBACK');
            return res.status(404).json({ erro: 'Publicação não encontrada.' });
        }
        if (String(current.rows[0].id_usuario_tutor) !== String(req.usuario.id_usuario)) {
            await client.query('ROLLBACK');
            return res.status(403).json({ erro: 'Você só pode excluir suas próprias publicações.' });
        }
        await client.query('DELETE FROM Publica_Perda WHERE id_perda = $1', [req.params.id]);
        await client.query('COMMIT');
        committed = true;
        // A foto só é apagada depois do COMMIT; se a transação falhar, ela continua junto do registro.
        if (current.rows[0].foto) await deletePhoto(current.rows[0].foto);
        return res.json({ mensagem: 'Publicação excluída com sucesso.' });
    } catch (error) {
        if (client && !committed) await client.query('ROLLBACK').catch(() => {});
        console.error('Erro ao excluir animal perdido:', error);
        return res.status(500).json({ erro: 'Não foi possível excluir a publicação. Tente novamente.' });
    } finally { client?.release(); }
}

async function foto(req, res) {
    if (!validId(req.params.id)) return res.status(400).json({ erro: 'Identificador de publicação inválido.' });
    let filename;
    try {
        const result = await pool.query('SELECT foto FROM Publica_Perda WHERE id_perda = $1', [req.params.id]);
        filename = result.rows[0]?.foto;
    } catch (error) {
        console.error('Erro ao buscar foto de animal perdido:', error);
        return res.status(500).json({ erro: 'Não foi possível carregar a foto.' });
    }
    // Só aceita nomes no formato gerado pelo servidor, o que impede sair da pasta privada.
    const match = photoName.exec(filename || '');
    if (!match) return res.status(404).json({ erro: 'Foto não encontrada.' });
    res.set({ 'Content-Type': contentTypes[match[1]], 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' });
    res.sendFile(filename, { root: uploads, dotfiles: 'deny', lastModified: false, etag: false }, error => {
        if (!error || res.headersSent) return;
        if (error.status === 404) return res.status(404).set('Content-Type', 'application/json').json({ erro: 'Foto não encontrada.' });
        console.error('Erro ao enviar foto de animal perdido:', error);
        res.status(500).set('Content-Type', 'application/json').json({ erro: 'Não foi possível carregar a foto.' });
    });
}

module.exports = { listar, buscar, criar, editar, alterarStatus, excluir, foto, validate, imageExtension, deletePhoto, validId, fields, uploads };
