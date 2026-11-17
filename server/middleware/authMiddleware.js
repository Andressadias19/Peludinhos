const jwt = require("jsonwebtoken");
const pool = require("../config/database");

async function autenticarToken(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({
            erro: "Token não fornecido."
        });
    }

    const partes = authHeader.split(" ");

    if (partes.length !== 2 || partes[0] !== "Bearer") {
        return res.status(401).json({
            erro: "Token inválido."
        });
    }

    const token = partes[1];
    let dados;

    try {
        dados = jwt.verify(
            token,
            process.env.JWT_SECRET
        );
    } catch (erro) {
        return res.status(401).json({
            erro: "Token inválido ou expirado."
        });
    }

    if (!/^[1-9]\d{0,18}$/.test(String(dados.id_usuario))) {
        return res.status(401).json({
            erro: "Token inválido."
        });
    }

    // a conta é conferida a cada requisição: um token emitido antes da desativação
    // (ou da exclusão) da conta deixa de valer imediatamente
    try {
        const resultado = await pool.query(
            "SELECT ativo FROM Usuario WHERE id_usuario = $1",
            [String(dados.id_usuario)]
        );

        if (resultado.rows.length === 0) {
            return res.status(401).json({
                erro: "Token inválido."
            });
        }

        // 403, como no login de conta desativada; o código permite ao frontend encerrar a sessão
        if (!resultado.rows[0].ativo) {
            return res.status(403).json({
                erro: "Esta conta está desativada.",
                codigo: "CONTA_DESATIVADA"
            });
        }

    } catch (erro) {
        console.error("Erro ao conferir a conta do token:", erro);

        return res.status(500).json({
            erro: "Erro interno do servidor."
        });
    }

    req.usuario = dados;

    next();
}

module.exports = autenticarToken;
