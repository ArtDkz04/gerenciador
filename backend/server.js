// backend/server.js
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { exec } = require('child_process');
const cron = require('node-cron');

// --- SETUP INICIAL ---
const app = express();
app.set('trust proxy', 1); 
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET.includes('seu-segredo')) {
    console.warn("\n**********************************************************************************");
    console.warn("AVISO DE SEGURANÇA: A JWT_SECRET não foi alterada no docker-compose.yml.");
    console.warn("Por favor, substitua 'seu-segredo-super-longo-e-aleatorio-aqui' por um valor seguro.");
    console.warn("**********************************************************************************\n");
}

// --- CONFIGURAÇÃO DE DIRETÓRIOS E MIDDLEWARES ---
const publicDir = path.join(__dirname, 'public');
const uploadsDir = path.join(publicDir, 'uploads');
const avatarsDir = path.join(uploadsDir, 'avatars');
const invoicesDir = path.join(uploadsDir, 'invoices'); 
const backupsDir = path.join(__dirname, 'backups'); // Pasta de backups

// Criação recursiva de diretórios
[publicDir, uploadsDir, avatarsDir, invoicesDir, backupsDir].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

app.use('/public', express.static(publicDir));
app.use(cors());
app.use(express.json());

// --- CONFIGURAÇÃO DO MULTER (UPLOAD DE ARQUIVOS) ---
const avatarStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, avatarsDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, req.user.user + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const uploadAvatar = multer({ 
    storage: avatarStorage,
    limits: { fileSize: 2 * 1024 * 1024 }, // Limite de 2MB
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif/;
        if (allowedTypes.test(file.mimetype) && allowedTypes.test(path.extname(file.originalname).toLowerCase())) {
            return cb(null, true);
        }
        cb(new Error('Apenas imagens (jpeg, png, gif) são permitidas!'));
    }
});

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
    limits: { fileSize: 10 * 1024 * 1024 }, // Limite de 10MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            return cb(null, true);
        }
        cb(new Error('Apenas arquivos PDF são permitidos!'));
    }
});

// Configuração para Upload de Backups
const backupStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, backupsDir),
    filename: (req, file, cb) => {
        // Sanitiza o nome para evitar caracteres perigosos, mas mantém a extensão
        const uniqueSuffix = Date.now();
        // Preserva o nome original se for um upload, mas garante segurança
        const sanitized = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        cb(null, sanitized);
    }
});
const uploadBackupFile = multer({
    storage: backupStorage,
    limits: { fileSize: 200 * 1024 * 1024 }, // Aumentado para 200MB
    fileFilter: (req, file, cb) => {
        // Aceita .bz2 (padrão do sistema) ou .sql (caso venha descompactado)
        if (file.originalname.endsWith('.bz2') || file.originalname.endsWith('.sql')) {
            return cb(null, true);
        }
        cb(new Error('Apenas arquivos de backup (.bz2 ou .sql) são permitidos!'));
    }
});

const uploadCsv = multer({ dest: 'uploads/' });

// --- LÓGICA DO BANCO DE DADOS ---
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.on('connect', () => console.log('Backend conectado ao banco de dados PostgreSQL!'));
pool.on('error', (err) => { console.error('Erro no pool do banco de dados', err); process.exit(-1); });

const setupDatabase = async () => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        await client.query(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id SERIAL PRIMARY KEY, 
                username TEXT NOT NULL UNIQUE, 
                password_hash TEXT NOT NULL, 
                role TEXT NOT NULL CHECK (role IN ('admin', 'user')), 
                profile_image_url TEXT NOT NULL DEFAULT '/public/usuario.png'
            );
        `);
        
        await client.query(`UPDATE usuarios SET profile_image_url = '/public/usuario.png' WHERE profile_image_url IS NULL;`);

        await client.query(`CREATE TABLE IF NOT EXISTS setores (id SERIAL PRIMARY KEY, nome TEXT NOT NULL);`);
        await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_setores_nome_lower ON setores (LOWER(nome));`);
        
        await client.query(`
            CREATE TABLE IF NOT EXISTS patrimonio (
                id SERIAL PRIMARY KEY, 
                nome TEXT, 
                patrimonio TEXT NOT NULL UNIQUE, 
                setor_id INTEGER REFERENCES setores(id) ON DELETE SET NULL, 
                responsavel_nome TEXT, 
                responsavel_email TEXT, 
                valor_unitario NUMERIC(12, 2) DEFAULT 0, 
                nota_fiscal TEXT, 
                nota_fiscal_url TEXT,
                cadastrado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, 
                atualizado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, 
                marca TEXT, 
                modelo TEXT, 
                numero_serie TEXT, 
                data_aquisicao TEXT, 
                fornecedor TEXT, 
                garantia TEXT, 
                status TEXT, 
                observacao TEXT
            );
        `);
        
        const columns = await client.query(`
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'patrimonio' AND column_name = 'nota_fiscal_url'
        `);
        if (columns.rowCount === 0) {
            await client.query('ALTER TABLE patrimonio ADD COLUMN nota_fiscal_url TEXT;');
        }

        await client.query(`CREATE TABLE IF NOT EXISTS historico (id SERIAL PRIMARY KEY, patrimonio_id INTEGER REFERENCES patrimonio(id) ON DELETE CASCADE, acao TEXT NOT NULL, detalhes TEXT, utilizador TEXT, timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);`);
        
        await client.query(`
            CREATE TABLE IF NOT EXISTS manutencoes (
                id SERIAL PRIMARY KEY,
                patrimonio_id INTEGER NOT NULL REFERENCES patrimonio(id) ON DELETE CASCADE,
                data_envio TIMESTAMPTZ NOT NULL,
                data_retorno TIMESTAMPTZ,
                problema_relatado TEXT NOT NULL,
                fornecedor_servico TEXT,
                custo NUMERIC(10, 2),
                status_manutencao TEXT NOT NULL,
                observacoes TEXT,
                criado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        `);

        const { rows } = await client.query('SELECT COUNT(*) FROM setores');
        if (rows[0].count === '0') {
            const setoresIniciais = ['Desenvolvimento', 'Suporte', 'Administrativo', 'Infraestrutura', 'Estoque', 'Comercial', 'Marketing', 'Implantação', 'WeWork'];
            await Promise.all(setoresIniciais.map(setor => client.query('INSERT INTO setores (nome) VALUES ($1) ON CONFLICT (LOWER(nome)) DO NOTHING', [setor])));
        }
        
        await client.query('COMMIT');
        console.log("Estrutura do banco de dados pronta.");
    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Erro no setup do banco de dados:", error);
        throw error;
    } finally {
        client.release();
    }
};

