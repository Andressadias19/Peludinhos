const router = require('express').Router();
const multer = require('multer');
const authenticate = require('../middleware/authMiddleware');
const controller = require('../controllers/avistamentoController');
const associacaoController = require('../controllers/associacaoAvistamentoController');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 12, fieldSize: 10000, parts: 14 } });
router.use(authenticate);
router.get('/', controller.listar);
router.get('/:id', controller.buscar);
router.post('/:id/solicitacoes-associacao', associacaoController.solicitar);
router.post('/', (req, res, next) => {
    upload.single('foto')(req, res, error => {
        if (error) return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({
            erro: error.code === 'LIMIT_FILE_SIZE' ? 'A foto deve ter no máximo 5 MB.' : 'Não foi possível receber a foto e os dados. Envie apenas uma imagem.',
        });
        next();
    });
}, controller.criar);

module.exports = router;
