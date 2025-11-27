// backend/config/db.js
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

pool.on('connect', () => console.log('Backend conectado ao banco de dados PostgreSQL!'));
pool.on('error', (err) => { 
    console.error('Erro no pool do banco de dados', err); 
    process.exit(-1); 
});

const setupDatabase = async () => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // Tabela Usuários
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

        // Tabela Setores
        await client.query(`CREATE TABLE IF NOT EXISTS setores (id SERIAL PRIMARY KEY, nome TEXT NOT NULL);`);
        await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_setores_nome_lower ON setores (LOWER(nome));`);
        
        // Tabela Patrimônio
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
        
        // Migração simples para garantir a coluna nota_fiscal_url
        const columns = await client.query(`
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'patrimonio' AND column_name = 'nota_fiscal_url'
        `);
        if (columns.rowCount === 0) {
            await client.query('ALTER TABLE patrimonio ADD COLUMN nota_fiscal_url TEXT;');
        }

        // Tabela Histórico
        await client.query(`CREATE TABLE IF NOT EXISTS historico (id SERIAL PRIMARY KEY, patrimonio_id INTEGER REFERENCES patrimonio(id) ON DELETE CASCADE, acao TEXT NOT NULL, detalhes TEXT, utilizador TEXT, timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);`);
        
        // Tabela Manutenções
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

        // Setores Iniciais
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

module.exports = { pool, setupDatabase };