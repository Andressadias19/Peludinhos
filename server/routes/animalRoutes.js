const router = require('express').Router();
const authenticate = require('../middleware/authMiddleware');
const controller = require('../controllers/avistamentoController');
const animalController = require('../controllers/animalController');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 12, fieldSize: 10000, parts: 14 } });

router.use(authenticate);
router.get('/', controller.listarAnimais);
router.get('/:id/avistamentos', controller.historico);
router.get('/:id/editar', animalController.buscarParaEdicao);
router.put('/:id', (req, res, next) => {
    upload.single('foto')(req, res, error => {
        if (error) return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ erro: error.code === 'LIMIT_FILE_SIZE' ? 'A foto deve ter no máximo 5 MB.' : 'Não foi possível receber o cadastro.' });
        next();
    });
}, animalController.editar);
router.post('/', (req, res, next) => {
    upload.single('foto')(req, res, error => {
        if (error) return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ erro: error.code === 'LIMIT_FILE_SIZE' ? 'A foto deve ter no máximo 5 MB.' : 'Não foi possível receber o cadastro.' });
        next();
    });
}, animalController.criar);

module.exports = router;
