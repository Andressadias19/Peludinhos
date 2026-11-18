const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const pool = require("./config/database");
const usuarioRoutes = require("./routes/usuarioRoutes");
const authRoutes = require("./routes/authRoutes");
const { opcoesCors, ORIGENS_LOCAIS_PADRAO } = require("./config/serverConfig");
const { armazenamento } = require("./storage");

const PASTA_FRONTEND_PADRAO = path.join(__dirname, "..", "dist");


// MONTA A APLICAÇÃO EXPRESS
// servirFrontend=false: só a API e as fotos (não usa dist, Vite nem o frontend compilado)
// servirFrontend=true: também entrega o frontend compilado e as rotas da SPA, como antes
function criarApp({ servirFrontend = false, origensCors = ORIGENS_LOCAIS_PADRAO, pastaFrontend = PASTA_FRONTEND_PADRAO, diagnosticoBanco = false } = {}) {
    const app = express();

    // não anuncia a tecnologia do servidor no cabeçalho X-Powered-By
    app.disable("x-powered-by");

    // também responde ao preflight (OPTIONS) das origens permitidas
    app.use(cors(opcoesCors(origensCors)));
    app.use(express.json());
    app.use("/api/usuarios", usuarioRoutes);
    app.use('/api/avistamentos', require('./routes/avistamentoRoutes'));
    app.use('/api/animais', require('./routes/animalRoutes'));
    app.use('/api/perdidos', require('./routes/perdaRoutes'));
    app.use("/api/admin", require("./routes/adminRoutes"));

    // fotos públicas (animais, avistamentos e desaparecimentos; ex.: http://localhost:3001/uploads/animal-<uuid>.png)
    // entregues pela camada de armazenamento (STORAGE_DRIVER); a área privada nunca passa por aqui.
    // Fotos de perfil (usuario-*) são privadas: nunca saem por /uploads, nem as antigas que ficaram na área pública;
    // só por GET /api/usuarios/:id/foto, com login.
    app.use("/uploads", (req, res, next) => (/^\/usuario-/i.test(req.path) ? res.status(404).json({ erro: "Arquivo não encontrado." }) : next()));
    app.use("/uploads", armazenamento.middlewarePublico());
    app.use("/uploads", (req, res) => res.status(404).json({ erro: "Arquivo não encontrado." }));
    app.use("/api", authRoutes);

    app.get("/api", (req, res) => {
        res.json({
            mensagem: "API do Peludinhos funcionando!"
        });
    });

    // diagnóstico do banco, sem login: só com DIAGNOSTICO_BANCO=true (desligado, cai no 404 abaixo)
    if (diagnosticoBanco) app.get("/api/teste-banco", async (req, res) => {
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

    if (servirFrontend) {
        const indexHtml = path.join(pastaFrontend, "index.html");
        const frontendCompilado = fs.existsSync(indexHtml);

        if (!frontendCompilado) {
            console.warn(`SERVE_FRONTEND está ativo, mas ${indexHtml} não existe. Execute npm run build; até lá, as páginas respondem 503.`);
        }

        app.use(express.static(pastaFrontend));
        // React Router resolve as páginas, inclusive ao atualizar uma URL interna.
        app.get('/{*path}', (req, res) => {
            if (path.extname(req.path) && !req.path.endsWith('.html')) {
                return res.status(404).send('Arquivo não encontrado.');
            }
            if (!frontendCompilado) {
                return res.status(503).json({ erro: 'O frontend ainda não foi compilado.' });
            }
            res.sendFile(indexHtml);
        });
    }

    // qualquer outro endereço ou método: 404 em JSON (no modo só API, inclusive "/" e as páginas do React)
    app.use((req, res) => res.status(404).json({ erro: "Recurso não encontrado." }));

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

    return app;
}


module.exports = criarApp;
