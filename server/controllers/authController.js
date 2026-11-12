const pool = require("../config/database");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

async function login(req, res) {
    try {
        const { senha } = req.body || {};
        // mesma normalização do cadastro; contas antigas com maiúsculas também são encontradas
        const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";

        if (!email || !senha) {
            return res.status(400).json({
                erro: "Informe o e-mail e a senha."
            });
        }

        const resultado = await pool.query(
            `SELECT
                id_usuario,
                nome,
                email,
                senha_hash,
                telefone,
                tipo_usuario,
                foto_perfil,
                ativo
             FROM Usuario
             WHERE lower(email) = $1`,
            [email]
        );

        if (resultado.rows.length === 0) {
            return res.status(401).json({
                erro: "E-mail ou senha incorretos."
            });
        }

        const usuario = resultado.rows[0];

        if (!usuario.ativo) {
            return res.status(403).json({
                erro: "Esta conta está desativada."
            });
        }

        const senhaCorreta = await bcrypt.compare(
            senha,
            usuario.senha_hash
        );

        if (!senhaCorreta) {
            return res.status(401).json({
                erro: "E-mail ou senha incorretos."
            });
        }

        const token = jwt.sign(
    {
        id_usuario: usuario.id_usuario,
        tipo_usuario: usuario.tipo_usuario
    },
    process.env.JWT_SECRET,
    {
        expiresIn: "8h"
    }
);

        return res.status(200).json({
    mensagem: "Login realizado com sucesso!",
    token: token,
    usuario: {
        id_usuario: usuario.id_usuario,
        nome: usuario.nome,
        email: usuario.email,
        telefone: usuario.telefone,
        tipo_usuario: usuario.tipo_usuario,
        foto_perfil: usuario.foto_perfil
    }
});

    } catch (erro) {
        console.error("Erro ao realizar login:", erro);

        return res.status(500).json({
            erro: "Erro interno do servidor."
        });
    }
}

module.exports = {
    login
};