const jwt = require("jsonwebtoken");

function autenticarToken(req, res, next) {
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

    try {
        const dados = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        req.usuario = dados;

        next();

    } catch (erro) {
        return res.status(401).json({
            erro: "Token inválido ou expirado."
        });
    }
}

module.exports = autenticarToken;