// --- FUNÇÕES UTILITÁRIAS ---
function parseCurrency(currencyString) {
    if (!currencyString || typeof currencyString !== 'string') return 0;
    let cleanString = currencyString.replace('R$', '').trim();
    if (cleanString.includes(',') && cleanString.lastIndexOf(',') > cleanString.lastIndexOf('.')) {
        cleanString = cleanString.replace(/\./g, '').replace(',', '.');
    } else {
        cleanString = cleanString.replace(/,/g, '');
    }
    const numericValue = parseFloat(cleanString);
    return isNaN(numericValue) ? 0 : numericValue;
}

const buildWhereClause = (queryParams) => {
    const { search, tipo, termo } = queryParams;
    let whereClauses = [], queryValues = [], valueIndex = 1;

    if (tipo && termo) {
        const fieldMap = { patrimonio: 'p.patrimonio', tipo_item: 'p.nome', responsavel: 'p.responsavel_nome', setor: 's.nome' };
        if (fieldMap[tipo]) {
            whereClauses.push(`${fieldMap[tipo]} ILIKE $${valueIndex++}`);
            queryValues.push(`%${termo}%`);
        }
    } else if (search) {
        whereClauses.push(`(p.nome ILIKE $1 OR p.patrimonio ILIKE $1 OR s.nome ILIKE $1 OR p.responsavel_nome ILIKE $1)`);
        queryValues.push(`%${search}%`);
    }
    return { whereClause: whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '', queryValues, valueIndex: queryValues.length + 1 };
};

const generateChangeDetails = (oldData, newData, setorMap) => {
    const changes = [];
    const fieldLabels = {
        nome: 'Item', patrimonio: 'Patrimônio', setor_id: 'Setor', responsavel_nome: 'Responsável',
        responsavel_email: 'E-mail do Responsável', valor_unitario: 'Valor', marca: 'Marca', modelo: 'Modelo',
        numero_serie: 'N° de Série', data_aquisicao: 'Data de Aquisição', fornecedor: 'Fornecedor',
        garantia: 'Garantia', status: 'Status', observacao: 'Observação'
    };

    for (const key in fieldLabels) {
        const oldValue = oldData[key] || '';
        const newValue = newData[key] || '';

        if (String(oldValue).trim() !== String(newValue).trim()) {
            let from = oldValue;
            let to = newValue;

            if (key === 'setor_id') {
                from = setorMap[oldValue] || `ID ${oldValue}`;
                to = setorMap[newValue] || `ID ${newValue}`;
            } else if (key === 'valor_unitario') {
                from = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(oldValue || 0);
                to = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(newValue || 0);
            }
            
            changes.push(`${fieldLabels[key]}: de "${from}" para "${to}"`);
        }
    }
    return changes.length > 0 ? changes.join('; ') : 'Nenhuma alteração de dados detectada.';
};


// --- MIDDLEWARES E ROTAS DE AUTENTICAÇÃO ---
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: 'Muitas tentativas de login. Tente novamente em 15 minutos.' });

app.post('/api/login', loginLimiter, async (req, res, next) => {
    const { user, password } = req.body;
    if (!user || !password) return res.status(400).json({ message: 'Utilizador e senha são obrigatórios.' });
    try {
        const result = await pool.query('SELECT id, username, role, password_hash, profile_image_url FROM usuarios WHERE username = $1', [user]);
        const userData = result.rows[0];
        if (!userData || !await bcrypt.compare(password, userData.password_hash)) {
            return res.status(401).json({ message: 'Utilizador ou senha inválidos.' });
        }
        const token = jwt.sign({ userId: userData.id, user: userData.username, role: userData.role }, JWT_SECRET, { expiresIn: '8h' });
        res.json({ success: true, token, role: userData.role, user: userData.username, avatar: userData.profile_image_url });
    } catch (error) { next(error); }
});

const protegerRotas = (req, res, next) => {
    const token = (req.headers['authorization'] || '').split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Acesso não autorizado. Token ausente.' });
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(403).json({ message: 'Token inválido ou expirado.' });
        req.user = decoded;
        next();
    });
};
app.use('/api', protegerRotas);

const apenasAdmin = (req, res, next) => {
    if (req.user?.role === 'admin') next();
    else res.status(403).json({ message: 'Acesso negado. Permissão de administrador necessária.' });
};

// ==========================================
// ROTAS DE BACKUP (MODIFICADO PARA SUPORTE TOTAL)
// ==========================================

