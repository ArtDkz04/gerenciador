// backend/middleware/uploadMiddleware.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// --- Configuração de Diretórios ---
// Ajuste do caminho: sobe um nível (..) para sair de 'middleware' e acessar 'public'
const publicDir = path.join(__dirname, '../public');
const uploadsDir = path.join(publicDir, 'uploads');
const avatarsDir = path.join(uploadsDir, 'avatars');
const invoicesDir = path.join(uploadsDir, 'invoices');

// Garante que os diretórios existam
[publicDir, uploadsDir, avatarsDir, invoicesDir].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// --- Configuração Avatar ---
const avatarStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, avatarsDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        // req.user.user vem do token JWT decodificado no middleware de auth anterior
        const userPrefix = req.user ? req.user.user : 'user'; 
        cb(null, userPrefix + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const uploadAvatar = multer({ 
    storage: avatarStorage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif/;
        if (allowedTypes.test(file.mimetype) && allowedTypes.test(path.extname(file.originalname).toLowerCase())) {
            return cb(null, true);
        }
        cb(new Error('Apenas imagens (jpeg, png, gif) são permitidas!'));
    }
});

// --- Configuração Notas Fiscais (PDF) ---
const invoiceStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, invoicesDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const originalName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
        cb(null, `NF-${uniqueSuffix}-${originalName}`);
    }
});

const uploadInvoice = multer({
    storage: invoiceStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            return cb(null, true);
        }
        cb(new Error('Apenas arquivos PDF são permitidos!'));
    }
});

// --- Configuração CSV (Importação) ---
// Para CSVs temporários, podemos salvar na raiz de uploads ou numa pasta temp
const uploadCsv = multer({ dest: path.join(publicDir, 'uploads/') });

module.exports = { uploadAvatar, uploadInvoice, uploadCsv };