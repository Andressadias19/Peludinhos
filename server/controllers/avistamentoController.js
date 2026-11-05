const pool = require('../config/database');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const uploads = path.join(__dirname, '..', 'uploads');
const select = `SELECT v.id_avistamento, v.id_animal, v.latitude, v.longitude,
    v.data_hora, v.foto, v.observacao, v.nome_observado AS nome, v.especie_observada AS especie,
    v.raca_observada AS raca, v.cor_observada AS cor, v.genero_observado AS genero,
    v.estado_saude, a.situacao, a.status_validacao
    FROM Avistamento v LEFT JOIN Animal a ON a.id_animal = v.id_animal`;

function serialize(row) {
    return { ...row, latitude: Number(row.latitude), longitude: Number(row.longitude) };
}

function imageExtension(buffer) {
    if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
    if (buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'png';
    if (buffer.length > 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
    return null;
}

function validate(body) {
    const limits = { nome: 100, raca: 50, cor: 50, genero: 20, estado_saude: 1000, observacao: 300 };
    const data = {};
    for (const [key, max] of Object.entries(limits)) {
        if (body[key] !== undefined && typeof body[key] !== 'string') throw new Error(`Campo ${key} inválido.`);
        if (body[key]?.includes('\0')) throw new Error(`Campo ${key} inválido.`);
        data[key] = body[key]?.trim() || null;
        if (data[key]?.length > max) throw new Error(`O campo ${key} deve ter até ${max} caracteres.`);
    }
    if (body.id_animal !== undefined && !validId(body.id_animal)) throw new Error('Identificador de animal inválido.');
    data.id_animal = body.id_animal || null;
    if (!data.id_animal && !['Cachorro', 'Gato', 'Outro'].includes(body.especie)) throw new Error('Selecione a espécie do animal.');
    if (data.id_animal && ['nome', 'especie', 'raca', 'cor', 'genero'].some(key => body[key] !== undefined)) {
        throw new Error('Ao selecionar um animal, envie apenas os dados do avistamento.');
    }
    data.especie = body.especie;
    if (data.genero && !['Macho', 'Fêmea'].includes(data.genero)) throw new Error('Sexo do animal inválido.');
    for (const [key, max] of [['latitude', 90], ['longitude', 180]]) {
        if (typeof body[key] !== 'string' || !body[key].trim()) throw new Error('Marque a localização do avistamento.');
        data[key] = Number(body[key]);
        if (!Number.isFinite(data[key]) || Math.abs(data[key]) > max) throw new Error('Coordenadas de localização inválidas.');
    }
    return data;
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
        const author = await client.query('SELECT id_usuario FROM Usuario WHERE id_usuario = $1 AND ativo = TRUE', [req.usuario.id_usuario]);
        if (!author.rowCount) {
            await client.query('ROLLBACK');
            return res.status(403).json({ erro: 'Esta conta não está ativa.' });
        }
        const animalId = data.id_animal;
        if (animalId) {
            const existing = await client.query('SELECT id_animal, nome, especie, raca, cor, genero FROM Animal WHERE id_animal = $1 FOR SHARE', [animalId]);
            if (!existing.rowCount) {
                await client.query('ROLLBACK');
                return res.status(404).json({ erro: 'Animal não encontrado. Selecione outro cadastro.' });
            }
            // Preserva as características conhecidas na data da ocorrência, mesmo se o cadastro mudar depois.
            Object.assign(data, existing.rows[0]);
        }
        let photo = null;
        if (req.file) {
            const filename = `avistamento-${randomUUID()}.${extension}`;
            savedFile = path.join(uploads, filename);
            await fs.mkdir(uploads, { recursive: true });
            await fs.writeFile(savedFile, req.file.buffer, { flag: 'wx' });
            photo = `/uploads/${filename}`;
        }
        const sighting = await client.query(`INSERT INTO Avistamento
            (latitude, longitude, foto, observacao, id_animal, id_usuario_autor, estado_saude,
             nome_observado, especie_observada, raca_observada, cor_observada, genero_observado)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id_avistamento`,
            [data.latitude, data.longitude, photo, data.observacao, animalId, req.usuario.id_usuario, data.estado_saude,
                data.nome, data.especie, data.raca, data.cor, data.genero]);
        const result = await client.query(`${select} WHERE v.id_avistamento = $1`, [sighting.rows[0].id_avistamento]);
        await client.query('COMMIT');
        committed = true;
        return res.status(201).json({ mensagem: 'Avistamento registrado!', avistamento: serialize(result.rows[0]) });
    } catch (error) {
        if (client && !committed) await client.query('ROLLBACK').catch(() => {});
        if (savedFile && !committed) await fs.unlink(savedFile).catch(() => {});
        console.error('Erro ao registrar avistamento:', error);
        return res.status(500).json({ erro: 'Não foi possível registrar o avistamento. Tente novamente.' });
    } finally { client?.release(); }
}

async function listar(req, res) {
    const rawLimit = req.query.limit ?? '200';
    if (typeof rawLimit !== 'string' || !/^\d+$/.test(rawLimit) || Number(rawLimit) < 1 || Number(rawLimit) > 500) {
        return res.status(400).json({ erro: 'O limite deve estar entre 1 e 500.' });
    }
    try {
        const result = await pool.query(`${select} ORDER BY v.data_hora DESC, v.id_avistamento DESC LIMIT $1`, [Number(rawLimit)]);
        return res.json({ avistamentos: result.rows.map(serialize) });
    } catch (error) {
        console.error('Erro ao listar avistamentos:', error);
        return res.status(500).json({ erro: 'Não foi possível carregar os avistamentos.' });
    }
}

async function buscar(req, res) {
    if (!/^[1-9]\d{0,18}$/.test(req.params.id) || BigInt(req.params.id) > 9223372036854775807n) {
        return res.status(400).json({ erro: 'Identificador de avistamento inválido.' });
    }
    try {
        const result = await pool.query(`${select} WHERE v.id_avistamento = $1`, [req.params.id]);
        if (!result.rowCount) return res.status(404).json({ erro: 'Avistamento não encontrado.' });
        return res.json({ avistamento: serialize(result.rows[0]) });
    } catch (error) {
        console.error('Erro ao buscar avistamento:', error);
        return res.status(500).json({ erro: 'Não foi possível carregar este avistamento.' });
    }
}

function validId(id) {
    return typeof id === 'string' && /^[1-9]\d{0,18}$/.test(id) && BigInt(id) <= 9223372036854775807n;
}

async function listarAnimais(req, res) {
    const search = req.query.q ?? '';
    const species = req.query.especie ?? '';
    const offset = req.query.offset ?? '0';
    if (typeof search !== 'string' || search.length > 100) return res.status(400).json({ erro: 'Busca inválida (até 100 caracteres).' });
    if (!['', 'Cachorro', 'Gato', 'Outro'].includes(species) || typeof offset !== 'string' || !/^\d{1,7}$/.test(offset)) return res.status(400).json({ erro: 'Filtro ou página inválidos.' });
    try {
        // Busca literal; a seleção é sempre confirmada pela pessoa, nunca por semelhança automática.
        const result = await pool.query(`SELECT a.id_animal, a.nome, a.especie, a.raca, a.cor, a.genero, a.foto,
            a.idade_aproximada, a.caracteristicas, a.situacao, a.status_castracao, a.status_vacinacao,
            a.fonte_informacao, a.status_validacao, a.data_atualizacao,
            (SELECT count(*)::int FROM Avistamento v WHERE v.id_animal = a.id_animal) AS total_avistamentos
            FROM Animal a WHERE ($1 = '' OR position(lower($1) in lower(concat_ws(' ', a.id_animal::text, a.nome,
                a.especie, a.raca, a.cor, a.genero, a.caracteristicas, a.idade_aproximada, a.situacao))) > 0)
            AND ($2 = '' OR a.especie = $2)
            ORDER BY a.id_animal DESC LIMIT 51 OFFSET $3`, [search.trim(), species, Number(offset)]);
        return res.json({ animais: result.rows.slice(0, 50), has_more: result.rows.length > 50 });
    } catch (error) {
        console.error('Erro ao consultar animais:', error);
        return res.status(500).json({ erro: 'Não foi possível consultar os animais.' });
    }
}

async function historico(req, res) {
    if (!validId(req.params.id)) return res.status(400).json({ erro: 'Identificador de animal inválido.' });
    try {
        const animal = await pool.query(`SELECT id_animal, nome, especie, raca, cor, genero, foto,
            idade_aproximada, caracteristicas, situacao, status_castracao, status_vacinacao,
            fonte_informacao, status_validacao, data_atualizacao,
            (id_usuario_cadastrador = $2) AS eh_autor FROM Animal WHERE id_animal = $1`, [req.params.id, req.usuario.id_usuario]);
        if (!animal.rowCount) return res.status(404).json({ erro: 'Animal não encontrado.' });
        const result = await pool.query(`${select} WHERE v.id_animal = $1 ORDER BY v.data_hora DESC, v.id_avistamento DESC LIMIT 200`, [req.params.id]);
        return res.json({ animal: animal.rows[0], avistamentos: result.rows.map(serialize) });
    } catch (error) {
        console.error('Erro ao consultar histórico:', error);
        return res.status(500).json({ erro: 'Não foi possível carregar o histórico.' });
    }
}

module.exports = { criar, listar, buscar, listarAnimais, historico };
