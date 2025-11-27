// backend/server.js
require('dotenv').config(); // Garante que as variáveis de ambiente carreguem
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Configurações e Rotas
const { setupDatabase } = require('./config/db');
const apiRoutes = require('./routes/api');
const backupService = require('./backupService'); // Opcional: Se quiser ativar backups

const app = express();
const PORT = process.env.PORT || 3000;

// --- AVISO DE SEGURANÇA JWT ---
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.includes('seu-segredo')) {
    console.warn("\n**********************************************************************************");
    console.warn("AVISO DE SEGURANÇA: A JWT_SECRET não foi alterada/configurada corretamente.");
    console.warn("Por favor, defina uma variável de ambiente segura.");
    console.warn("**********************************************************************************\n");
}

app.set('trust proxy', 1);

// --- MIDDLEWARES GLOBAIS ---
app.use(cors());
app.use(express.json());

// --- ARQUIVOS ESTÁTICOS ---
// Configuração para servir uploads (avatares, notas fiscais)
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
app.use('/public', express.static(publicDir));

// --- ROTAS DA API ---
app.use('/api', apiRoutes);

// --- TRATAMENTO DE ERROS GLOBAL ---
app.use((err, req, res, next) => {
    console.error('ERRO NO SERVIDOR:', err.stack);
    if (err.code === '23505') {
        return res.status(409).json({ message: `Conflito de dados: O registro já existe.` });
    }
    // Erro genérico para não vazar detalhes sensíveis
    res.status(500).json({ message: err.message || 'Ocorreu um erro interno no servidor.' });
});

// --- INICIALIZAÇÃO ---
setupDatabase().then(() => {
    // Inicia o agendamento de backups (se o arquivo backupService existir e tiver a função)
    if (backupService && typeof backupService.initScheduledBackups === 'function') {
        backupService.initScheduledBackups();
    }
    
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`✅ Servidor backend rodando na porta ${PORT}`);
    });
}).catch(error => {
    console.error("❌ Falha crítica ao iniciar o servidor.", error);
    process.exit(1);
});