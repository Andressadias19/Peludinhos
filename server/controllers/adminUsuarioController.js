const pool = require('../config/database');
// Mesmos campos editáveis e a mesma remoção de foto do perfil feito pelo próprio usuário.
const { CAMPOS_EDITAVEIS, apagarFotoAntiga } = require('./usuarioController');

const PAGE_SIZE = 20;
const fields = 'u.id_usuario, u.nome, u.email, u.telefone, u.foto_perfil, u.tipo_usuario, u.ativo, u.data_cadastro';

function validId(id) { return typeof id === 'string' && /^[1-9]\d{0,18}$/.test(id) && BigInt(id) <= 9223372036854775807n; }

// Todos os registros que apontam para o usuário. Os de validador também contam:
// as chaves com ON DELETE SET NULL apagariam quem validou, perdendo o histórico.
async function dependencies(db, id) {
    const result = await db.query(`SELECT
        (SELECT count(*) FROM Animal WHERE id_usuario_cadastrador = $1)::int AS animais_cadastrados,
        (SELECT count(*) FROM Animal WHERE id_usuario_validador = $1)::int AS animais_validados,
        (SELECT count(*) FROM Avistamento WHERE id_usuario_autor = $1)::int AS avistamentos,
        (SELECT count(*) FROM Publica_Perda WHERE id_usuario_tutor = $1)::int AS desaparecimentos,
        (SELECT count(*) FROM Solicitacao_Associacao_Avistamento WHERE id_usuario_solicitante = $1)::int AS solicitacoes_associacao,
        (SELECT count(*) FROM Solicitacao_Associacao_Avistamento WHERE id_usuario_validador = $1)::int AS associacoes_analisadas,
        (SELECT count(*) FROM Solicitacao_adocao WHERE id_usuario_solicitante = $1)::int AS solicitacoes_adocao,
        (SELECT count(*) FROM Solicitacao_adocao WHERE id_usuario_validador = $1)::int AS adocoes_analisadas,
        (SELECT count(*) FROM Noticia WHERE id_usuario_autor = $1)::int AS noticias`, [id]);
    return result.rows[0];
}
const total = deps => Object.values(deps).reduce((sum, value) => sum + value, 0);

// Contas administradoras só mudam de situação ou são excluídas pelo banco, como a promoção.
function protection(target, adminId) {
    if (String(target.id_usuario) === String(adminId)) return 'Você não pode desativar ou excluir a própria conta.';
    if (target.tipo_usuario === 'administrador') return 'Contas de administrador não podem ser desativadas ou excluídas pelo painel.';
    return null;
}

async function listar(req, res) {
    const { q = '', tipo = '', situacao = '', offset = '0' } = req.query;
    if (typeof q !== 'string' || q.length > 100) return res.status(400).json({ erro: 'Busca inválida (até 100 caracteres).' });
    if (!['', 'usuario', 'administrador'].includes(tipo)) return res.status(400).json({ erro: 'Tipo de usuário inválido.' });
    if (!['', 'ativo', 'inativo'].includes(situacao)) return res.status(400).json({ erro: 'Situação da conta inválida.' });
    if (typeof offset !== 'string' || !/^\d{1,7}$/.test(offset)) return res.status(400).json({ erro: 'Página inválida.' });
    const where = `($1 = '' OR position(lower($1) in lower(concat_ws(' ', u.id_usuario::text, u.nome, u.email, u.telefone))) > 0)
        AND ($2 = '' OR u.tipo_usuario = $2) AND ($3 = '' OR u.ativo = ($3 = 'ativo'))`;
    const values = [q.trim(), tipo, situacao];
    try {
        const count = await pool.query(`SELECT count(*)::int AS n FROM Usuario u WHERE ${where}`, values);
        const result = await pool.query(`SELECT ${fields} FROM Usuario u WHERE ${where}
            ORDER BY u.data_cadastro DESC NULLS LAST, u.id_usuario DESC LIMIT ${PAGE_SIZE} OFFSET $4`, [...values, Number(offset)]);
        return res.json({ usuarios: result.rows, total: count.rows[0].n, limite: PAGE_SIZE, offset: Number(offset) });
    } catch (error) {
        console.error('Erro ao listar usuários no painel:', error);
        return res.status(500).json({ erro: 'Não foi possível carregar os usuários.' });
    }
}

async function buscar(req, res) {
    if (!validId(req.params.id)) return res.status(400).json({ erro: 'Identificador de usuário inválido.' });
    try {
        const result = await pool.query(`SELECT ${fields} FROM Usuario u WHERE u.id_usuario = $1`, [req.params.id]);
        if (!result.rowCount) return res.status(404).json({ erro: 'Usuário não encontrado.' });
        const user = result.rows[0];
        const deps = await dependencies(pool, req.params.id);
        const blocked = protection(user, req.administrador.id_usuario);
        return res.json({
            usuario: user, dependencias: deps,
            eh_voce: String(user.id_usuario) === String(req.administrador.id_usuario),
            pode_alterar_situacao: !blocked, pode_excluir: !blocked && total(deps) === 0,
            motivo_bloqueio: blocked || (total(deps) ? 'Esta conta tem registros vinculados. Desative-a para preservar o histórico.' : null),
        });
    } catch (error) {
        console.error('Erro ao consultar usuário no painel:', error);
        return res.status(500).json({ erro: 'Não foi possível carregar o usuário.' });
    }
}

