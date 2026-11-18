const express = require("express");
const router = express.Router();

const {
    cadastrarUsuario,
    buscarMeuPerfil,
    atualizarMeuPerfil,
    alterarMinhaSenha,
    atualizarMinhaFoto,
    removerMinhaFoto,
    buscarFotoDeUsuario
} = require("../controllers/usuarioController");

const autenticarToken = require("../middleware/authMiddleware");


// LÊ O ARQUIVO DA IMAGEM ENVIADO NO CORPO DA REQUISIÇÃO (máx. 5 MB)
const lerImagem = express.raw({
    type: ["image/jpeg", "image/png", "image/webp"],
    limit: "5mb"
});

function receberImagem(req, res, next) {
    lerImagem(req, res, function (erro) {
        if (erro) {
            return res.status(erro.status === 413 ? 413 : 400).json({
                erro: erro.status === 413
                    ? "A imagem deve ter no máximo 5 MB."
                    : "Não foi possível ler a imagem enviada."
            });
        }

        next();
    });
}


// CADASTRAR NOVO USUÁRIO
router.post("/", cadastrarUsuario);


// BUSCAR PERFIL DO USUÁRIO LOGADO
router.get("/me", autenticarToken, buscarMeuPerfil);


// ATUALIZAR PERFIL DO USUÁRIO LOGADO (nome e telefone)
router.patch("/me", autenticarToken, atualizarMeuPerfil);


// ALTERAR SENHA DO USUÁRIO LOGADO
router.patch("/me/senha", autenticarToken, alterarMinhaSenha);


// FOTO DE PERFIL (privada): a própria ou, para administradores, a de qualquer conta
router.get("/:id/foto", autenticarToken, buscarFotoDeUsuario);


// ENVIAR / TROCAR E REMOVER FOTO DO USUÁRIO LOGADO
router.put("/me/foto", autenticarToken, receberImagem, atualizarMinhaFoto);
router.delete("/me/foto", autenticarToken, removerMinhaFoto);


module.exports = router;