const performBackup = () => {
    return new Promise((resolve, reject) => {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `backup-${timestamp}.sql.bz2`;
        const filepath = path.join(backupsDir, filename);

        // ALTERAÇÃO IMPORTANTE: Adicionado --clean --if-exists
        // Isso garante que ao restaurar, ele limpe o banco antes de inserir os dados.
        // Isso preserva a integridade e evita erros de duplicação.
        const command = `pg_dump -h ${process.env.DB_HOST} -U ${process.env.DB_USER} --clean --if-exists ${process.env.POSTGRES_DB} | bzip2 > "${filepath}"`;

        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Erro ao fazer backup: ${error.message}`);
                return reject(error);
            }
            // pg_dump pode escrever avisos no stderr, isso não é necessariamente erro fatal
            if (stderr) console.log(`Log backup (stderr): ${stderr}`);
            
            resolve({ 
                filename, 
                size: fs.existsSync(filepath) ? fs.statSync(filepath).size : 0, 
                date: new Date() 
            });
        });
    });
};

// Agendamento: Todo dia às 00:00 (Meia-noite)
cron.schedule('0 0 * * *', async () => {
    console.log('--- Iniciando backup automático agendado ---');
    try {
        await performBackup();
        console.log('--- Backup automático concluído com sucesso ---');
    } catch (e) {
        console.error('--- Falha no backup automático ---', e);
    }
});

// Gerar backup manual
app.post('/api/backups', apenasAdmin, async (req, res, next) => {
    try {
        const result = await performBackup();
        res.json({ success: true, message: 'Backup completo criado com sucesso.', data: result });
    } catch (e) {
        res.status(500).json({ message: 'Erro ao criar backup.' });
    }
});

// Listar backups
app.get('/api/backups', apenasAdmin, (req, res) => {
    try {
        const files = fs.readdirSync(backupsDir)
            .filter(file => file.endsWith('.bz2') || file.endsWith('.sql'))
            .map(file => {
                const stats = fs.statSync(path.join(backupsDir, file));
                return {
                    name: file,
                    size: stats.size,
                    created_at: stats.birthtime
                };
            })
            .sort((a, b) => b.created_at - a.created_at); // Mais recentes primeiro
        res.json({ success: true, files });
    } catch (e) {
        res.status(500).json({ message: 'Erro ao listar backups.' });
    }
});

// Download de backup
app.get('/api/backups/:filename', apenasAdmin, (req, res) => {
    const filename = req.params.filename;
    // Validação de segurança básica para evitar path traversal
    if (filename.includes('..') || (!filename.endsWith('.bz2') && !filename.endsWith('.sql'))) {
        return res.status(400).json({ message: 'Nome de arquivo inválido.' });
    }
    
    const filepath = path.join(backupsDir, filename);
    if (!fs.existsSync(filepath)) return res.status(404).json({ message: 'Arquivo não encontrado.' });
    
    res.download(filepath);
});

// Excluir backup
app.delete('/api/backups/:filename', apenasAdmin, (req, res) => {
    const filename = req.params.filename;
    if (filename.includes('..') || (!filename.endsWith('.bz2') && !filename.endsWith('.sql'))) {
        return res.status(400).json({ message: 'Nome de arquivo inválido.' });
    }

    const filepath = path.join(backupsDir, filename);
    if (!fs.existsSync(filepath)) return res.status(404).json({ message: 'Arquivo não encontrado.' });
    
    try {
        fs.unlinkSync(filepath);
        res.json({ success: true, message: 'Backup excluído com sucesso.' });
    } catch (e) {
        res.status(500).json({ message: 'Erro ao excluir arquivo.' });
    }
});

// Importar (Upload) Backup Externo
// Esta rota salva o arquivo na pasta de backups. O usuário deve então chamar /restore.
app.post('/api/backups/import', apenasAdmin, uploadBackupFile.single('backup'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'Nenhum arquivo enviado.' });
    }
    res.json({ success: true, message: 'Backup importado com sucesso! Clique em "Restaurar" na lista para aplicá-lo.' });
});

// Restaurar Backup
app.post('/api/backups/:filename/restore', apenasAdmin, async (req, res) => {
    const filename = req.params.filename;
    if (filename.includes('..')) return res.status(400).json({ message: 'Arquivo inválido.' });
    
    const filepath = path.join(backupsDir, filename);
    if (!fs.existsSync(filepath)) return res.status(404).json({ message: 'Backup não encontrado.' });

    try {
        // 1. Derrubar conexões existentes para permitir o drop/restore
        // Isso é crucial para que o script --clean funcione
        await pool.query(`
            SELECT pg_terminate_backend(pg_stat_activity.pid)
            FROM pg_stat_activity
            WHERE pg_stat_activity.datname = $1
            AND pid <> pg_backend_pid();
        `, [process.env.POSTGRES_DB]);

        // 2. Montar comando de restore
        let command = '';
        const dbCreds = `-h ${process.env.DB_HOST} -U ${process.env.DB_USER} -d ${process.env.POSTGRES_DB}`;
        
        if (filename.endsWith('.bz2')) {
            command = `bunzip2 -c "${filepath}" | psql ${dbCreds}`;
        } else {
            command = `psql ${dbCreds} < "${filepath}"`;
        }

        console.log(`Iniciando restauração do arquivo: ${filename}`);

        // 3. Executar
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error('Erro no restore:', stderr);
                return res.status(500).json({ message: 'Falha ao restaurar banco de dados. Verifique os logs.' });
            }
            console.log('Restauração concluída.');
            res.json({ success: true, message: 'Sistema restaurado completamente! Por favor, faça login novamente.' });
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Erro interno ao preparar restauração.' });
    }
});

// ==========================================
// ROTAS DE PATRIMÔNIO E GESTÃO
// ==========================================

app.get('/api/simple-search', async (req, res, next) => {
    const { tipo, termo } = req.query;
    if (!tipo || !termo) return res.status(400).json({ message: 'Tipo e termo da pesquisa são obrigatórios.' });
    const fieldMap = { responsavel: 'p.responsavel_nome', item: 'p.nome', patrimonio: 'p.patrimonio' };
    if (!fieldMap[tipo]) return res.status(400).json({ message: 'Tipo de pesquisa inválido.' });
    try {
        const query = `SELECT p.nome as item, p.responsavel_nome as responsavel, s.nome as setor FROM patrimonio p LEFT JOIN setores s ON p.setor_id = s.id WHERE ${fieldMap[tipo]} ILIKE $1 ORDER BY p.id DESC`;
        const { rows } = await pool.query(query, [`%${termo}%`]);
        res.json({ success: true, items: rows });
    } catch (error) { next(error); }
});

app.post('/api/user/avatar', apenasAdmin, uploadAvatar.single('avatar'), async (req, res, next) => {
    if (!req.file) return res.status(400).json({ message: 'Nenhum arquivo de imagem enviado.' });
    try {
        const imageUrl = `/public/uploads/avatars/${req.file.filename}`;
        await pool.query('UPDATE usuarios SET profile_image_url = $1 WHERE username = $2', [imageUrl, req.user.user]);
        res.json({ success: true, message: 'Avatar atualizado com sucesso!', avatarUrl: imageUrl });
    } catch (error) { next(error); }
});

app.get('/api/dashboard', apenasAdmin, async (req, res, next) => { try { const [items, valor] = await Promise.all([pool.query('SELECT COUNT(id) FROM patrimonio'), pool.query('SELECT SUM(valor_unitario) FROM patrimonio')]); res.json({ success: true, totalItems: parseInt(items.rows[0].count, 10), totalValor: parseFloat(valor.rows[0].sum) || 0 }); } catch (e) { next(e); }});
app.get('/api/dashboard/group-by', apenasAdmin, async (req, res, next) => {
    const fieldMap = { setor: `SELECT s.nome as label, COUNT(p.id)::int as value FROM patrimonio p JOIN setores s ON p.setor_id = s.id GROUP BY s.nome ORDER BY value DESC LIMIT 10;`, nome: `SELECT p.nome as label, COUNT(p.id)::int as value FROM patrimonio p GROUP BY p.nome ORDER BY value DESC LIMIT 10;`, valor_por_nome: `SELECT p.nome as label, SUM(p.valor_unitario) as value FROM patrimonio p WHERE p.valor_unitario > 0 GROUP BY p.nome ORDER BY value DESC LIMIT 10;` };
    if (!fieldMap[req.query.field]) return res.status(400).json({ message: 'Campo de agrupamento inválido.' });
    try { const { rows } = await pool.query(fieldMap[req.query.field]); res.json({ success: true, data: rows }); } catch (e) { next(e); }
});

app.get('/api/setores', apenasAdmin, async (req, res, next) => { try { const { rows } = await pool.query('SELECT id, nome FROM setores ORDER BY nome'); res.json({ success: true, setores: rows }); } catch (e) { next(e); }});

app.get('/api/patrimonios/next-tag', apenasAdmin, async (req, res, next) => {
    try {
        const query = `
            SELECT regexp_replace(patrimonio, '[^0-9]', '', 'g') AS numeric_patrimonio
            FROM patrimonio
            WHERE regexp_replace(patrimonio, '[^0-9]', '', 'g') <> ''
            ORDER BY CAST(regexp_replace(patrimonio, '[^0-9]', '', 'g') AS BIGINT) DESC
            LIMIT 1;
        `;
        const { rows } = await pool.query(query);

        let nextTag = 1;
        if (rows.length > 0) {
            const lastTag = parseInt(rows[0].numeric_patrimonio, 10);
            if (!isNaN(lastTag)) {
                nextTag = lastTag + 1;
            }
        }
        res.json({ success: true, nextTag: String(nextTag) });
    } catch (e) {
        next(e);
    }
});

// --- ROTA PARA BUSCAR O HISTÓRICO DE UM ITEM ---
app.get('/api/patrimonios/:id/historico', apenasAdmin, async (req, res, next) => {
    try {
        const { id } = req.params;
        const query = 'SELECT acao, detalhes, utilizador, timestamp FROM historico WHERE patrimonio_id = $1 ORDER BY timestamp DESC';
        const { rows } = await pool.query(query, [id]);
        res.json(rows);
    } catch (e) {
        next(e);
    }
});

app.get('/api/patrimonios', apenasAdmin, async (req, res, next) => { 
    try { 
        const page = parseInt(req.query.page) || 1, limit = 15, offset = (page - 1) * limit; 
        const { whereClause, queryValues, valueIndex } = buildWhereClause(req.query); 
        const countQuery = `SELECT COUNT(p.id) FROM patrimonio p LEFT JOIN setores s ON p.setor_id = s.id ${whereClause}`; 
        const dataQuery = `
            SELECT 
                p.id, p.nome, p.patrimonio, p.responsavel_nome, p.responsavel_email, 
                p.valor_unitario, p.nota_fiscal, p.nota_fiscal_url, p.cadastrado_em, s.nome as setor, s.id as setor_id, 
                p.marca, p.modelo, p.numero_serie, p.data_aquisicao, p.fornecedor, 
                p.garantia, p.status, p.observacao 
            FROM patrimonio p 
            LEFT JOIN setores s ON p.setor_id = s.id 
            ${whereClause} 
            ORDER BY p.id DESC 
            LIMIT $${valueIndex} OFFSET $${valueIndex + 1}`;
        const [countResult, dataResult] = await Promise.all([ pool.query(countQuery, queryValues), pool.query(dataQuery, [...queryValues, limit, offset]) ]); 
        const totalItems = parseInt(countResult.rows[0].count, 10); 
        res.json({ items: dataResult.rows, pagination: { currentPage: page, totalPages: Math.ceil(totalItems / limit), totalItems }}); 
    } catch(e) { next(e); }
});

app.post('/api/patrimonios/import', apenasAdmin, uploadCsv.single('csvfile'), (req, res, next) => {
    if (!req.file) {
        return res.status(400).json({ message: 'Nenhum arquivo CSV foi enviado.' });
    }

    const filePath = req.file.path;
    const results = [];
    
    (async () => {
        const client = await pool.connect();
        try {
            const fileContent = fs.readFileSync(filePath, 'utf8');
            const firstLine = fileContent.split('\n')[0];
            const separator = firstLine.includes(';') ? ';' : ',';
            const mapHeaders = ({ header }) => header.trim().toLowerCase();
            
            const stream = fs.createReadStream(filePath).pipe(csv({ separator, mapHeaders }));

            for await (const row of stream) {
                results.push(row);
            }

            let importedCount = 0;
            let errors = [];
            
            await client.query('BEGIN');
            
            const setoresResult = await client.query('SELECT id, lower(nome) as nome FROM setores');
            let setorCache = setoresResult.rows.reduce((acc, s) => {
                acc[s.nome] = s.id;
                return acc;
            }, {});

            const getValueFromRow = (row, ...keys) => {
                for (const key of keys) {
                    if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
                        return row[key];
                    }
                }
                return null;
            };

            for (const [index, row] of results.entries()) {
                const patrimonio = getValueFromRow(row, 'etiqueta', 'patrimonio', 'patrimônio', 'tag');
                const nome = getValueFromRow(row, 'descrição', 'descricao', 'item', 'nome');

                if (!patrimonio || !nome) {
                    continue;
                }

                const setorNomeRaw = getValueFromRow(row, 'localização', 'localizacao', 'setor') || 'Estoque';
                const setorNome = setorNomeRaw.toLowerCase().trim();
                let setor_id = setorCache[setorNome];

                if (!setor_id) {
                    const setorResult = await client.query("INSERT INTO setores (nome) VALUES ($1) ON CONFLICT (LOWER(nome)) DO UPDATE SET nome = EXCLUDED.nome RETURNING id", [setorNomeRaw]);
                    if (setorResult.rows.length > 0) {
                        setor_id = setorResult.rows[0].id;
                        setorCache[setorNome] = setor_id;
                    } else {
                        errors.push(`Linha ${index + 2}: Falha ao criar/obter o setor '${setorNomeRaw}'.`);
                        continue;
                    }
                }

                const values = [
                    nome, patrimonio, setor_id,
                    getValueFromRow(row, 'usado por', 'responsavel', 'responsável'),
                    parseCurrency(getValueFromRow(row, 'valor (r$)', 'valor')),
                    getValueFromRow(row, 'nota fiscal'),
                    getValueFromRow(row, 'marca'),
                    getValueFromRow(row, 'modelo'),
                    getValueFromRow(row, 'data de compra'),
                    getValueFromRow(row, 'fonecedor', 'fornecedor'),
                    getValueFromRow(row, 'status'),
                    getValueFromRow(row, 'motivo', 'observacao', 'observação')
                ];

                const query = `
                    INSERT INTO patrimonio (nome, patrimonio, setor_id, responsavel_nome, valor_unitario, nota_fiscal, marca, modelo, data_aquisicao, fornecedor, status, observacao)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                    ON CONFLICT (patrimonio) DO UPDATE SET
                        nome = EXCLUDED.nome, setor_id = EXCLUDED.setor_id, responsavel_nome = EXCLUDED.responsavel_nome,
                        valor_unitario = EXCLUDED.valor_unitario, status = EXCLUDED.status, observacao = EXCLUDED.observacao, marca = EXCLUDED.marca,
                        modelo = EXCLUDED.modelo, data_aquisicao = EXCLUDED.data_aquisicao, fornecedor = EXCLUDED.fornecedor,
                        nota_fiscal = EXCLUDED.nota_fiscal, atualizado_em = CURRENT_TIMESTAMP;
                `;
                await client.query(query, values);
                importedCount++;
            }

            if (errors.length > 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ message: `Importação concluída com ${errors.length} erros:\n- ${errors.join('\n- ')}` });
            }

            await client.query('COMMIT');
            res.status(201).json({ success: true, message: `${importedCount} itens importados/atualizados com sucesso!` });

        } catch (err) {
            await client.query('ROLLBACK');
            next(err); 
        } finally {
            client.release();
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }
    })();
});

app.post('/api/patrimonios/bulk-update', apenasAdmin, async (req, res, next) => {
    const { ids, action, value } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: 'A lista de IDs é obrigatória.' });
    }
    if (!action || !value) {
        return res.status(400).json({ message: 'A ação e o valor são obrigatórios.' });
    }

    let setClause = '';
    let queryParams = [ids];
    let historicoDetalhes = '';
    const client = await pool.connect();

    try {
        if (action === 'change_sector') {
            const setorResult = await client.query('SELECT nome FROM setores WHERE id = $1', [value]);
            const setorNome = setorResult.rows[0]?.nome || `ID ${value}`;
            setClause = 'setor_id = $2';
            queryParams.push(value);
            historicoDetalhes = `Setor alterado para '${setorNome}'`;
        } else if (action === 'change_status') {
            setClause = 'status = $2';
            queryParams.push(value);
            historicoDetalhes = `Status alterado para '${value}'`;
        } else if (action === 'assign_responsible') {
            setClause = 'responsavel_nome = $2, responsavel_email = $3';
            queryParams.push(value.name || null, value.email || null);
            historicoDetalhes = `Responsável atribuído: '${value.name || 'Nenhum'}'`;
        } else {
            return res.status(400).json({ message: 'Ação inválida.' });
        }

        await client.query('BEGIN');

        const updateQuery = `UPDATE patrimonio SET ${setClause}, atualizado_em = CURRENT_TIMESTAMP WHERE id = ANY($1::int[])`;
        const { rowCount } = await client.query(updateQuery, queryParams);

        const historicoQuery = 'INSERT INTO historico (patrimonio_id, acao, detalhes, utilizador) SELECT id, $2, $3, $4 FROM unnest($1::int[]) as t(id)';
        await client.query(historicoQuery, [ids, 'ATUALIZAÇÃO EM LOTE', historicoDetalhes, req.user.user]);

        await client.query('COMMIT');
        res.status(200).json({ success: true, message: `${rowCount} itens foram atualizados com sucesso.` });
    } catch (e) {
        await client.query('ROLLBACK');
        next(e);
    } finally {
        client.release();
    }
});


app.post('/api/patrimonios/delete-lote', apenasAdmin, async (req, res, next) => {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: 'A lista de IDs para exclusão é obrigatória.' });
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const filesResult = await client.query('SELECT nota_fiscal_url FROM patrimonio WHERE id = ANY($1::int[])', [ids]);
        for (const row of filesResult.rows) {
            if (row.nota_fiscal_url) {
                const filePath = path.join(__dirname, row.nota_fiscal_url);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            }
        }
        
        const { rowCount } = await client.query('DELETE FROM patrimonio WHERE id = ANY($1::int[])', [ids]);
        await client.query('COMMIT');
        res.status(200).json({ success: true, message: `${rowCount} itens excluídos com sucesso.` });
    } catch (e) { await client.query('ROLLBACK'); next(e); } finally { client.release(); }
});

app.post('/api/patrimonios', apenasAdmin, uploadInvoice.single('nota_fiscal_pdf'), async (req, res, next) => { 
    const fields = ['nome', 'patrimonio', 'setor_id', 'responsavel_nome', 'responsavel_email', 'valor_unitario', 'nota_fiscal', 'marca', 'modelo', 'numero_serie', 'data_aquisicao', 'fornecedor', 'garantia', 'status', 'observacao'];
    const { nome, patrimonio, setor_id } = req.body;
    if (!nome || !patrimonio || !setor_id) return res.status(400).json({ message: 'Nome, Patrimônio e Setor são obrigatórios.' });

    const notaFiscalUrl = req.file ? `/public/uploads/invoices/${req.file.filename}` : null;
    
    const values = fields.map((field) => field === 'valor_unitario' ? parseCurrency(req.body[field]) : req.body[field] || null);
    
    const query = `INSERT INTO patrimonio (${fields.join(', ')}, nota_fiscal_url) VALUES (${fields.map((_, i) => `$${i + 1}`).join(', ')}, $${fields.length + 1}) RETURNING id`;
    
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { rows } = await client.query(query, [...values, notaFiscalUrl]);
        await client.query('INSERT INTO historico (patrimonio_id, acao, detalhes, utilizador) VALUES ($1, $2, $3, $4)', [rows[0].id, 'CRIAÇÃO', `Item '${nome}' (Patrimônio: ${patrimonio}) foi criado.`, req.user.user]);
        await client.query('COMMIT');
        res.status(201).json({ success: true, message: 'Item adicionado com sucesso!'});
    } catch(e) { 
        await client.query('ROLLBACK');
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        next(e); 
    } finally { 
        client.release(); 
    }
});

app.post('/api/patrimonios/:id', apenasAdmin, uploadInvoice.single('nota_fiscal_pdf'), async (req, res, next) => {
    const { id } = req.params;
    if (isNaN(parseInt(id, 10))) {
        return next();
    }
    const fields = ['nome', 'patrimonio', 'setor_id', 'responsavel_nome', 'responsavel_email', 'valor_unitario', 'nota_fiscal', 'marca', 'modelo', 'numero_serie', 'data_aquisicao', 'fornecedor', 'garantia', 'status', 'observacao'];
    
    const { remover_nota_fiscal } = req.body;
    
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const oldDataResult = await client.query('SELECT * FROM patrimonio WHERE id = $1', [id]);
        if(oldDataResult.rowCount === 0) {
            return res.status(404).json({ message: 'Item não encontrado.'});
        }
        const oldData = oldDataResult.rows[0];

        let notaFiscalUrl = oldData.nota_fiscal_url;
        
        if (req.file || remover_nota_fiscal === 'true') {
            if (oldData.nota_fiscal_url) {
                const oldFilePath = path.join(__dirname, oldData.nota_fiscal_url);
                if (fs.existsSync(oldFilePath)) fs.unlinkSync(oldFilePath);
            }
        }
        
        if (req.file) {
            notaFiscalUrl = `/public/uploads/invoices/${req.file.filename}`;
        } else if (remover_nota_fiscal === 'true') {
            notaFiscalUrl = null;
        }

        const newValues = fields.map(f => f === 'valor_unitario' ? parseCurrency(req.body[f]) : req.body[f] || null);
        
        const updateQuery = `
            UPDATE patrimonio SET 
            ${fields.map((f, i) => `${f} = $${i + 1}`).join(', ')}, 
            nota_fiscal_url = $${fields.length + 1},
            atualizado_em = CURRENT_TIMESTAMP 
            WHERE id = $${fields.length + 2}
        `;
        
        await client.query(updateQuery, [...newValues, notaFiscalUrl, id]);
        
        const newData = {};
        fields.forEach((field, index) => { newData[field] = newValues[index]; });
        
        const setoresRes = await client.query('SELECT id, nome FROM setores');
        const setorMap = setoresRes.rows.reduce((acc, s) => ({...acc, [s.id]: s.nome }), {});
        
        const details = generateChangeDetails(oldData, newData, setorMap);

        await client.query('INSERT INTO historico (patrimonio_id, acao, detalhes, utilizador) VALUES ($1, $2, $3, $4)', [id, 'ATUALIZAÇÃO', details, req.user.user]);
        
        await client.query('COMMIT');
        res.json({ success: true, message: 'Item atualizado com sucesso!' });
    } catch(e) { 
        await client.query('ROLLBACK');
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); 
        next(e); 
    } finally { 
        client.release(); 
    }
});

app.patch('/api/patrimonios/:id', apenasAdmin, async (req, res, next) => {
    const { id } = req.params;
    const fields = ['responsavel_nome', 'responsavel_email', 'setor_id'];
    const updates = fields.filter(f => req.body[f] !== undefined);

    if (updates.length === 0) return res.status(400).json({ message: 'Nenhum campo para atualizar fornecido.' });
    
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const oldDataResult = await client.query('SELECT responsavel_nome, responsavel_email, setor_id FROM patrimonio WHERE id = $1', [id]);
         if(oldDataResult.rowCount === 0) {
            return res.status(404).json({ message: 'Item não encontrado.'});
        }
        const oldData = oldDataResult.rows[0];
        
        const query = `UPDATE patrimonio SET ${updates.map((f, i) => `${f} = $${i + 1}`).join(', ')}, atualizado_em = CURRENT_TIMESTAMP WHERE id = $${updates.length + 1}`;
        const values = updates.map(f => req.body[f] || null);
        await client.query(query, [...values, id]);
        
        const setoresRes = await client.query('SELECT id, nome FROM setores');
        const setorMap = setoresRes.rows.reduce((acc, s) => ({...acc, [s.id]: s.nome }), {});
        
        const details = generateChangeDetails(oldData, req.body, setorMap);
        await client.query('INSERT INTO historico (patrimonio_id, acao, detalhes, utilizador) VALUES ($1, $2, $3, $4)', [id, 'ATUALIZAÇÃO RÁPIDA', details, req.user.user]);
        
        await client.query('COMMIT');
        res.json({ success: true, message: 'Item atualizado com sucesso!' });
    } catch(e) { await client.query('ROLLBACK'); next(e); } finally { client.release(); }
});

app.get('/api/termo/responsavel/:nomeOuEmail', apenasAdmin, async (req, res, next) => {
    try {
        const query = `
            SELECT id, nome, patrimonio, responsavel_nome, responsavel_email, marca, modelo, numero_serie 
            FROM patrimonio 
            WHERE responsavel_nome ILIKE $1 OR responsavel_email ILIKE $1
        `;
        const { rows } = await pool.query(query, [`%${req.params.nomeOuEmail}%`]);

        if (!rows.length) {
            return res.status(404).json({ message: 'Nenhum equipamento encontrado para este responsável.' });
        }
        
        const responsavel = { nome: rows[0].responsavel_nome, email: rows[0].responsavel_email || '' };
        
        res.json({ success: true, responsavel, equipamentos: rows });
    } catch (e) {
        next(e);
    }
});

app.get('/api/patrimonio/tag/:tag', apenasAdmin, async (req, res, next) => { try { const { rows } = await pool.query('SELECT id, nome, patrimonio, responsavel_nome, responsavel_email, setor_id, status FROM patrimonio WHERE patrimonio ILIKE $1', [req.params.tag]); if (!rows.length) return res.status(404).json({ message: 'Nenhum patrimônio encontrado.' }); res.json({ success: true, item: rows[0] }); } catch (e) { next(e); }});


// --- ROTAS DE MANUTENÇÃO ---
app.get('/api/patrimonios/:id/manutencoes', apenasAdmin, async (req, res, next) => {
    try {
        const { id } = req.params;
        const { rows } = await pool.query('SELECT * FROM manutencoes WHERE patrimonio_id = $1 ORDER BY data_envio DESC', [id]);
        res.json(rows);
    } catch (e) {
        next(e);
    }
});

app.post('/api/patrimonios/:id/manutencoes', apenasAdmin, async (req, res, next) => {
    const patrimonio_id = req.params.id;
    const { data_envio, problema_relatado, fornecedor_servico, status_manutencao, observacoes } = req.body;

    if (!data_envio || !problema_relatado || !status_manutencao) {
        return res.status(400).json({ message: 'Data de envio, problema e status da manutenção são obrigatórios.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const query = `
            INSERT INTO manutencoes (patrimonio_id, data_envio, problema_relatado, fornecedor_servico, status_manutencao, observacoes)
            VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
        `;
        const { rows } = await client.query(query, [patrimonio_id, data_envio, problema_relatado, fornecedor_servico, status_manutencao, observacoes]);
        
        await client.query(`UPDATE patrimonio SET status = 'Em Manutenção' WHERE id = $1`, [patrimonio_id]);
        await client.query('INSERT INTO historico (patrimonio_id, acao, detalhes, utilizador) VALUES ($1, $2, $3, $4)', [patrimonio_id, 'MANUTENÇÃO', `Item enviado para reparo. Motivo: ${problema_relatado}`, req.user.user]);
        
        await client.query('COMMIT');
        res.status(201).json({ success: true, message: 'Registro de manutenção criado com sucesso!', data: rows[0] });
    } catch (e) {
        await client.query('ROLLBACK');
        next(e);
    } finally {
        client.release();
    }
});

app.put('/api/manutencoes/:manutencao_id', apenasAdmin, async (req, res, next) => {
    const { manutencao_id } = req.params;
    const { data_retorno, fornecedor_servico, custo, status_manutencao, observacoes, patrimonio_id, novo_status_patrimonio } = req.body;

    if (!status_manutencao || !patrimonio_id || !novo_status_patrimonio) {
        return res.status(400).json({ message: 'Status da manutenção, ID do patrimônio e o novo status do patrimônio são obrigatórios.' });
    }
    
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const query = `
            UPDATE manutencoes SET
                data_retorno = $1,
                fornecedor_servico = $2,
                custo = $3,
                status_manutencao = $4,
                observacoes = $5
            WHERE id = $6 RETURNING *
        `;
        const { rows } = await client.query(query, [data_retorno || null, fornecedor_servico, parseCurrency(custo), status_manutencao, observacoes, manutencao_id]);
        
        await client.query(`UPDATE patrimonio SET status = $1 WHERE id = $2`, [novo_status_patrimonio, patrimonio_id]);
        await client.query('INSERT INTO historico (patrimonio_id, acao, detalhes, utilizador) VALUES ($1, $2, $3, $4)', [patrimonio_id, 'MANUTENÇÃO', `Manutenção atualizada. Status: ${status_manutencao}. Novo status do item: ${novo_status_patrimonio}`, req.user.user]);

        await client.query('COMMIT');
        res.json({ success: true, message: 'Registro de manutenção atualizado com sucesso!', data: rows[0] });

    } catch (e) {
        await client.query('ROLLBACK');
        next(e);
    } finally {
        client.release();
    }
});

app.delete('/api/manutencoes/:manutencao_id', apenasAdmin, async (req, res, next) => {
    const { manutencao_id } = req.params;
    try {
        const { rowCount } = await pool.query('DELETE FROM manutencoes WHERE id = $1', [manutencao_id]);
        if (rowCount === 0) {
            return res.status(404).json({ message: 'Registro de manutenção não encontrado.' });
        }
        res.status(200).json({ success: true, message: 'Registro de manutenção excluído com sucesso.' });
    } catch(e) {
        next(e);
    }
});


// --- Rotas de Gerenciamento de Usuários ---
app.get('/api/users', apenasAdmin, async (req, res, next) => { try { const { rows } = await pool.query('SELECT id, username, role FROM usuarios ORDER BY username ASC'); res.json(rows); } catch (e) { next(e); }});

app.post('/api/users', apenasAdmin, async (req, res, next) => {
    const { username, password, role } = req.body;
    if (!username || !password || !role || !['admin', 'user'].includes(role)) return res.status(400).json({ message: 'Dados inválidos (nome, senha e permissão são obrigatórios).' });
    try {
        const passwordHash = await bcrypt.hash(password, 10);
        const { rows } = await pool.query('INSERT INTO usuarios (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id, username, role', [username, passwordHash, role]);
        res.status(201).json(rows[0]);
    } catch (e) { (e.code === '23505') ? res.status(409).json({ message: 'Nome de usuário já existe.' }) : next(e); }
});

app.put('/api/users/:id', apenasAdmin, async (req, res, next) => {
    const { id } = req.params;
    const { password, role } = req.body;
    if (parseInt(id, 10) === req.user.userId && role === 'user') return res.status(403).json({ message: 'Você não pode remover a sua própria permissão de administrador.' });
    
    let queryParts = [], values = [], i = 1;
    if (password) { 
        queryParts.push(`password_hash = $${i++}`); 
        values.push(await bcrypt.hash(password, 10)); 
    }
    if (role && ['admin', 'user'].includes(role)) { 
        queryParts.push(`role = $${i++}`); 
        values.push(role); 
    }
    if (!queryParts.length) return res.status(400).json({ message: 'Nenhum dado para atualizar.' });
    
    values.push(id);
    try {
        const { rowCount } = await pool.query(`UPDATE usuarios SET ${queryParts.join(', ')} WHERE id = $${i}`, values);
        if (rowCount === 0) return res.status(404).json({ message: 'Usuário não encontrado.' });
        res.json({ message: 'Usuário atualizado.' });
    } catch (e) { next(e); }
});

app.delete('/api/users/:id', apenasAdmin, async (req, res, next) => {
    const { id } = req.params;
    if (parseInt(id, 10) === req.user.userId) return res.status(403).json({ message: 'Você não pode deletar a sua própria conta.' });
    try {
        const { rowCount } = await pool.query('DELETE FROM usuarios WHERE id = $1', [id]);
        if (rowCount === 0) return res.status(404).json({ message: 'Usuário não encontrado.' });
        res.status(204).send();
    } catch (e) { next(e); }
});

// --- Error Handler Global ---
app.use((err, req, res, next) => {
    console.error('ERRO CAPTURADO PELO HANDLER FINAL:', err.stack);
    if (err.code === '23505') return res.status(409).json({ message: `Conflito de dados: O valor '${err.constraint}' já existe.` });
    res.status(500).json({ message: err.message || 'Ocorreu um erro interno no servidor.' });
});

// --- INICIALIZAÇÃO DO SERVIDOR ---
setupDatabase().then(() => {
    app.listen(PORT, '0.0.0.0', () => console.log(`Servidor backend rodando na porta ${PORT}`));
}).catch(error => {
    console.error("Falha crítica ao iniciar o servidor.", error);
    process.exit(1);
});