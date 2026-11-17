const express = require("express");
const router = express.Router();

const {
    buscarAdministradorAtual,
    buscarResumo
} = require("../controllers/adminController");

const animais = require("../controllers/adminAnimalController");
const avistamentos = require("../controllers/adminAvistamentoController");
const { criar: registrarAvistamento } = require("../controllers/avistamentoController");
const desaparecimentos = require("../controllers/adminPerdaController");
const { criar: publicarDesaparecimento } = require("../controllers/perdaController");
const usuarios = require("../controllers/adminUsuarioController");
const validacoes = require("../controllers/adminValidacaoController");
const multer = require("multer");

const exigirAdministrador = require("../middleware/adminMiddleware");


// RECEBE O FORMULÁRIO DO ANIMAL COM ATÉ UMA FOTO (mesmos limites do cadastro comum)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 12, fieldSize: 10000, parts: 14 } });

function receberFoto(req, res, next) {
    upload.single("foto")(req, res, function (erro) {
        if (erro) {
            return res.status(erro.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({
                erro: erro.code === "LIMIT_FILE_SIZE" ? "A foto deve ter no máximo 5 MB." : "Não foi possível receber o cadastro."
            });
        }

        next();
    });
}


// TODAS AS ROTAS /api/admin EXIGEM TOKEN E CONTA ADMINISTRADORA ATIVA
router.use(exigirAdministrador);


// IDENTIFICAR O ADMINISTRADOR AUTENTICADO
router.get("/me", buscarAdministradorAtual);


// CONTAGENS DO DASHBOARD
router.get("/resumo", buscarResumo);


// GERENCIAMENTO DE ANIMAIS
router.get("/animais", animais.listar);
router.get("/animais/:id", animais.buscar);
router.post("/animais", receberFoto, animais.criar);
router.put("/animais/:id", receberFoto, animais.editar);
router.delete("/animais/:id", animais.excluir);


// GERENCIAMENTO DE AVISTAMENTOS
// o cadastro usa o mesmo registro dos usuários: o autor vem do token, que aqui é o do administrador
router.get("/avistamentos", avistamentos.listar);
router.get("/avistamentos/:id", avistamentos.buscar);
router.post("/avistamentos", receberFoto, registrarAvistamento);
router.put("/avistamentos/:id", receberFoto, avistamentos.editar);
router.delete("/avistamentos/:id", avistamentos.excluir);


// GERENCIAMENTO DE DESAPARECIMENTOS
// a publicação usa o mesmo cadastro dos tutores: o administrador vira o tutor e precisa ter telefone no perfil
router.get("/desaparecimentos", desaparecimentos.listar);
router.get("/desaparecimentos/:id", desaparecimentos.buscar);
router.post("/desaparecimentos", receberFoto, publicarDesaparecimento);
router.put("/desaparecimentos/:id", receberFoto, desaparecimentos.editar);
router.delete("/desaparecimentos/:id", desaparecimentos.excluir);


// GERENCIAMENTO DE USUÁRIOS
// tipo_usuario nunca muda por aqui: promover e rebaixar continua sendo feito no banco
router.get("/usuarios", usuarios.listar);
router.get("/usuarios/:id", usuarios.buscar);
router.patch("/usuarios/:id", usuarios.editar);
router.patch("/usuarios/:id/situacao", usuarios.alterarSituacao);
router.delete("/usuarios/:id", usuarios.excluir);


// VALIDAÇÕES: cadastros de animais e solicitações de associação de avistamentos
router.get("/validacoes/animais", validacoes.listarAnimais);
router.get("/validacoes/animais/:id", validacoes.buscarAnimal);
router.post("/validacoes/animais/:id/aprovar", validacoes.aprovarAnimal);
router.post("/validacoes/animais/:id/recusar", validacoes.recusarAnimal);
router.get("/validacoes/associacoes", validacoes.listarAssociacoes);
router.get("/validacoes/associacoes/:id", validacoes.buscarAssociacao);
router.post("/validacoes/associacoes/:id/aprovar", validacoes.aprovarAssociacao);
router.post("/validacoes/associacoes/:id/recusar", validacoes.recusarAssociacao);


module.exports = router;
