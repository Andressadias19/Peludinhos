const pool = require("../config/database");
const autenticarToken = require("./authMiddleware");

// confere o papel no banco a cada requisição: o tipo_usuario do JWT pode ser
// de antes de a conta ser rebaixada ou desativada, e por isso é ignorado aqui
async function verificarAdministrador(req, res, next) {
    const idUsuario = req.usuario && req.usuario.id_usuario;

    if (!/^[1-9]\d{0,18}$/.test(String(idUsuario))) {
        return res.status(401).json({
            erro: "Token inválido."
        });
    }

    try {
        const resultado = await pool.query(
            "SELECT id_usuario, nome, tipo_usuario, ativo FROM Usuario WHERE id_usuario = $1",
            [String(idUsuario)]
        );

        // token assinado de uma conta que não existe mais: a sessão é inválida
        if (resultado.rows.length === 0) {
            return res.status(401).json({
                erro: "Token inválido."
            });
        }

        const usuario = resultado.rows[0];

        if (!usuario.ativo || usuario.tipo_usuario !== "administrador") {
            return res.status(403).json({
                erro: "Acesso restrito a administradores."
            });
        }

        req.administrador = {
            id_usuario: usuario.id_usuario,
            nome: usuario.nome,
            tipo_usuario: usuario.tipo_usuario
        };

        next();

    } catch (erro) {
        console.error("Erro ao verificar administrador:", erro);

        return res.status(500).json({
            erro: "Erro interno do servidor."
        });
    }
}

// exige token válido (401) e conta administradora ativa (403)
function exigirAdministrador(req, res, next) {
    autenticarToken(req, res, function () {
        verificarAdministrador(req, res, next);
    });
}

module.exports = exigirAdministrador;
