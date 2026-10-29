const pool = require('../config/database');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const uploads = path.join(__dirname, '..', 'uploads');
function validate(body) {
    const data = {};
    for (const [key, max] of Object.entries({ nome: 100, raca: 50, cor: 50, genero: 20 })) {
        if (body[key] !== undefined && typeof body[key] !== 'string') throw new Error(`Campo ${key} inválido.`);
        data[key] = body[key]?.trim() || null;
        if (data[key]?.includes('\0') || data[key]?.length > max) throw new Error(`Campo ${key} inválido (até ${max} caracteres).`);
    }
    if (!['Cachorro', 'Gato', 'Outro'].includes(body.especie)) throw new Error('Selecione a espécie do animal.');
    data.especie = body.especie;
    if (data.genero && !['Macho', 'Fêmea'].includes(data.genero)) throw new Error('Sexo do animal inválido.');
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
            (nome, especie, raca, cor, genero, foto, situacao, status_validacao, id_usuario_cadastrador)
            VALUES ($1,$2,$3,$4,$5,$6,'CADASTRADO','Pendente',$7)
            RETURNING id_animal, nome, especie, raca, cor, genero, foto, status_validacao`,
            [data.nome, data.especie, data.raca, data.cor, data.genero, photo, req.usuario.id_usuario]);
        await client.query('COMMIT'); committed = true;
        return res.status(201).json({ mensagem: 'Animal cadastrado. Validação pendente.', animal: result.rows[0] });
    } catch (error) {
        if (client && !committed) await client.query('ROLLBACK').catch(() => {});
        if (savedFile && !committed) await fs.unlink(savedFile).catch(() => {});
        console.error('Erro ao cadastrar animal:', error);
        return res.status(500).json({ erro: 'Não foi possível cadastrar o animal.' });
    } finally { client?.release(); }
}
module.exports = { criar };
