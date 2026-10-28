const express = require("express");
const cors = require("cors");
const path = require("path");
const pool = require("./config/database");
const usuarioRoutes = require("./routes/usuarioRoutes");
const authRoutes = require("./routes/authRoutes");
const autenticarToken = require("./middleware/authMiddleware");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());
app.use("/api/usuarios", usuarioRoutes);
app.use('/api/avistamentos', require('./routes/avistamentoRoutes'));
app.use('/api/perdidos', require('./routes/perdaRoutes'));

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

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
