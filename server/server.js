const express = require("express");
const cors = require("cors");
const path = require("path");
const pool = require("./config/database");
const usuarioRoutes = require("./routes/usuarioRoutes");
const authRoutes = require("./routes/authRoutes");
const autenticarToken = require("./middleware/authMiddleware");
require("dotenv").config();

const app = express();

// não anuncia a tecnologia do servidor no cabeçalho X-Powered-By
app.disable("x-powered-by");

app.use(cors());
app.use(express.json());
app.use("/api/usuarios", usuarioRoutes);
app.use('/api/avistamentos', require('./routes/avistamentoRoutes'));
app.use('/api/animais', require('./routes/animalRoutes'));
app.use('/api/perdidos', require('./routes/perdaRoutes'));
app.use("/api/admin", require("./routes/adminRoutes"));

// fotos de perfil enviadas pelos usuários (ex.: http://localhost:3000/uploads/usuario-1-123.jpg)
app.use("/uploads", express.static(path.join(__dirname, "uploads"), {
    setHeaders: function (res) {
        res.setHeader("X-Content-Type-Options", "nosniff");
    }
}));
app.use("/api", authRoutes);

app.get("/api", (req, res) => {
    res.json({
        mensagem: "API do Peludinhos funcionando!"
    });
});

const PORT = process.env.PORT || 3001;

app.get("/api/teste-banco", async (req, res) => {
    try {
        const resultado = await pool.query("SELECT NOW()");

        res.json({
            mensagem: "PostgreSQL conectado!",
            horarioBanco: resultado.rows[0].now
        });
    } catch (erro) {
        console.error(erro);

        res.status(500).json({
            erro: "Erro ao conectar com PostgreSQL."
        });
    }
});

app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota da API não encontrada.' }));
app.use(express.static(path.join(__dirname, '..', 'dist')));
// React Router resolve as páginas, inclusive ao atualizar uma URL interna.
app.get('/{*path}', (req, res) => {
    if (path.extname(req.path) && !req.path.endsWith('.html')) {
        return res.status(404).send('Arquivo não encontrado.');
    }
    res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
});

// TRATAMENTO GLOBAL DE ERROS
// recebe o que as rotas não trataram (ex.: JSON malformado) e responde sempre em JSON,
// sem stack trace, caminhos do computador ou nomes de bibliotecas; o detalhe fica só no log
app.use(function (erro, req, res, next) {
    if (res.headersSent) {
        return next(erro);
    }

    if (erro.type === "entity.parse.failed") {
        return res.status(400).json({
            erro: "O corpo da requisição não é um JSON válido."
        });
    }

    if (erro.type === "entity.too.large") {
        return res.status(413).json({
            erro: "O corpo da requisição é grande demais."
        });
    }

    // outros erros 4xx do Express (ex.: endereço malformado) mantêm o código, com mensagem genérica
    if (erro.status >= 400 && erro.status < 500) {
        return res.status(erro.status).json({
            erro: "Requisição inválida."
        });
    }

    console.error("Erro inesperado:", erro);

    return res.status(500).json({
        erro: "Erro interno do servidor."
    });
});

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