// Mesmas regras do PATCH /api/usuarios/me: só nome e telefone; tipo, situação, e-mail e senha são recusados.
async function editar(req, res) {
    if (!validId(req.params.id)) return res.status(400).json({ erro: 'Identificador de usuário inválido.' });
    const dados = req.body || {};
    const proibidos = Object.keys(dados).filter(campo => !CAMPOS_EDITAVEIS.includes(campo));
    if (proibidos.length) return res.status(400).json({ erro: `Campo(s) não permitido(s): ${proibidos.join(', ')}.` });
    if (!Object.keys(dados).length) return res.status(400).json({ erro: 'Nenhum dado para atualizar.' });
    const colunas = [];
    const valores = [];
    if (dados.nome !== undefined) {
        const nome = typeof dados.nome === 'string' ? dados.nome.trim() : '';
        if (nome.length < 3 || nome.length > 255) return res.status(400).json({ erro: 'Informe o nome completo.' });
        valores.push(nome); colunas.push(`nome = $${valores.length}`);
    }
    if (dados.telefone !== undefined) {
        const telefone = typeof dados.telefone === 'string' ? dados.telefone.replace(/\D/g, '') : '';
        if (telefone.length < 10 || telefone.length > 11) return res.status(400).json({ erro: 'Informe um celular válido com DDD.' });
        valores.push(telefone); colunas.push(`telefone = $${valores.length}`);
    }
    valores.push(req.params.id);
    try {
        const result = await pool.query(`UPDATE Usuario u SET ${colunas.join(', ')} WHERE u.id_usuario = $${valores.length} RETURNING ${fields}`, valores);
        if (!result.rowCount) return res.status(404).json({ erro: 'Usuário não encontrado.' });
        return res.json({ mensagem: 'Cadastro atualizado.', usuario: result.rows[0] });
    } catch (error) {
        console.error('Erro ao editar usuário pelo painel:', error);
        return res.status(500).json({ erro: 'Não foi possível atualizar o cadastro.' });
    }
}

async function alterarSituacao(req, res) {
    if (!validId(req.params.id)) return res.status(400).json({ erro: 'Identificador de usuário inválido.' });
    const ativo = req.body?.ativo;
    if (typeof ativo !== 'boolean') return res.status(400).json({ erro: 'Informe ativo como true ou false.' });
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        const current = await client.query('SELECT id_usuario, tipo_usuario FROM Usuario WHERE id_usuario = $1 FOR UPDATE', [req.params.id]);
        if (!current.rowCount) {
            await client.query('ROLLBACK');
            return res.status(404).json({ erro: 'Usuário não encontrado.' });
        }
        const blocked = protection(current.rows[0], req.administrador.id_usuario);
        if (blocked) {
            await client.query('ROLLBACK');
            return res.status(403).json({ erro: blocked });
        }
        const result = await client.query(`UPDATE Usuario u SET ativo = $1 WHERE u.id_usuario = $2 RETURNING ${fields}`, [ativo, req.params.id]);
        await client.query('COMMIT');
        return res.json({ mensagem: ativo ? 'Conta reativada.' : 'Conta desativada. As sessões abertas deixam de funcionar.', usuario: result.rows[0] });
    } catch (error) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        console.error('Erro ao alterar situação do usuário:', error);
        return res.status(500).json({ erro: 'Não foi possível alterar a situação da conta.' });
    } finally { client?.release(); }
}

async function excluir(req, res) {
    if (!validId(req.params.id)) return res.status(400).json({ erro: 'Identificador de usuário inválido.' });
    if (req.body?.confirmar !== true) return res.status(400).json({ erro: 'Confirme a exclusão enviando { "confirmar": true }.' });
    let client;
    let committed = false;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        // FOR UPDATE espera inserções em andamento que referenciam esta conta (elas travam a linha do usuário).
        const current = await client.query('SELECT id_usuario, tipo_usuario, foto_perfil FROM Usuario WHERE id_usuario = $1 FOR UPDATE', [req.params.id]);
        if (!current.rowCount) {
            await client.query('ROLLBACK');
            return res.status(404).json({ erro: 'Usuário não encontrado.' });
        }
        const blocked = protection(current.rows[0], req.administrador.id_usuario);
        if (blocked) {
            await client.query('ROLLBACK');
            return res.status(403).json({ erro: blocked });
        }
        const deps = await dependencies(client, req.params.id);
        if (total(deps)) {
            await client.query('ROLLBACK');
            return res.status(409).json({ erro: 'Esta conta tem registros vinculados e não pode ser excluída. Desative-a para preservar o histórico.', dependencias: deps });
        }
        await client.query('DELETE FROM Usuario WHERE id_usuario = $1', [req.params.id]);
        await client.query('COMMIT'); committed = true;
        // A foto de perfil só é apagada depois do COMMIT.
        apagarFotoAntiga(current.rows[0].foto_perfil);
        return res.json({ mensagem: 'Conta excluída.' });
    } catch (error) {
        if (client && !committed) await client.query('ROLLBACK').catch(() => {});
        if (error.code === '23503') return res.status(409).json({ erro: 'Esta conta recebeu um vínculo durante a exclusão e não pode ser excluída.' });
        console.error('Erro ao excluir usuário pelo painel:', error);
        return res.status(500).json({ erro: 'Não foi possível excluir a conta.' });
    } finally { client?.release(); }
}

module.exports = { listar, buscar, editar, alterarSituacao, excluir };
