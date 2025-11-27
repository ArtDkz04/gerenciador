// backend/routes/api.js
const express = require('express');
const router = express.Router();

// Middlewares
const { protegerRotas, apenasAdmin } = require('../middleware/authMiddleware');
const { uploadAvatar, uploadInvoice, uploadCsv } = require('../middleware/uploadMiddleware');
const { loginLimiter } = require('../middleware/rateLimitMiddleware');

// Controllers
const authController = require('../controllers/authController');
const userController = require('../controllers/userController');
const dashboardController = require('../controllers/dashboardController');
const sectorController = require('../controllers/sectorController');
const patrimonioController = require('../controllers/patrimonioController');
const maintenanceController = require('../controllers/maintenanceController');

// --- ROTA PÚBLICA ---
router.post('/login', loginLimiter, authController.login);

// --- BARREIRA DE SEGURANÇA (Tudo abaixo requer Token) ---
router.use(protegerRotas);

// --- BUSCA SIMPLES (Acessível a todos os logados?) ---
// Se apenas admin puder buscar, adicione 'apenasAdmin' antes do controller
router.get('/simple-search', patrimonioController.simpleSearch);

// --- ROTAS ADMINISTRATIVAS ---

// Dashboard
router.get('/dashboard', apenasAdmin, dashboardController.getStats);
router.get('/dashboard/group-by', apenasAdmin, dashboardController.getChartsData);

// Setores
router.get('/setores', apenasAdmin, sectorController.getAllSectors);

// Usuários
router.get('/users', apenasAdmin, userController.getAllUsers);
router.post('/users', apenasAdmin, userController.createUser);
router.put('/users/:id', apenasAdmin, userController.updateUser);
router.delete('/users/:id', apenasAdmin, userController.deleteUser);
router.post('/user/avatar', apenasAdmin, uploadAvatar.single('avatar'), userController.updateAvatar);

// Patrimônio - Leitura e Auxiliares
router.get('/patrimonios', apenasAdmin, patrimonioController.getAll);
router.get('/patrimonios/next-tag', apenasAdmin, patrimonioController.getNextTag);
router.get('/patrimonios/:id/historico', apenasAdmin, patrimonioController.getHistory);
router.get('/patrimonio/tag/:tag', apenasAdmin, patrimonioController.getByTag);
router.get('/termo/responsavel/:nomeOuEmail', apenasAdmin, patrimonioController.searchByResponsible);

// Patrimônio - Escrita (CRUD)
router.post('/patrimonios', apenasAdmin, uploadInvoice.single('nota_fiscal_pdf'), patrimonioController.create);
router.post('/patrimonios/import', apenasAdmin, uploadCsv.single('csvfile'), patrimonioController.importCsv);
router.post('/patrimonios/bulk-update', apenasAdmin, patrimonioController.bulkUpdate);
router.post('/patrimonios/delete-lote', apenasAdmin, patrimonioController.bulkDelete);

// Note que usamos POST para update para manter compatibilidade com seu front/forms antigos,
// mas PATCH/PUT são semanticamente melhores. Mantive POST onde o original usava POST.
router.post('/patrimonios/:id', apenasAdmin, uploadInvoice.single('nota_fiscal_pdf'), patrimonioController.update);
router.patch('/patrimonios/:id', apenasAdmin, patrimonioController.quickUpdate);

// Manutenções
router.get('/patrimonios/:id/manutencoes', apenasAdmin, maintenanceController.getByPatrimonio);
router.post('/patrimonios/:id/manutencoes', apenasAdmin, maintenanceController.create);
router.put('/manutencoes/:manutencao_id', apenasAdmin, maintenanceController.update);
router.delete('/manutencoes/:manutencao_id', apenasAdmin, maintenanceController.delete);

module.exports = router;