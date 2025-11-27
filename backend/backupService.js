{
  "type": "uploaded file",
  "fileName": "backend/backupService.js",
  "fullContent":
// backend/backupService.js
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const cron = require('node-cron');

const BACKUP_DIR = path.join(__dirname, 'backups');

// Garante que a pasta de backups existe
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// Função para gerar o nome do arquivo: backup_YYYY-MM-DD_HH-mm-ss.sql
const getBackupFilename = () => {
    const now = new Date();
    const pad = (n) => (n < 10 ? '0' + n : n);
    const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const timeStr = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    return `backup_${dateStr}_${timeStr}.sql`;
};

// Função Realizar Backup
const performBackup = () => {
    return new Promise((resolve, reject) => {
        const fileName = getBackupFilename();
        const filePath = path.join(BACKUP_DIR, fileName);
        const dbUrl = process.env.DATABASE_URL;

        // Comando pg_dump (Requer postgresql-client instalado no container)
        // Usamos o formato URL para conexão simplificada
        const command = `pg_dump "${dbUrl}" -f "${filePath}"`;

        console.log(`Iniciando backup: ${fileName}...`);

        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Erro ao criar backup: ${error.message}`);
                return reject(error);
            }
            if (stderr) {
                // pg_dump as vezes escreve avisos no stderr, não necessariamente erro fatal
                console.log(`pg_dump stderr: ${stderr}`);
            }
            console.log(`Backup concluído com sucesso: ${fileName}`);
            resolve(fileName);
        });
    });
};

// Agendamento: Todo dia à meia-noite (00:00)
const initScheduledBackups = () => {
    cron.schedule('0 0 * * *', async () => {
        console.log('Executando backup automático agendado...');
        try {
            await performBackup();
        } catch (err) {
            console.error('Falha no backup automático:', err);
        }
    });
    console.log('Agendamento de backups diários (00:00) inicializado.');
};

// Listar Backups
const listBackups = () => {
    try {
        const files = fs.readdirSync(BACKUP_DIR)
            .filter(file => file.endsWith('.sql'))
            .map(file => {
                const stats = fs.statSync(path.join(BACKUP_DIR, file));
                return {
                    name: file,
                    size: (stats.size / 1024 / 1024).toFixed(2) + ' MB', // Tamanho em MB
                    date: stats.mtime
                };
            })
            .sort((a, b) => b.date - a.date); // Mais recentes primeiro
        return files;
    } catch (err) {
        console.error('Erro ao listar backups:', err);
        return [];
    }
};

// Caminho completo para download
const getBackupPath = (filename) => {
    const filePath = path.join(BACKUP_DIR, filename);
    if (fs.existsSync(filePath)) {
        return filePath;
    }
    return null;
};

module.exports = {
    performBackup,
    initScheduledBackups,
    listBackups,
    getBackupPath
};
}