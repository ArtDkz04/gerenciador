// backend/controllers/patrimonioController.js
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { pool } = require('../config/db');
const { parseCurrency, buildWhereClause, generateChangeDetails } = require('../utils/helpers');

// --- LEITURA E BUSCA ---

exports.getAll = async (req, res, next) => {
    try { 
        const page = parseInt(req.query.page) || 1;
        const limit = 15;
        const offset = (page - 1) * limit; 
        
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
            
        const [countResult, dataResult] = await Promise.all([ 
            pool.query(countQuery, queryValues), 
            pool.query(dataQuery, [...queryValues, limit, offset]) 
        ]); 
        
        const totalItems = parseInt(countResult.rows[0].count, 10); 
        res.json({ items: dataResult.rows, pagination: { currentPage: page, totalPages: Math.ceil(totalItems / limit), totalItems }}); 
    } catch(e) { next(e); }
};

exports.simpleSearch = async (req, res, next) => {
    const { tipo, termo } = req.query;
    if (!tipo || !termo) return res.status(400).json({ message: 'Tipo e termo da pesquisa são obrigatórios.' });
    
    const fieldMap = { responsavel: 'p.responsavel_nome', item: 'p.nome', patrimonio: 'p.patrimonio' };
    if (!fieldMap[tipo]) return res.status(400).json({ message: 'Tipo de pesquisa inválido.' });
    
    try {
        const query = `SELECT p.nome as item, p.responsavel_nome as responsavel, s.nome as setor FROM patrimonio p LEFT JOIN setores s ON p.setor_id = s.id WHERE ${fieldMap[tipo]} ILIKE $1 ORDER BY p.id DESC`;
        const { rows } = await pool.query(query, [`%${termo}%`]);
        res.json({ success: true, items: rows });
    } catch (error) { next(error); }
};

exports.getByTag = async (req, res, next) => {
    try { 
        const { rows } = await pool.query('SELECT id, nome, patrimonio, responsavel_nome, responsavel_email, setor_id, status FROM patrimonio WHERE patrimonio ILIKE $1', [req.params.tag]); 
        if (!rows.length) return res.status(404).json({ message: 'Nenhum patrimônio encontrado.' }); 
        res.json({ success: true, item: rows[0] }); 
    } catch (e) { next(e); }
};

exports.getNextTag = async (req, res, next) => {
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
            if (!isNaN(lastTag)) nextTag = lastTag + 1;
        }
        res.json({ success: true, nextTag: String(nextTag) });
    } catch (e) { next(e); }
};

exports.getHistory = async (req, res, next) => {
    try {
        const { id } = req.params;
        const query = 'SELECT acao, detalhes, utilizador, timestamp FROM historico WHERE patrimonio_id = $1 ORDER BY timestamp DESC';
        const { rows } = await pool.query(query, [id]);
        res.json(rows);
    } catch (e) { next(e); }
};

exports.searchByResponsible = async (req, res, next) => {
    try {
        const query = `
            SELECT id, nome, patrimonio, responsavel_nome, responsavel_email, marca, modelo, numero_serie 
            FROM patrimonio 
            WHERE responsavel_nome ILIKE $1 OR responsavel_email ILIKE $1
        `;
        const { rows } = await pool.query(query, [`%${req.params.nomeOuEmail}%`]);

        if (!rows.length) return res.status(404).json({ message: 'Nenhum equipamento encontrado para este responsável.' });
        
        const responsavel = { nome: rows[0].responsavel_nome, email: rows[0].responsavel_email || '' };
        res.json({ success: true, responsavel, equipamentos: rows });
    } catch (e) { next(e); }
};

// --- CRIAÇÃO E EDIÇÃO ---

exports.create = async (req, res, next) => { 
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
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        next(e); 
    } finally { client.release(); }
};

exports.update = async (req, res, next) => {
    const { id } = req.params;
    if (isNaN(parseInt(id, 10))) return next();

    const fields = ['nome', 'patrimonio', 'setor_id', 'responsavel_nome', 'responsavel_email', 'valor_unitario', 'nota_fiscal', 'marca', 'modelo', 'numero_serie', 'data_aquisicao', 'fornecedor', 'garantia', 'status', 'observacao'];
    const { remover_nota_fiscal } = req.body;
    
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const oldDataResult = await client.query('SELECT * FROM patrimonio WHERE id = $1', [id]);
        if(oldDataResult.rowCount === 0) return res.status(404).json({ message: 'Item não encontrado.'});
        
        const oldData = oldDataResult.rows[0];
        let notaFiscalUrl = oldData.nota_fiscal_url;
        
        // Remove arquivo antigo se houver pedido de remoção ou novo upload
        if ((req.file || remover_nota_fiscal === 'true') && oldData.nota_fiscal_url) {
            // Caminho relativo ao controller: sobe um nível para backend/ e concatena
            // Assume que nota_fiscal_url começa com /public...
            const oldFilePath = path.join(__dirname, '..', oldData.nota_fiscal_url);
            if (fs.existsSync(oldFilePath)) fs.unlinkSync(oldFilePath);
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
    } finally { client.release(); }
};

exports.quickUpdate = async (req, res, next) => {
    const { id } = req.params;
    const fields = ['responsavel_nome', 'responsavel_email', 'setor_id'];
    const updates = fields.filter(f => req.body[f] !== undefined);

    if (updates.length === 0) return res.status(400).json({ message: 'Nenhum campo para atualizar fornecido.' });
    
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const oldDataResult = await client.query('SELECT responsavel_nome, responsavel_email, setor_id FROM patrimonio WHERE id = $1', [id]);
        if(oldDataResult.rowCount === 0) return res.status(404).json({ message: 'Item não encontrado.'});
        
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
};

// --- OPERAÇÕES EM LOTE ---

exports.bulkUpdate = async (req, res, next) => {
    const { ids, action, value } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: 'A lista de IDs é obrigatória.' });
    if (!action || !value) return res.status(400).json({ message: 'A ação e o valor são obrigatórios.' });

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
    } catch (e) { await client.query('ROLLBACK'); next(e); } finally { client.release(); }
};

exports.bulkDelete = async (req, res, next) => {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: 'A lista de IDs para exclusão é obrigatória.' });
    
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const filesResult = await client.query('SELECT nota_fiscal_url FROM patrimonio WHERE id = ANY($1::int[])', [ids]);
        
        // Deletar arquivos físicos
        for (const row of filesResult.rows) {
            if (row.nota_fiscal_url) {
                const filePath = path.join(__dirname, '..', row.nota_fiscal_url);
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            }
        }
        
        const { rowCount } = await client.query('DELETE FROM patrimonio WHERE id = ANY($1::int[])', [ids]);
        await client.query('COMMIT');
        res.status(200).json({ success: true, message: `${rowCount} itens excluídos com sucesso.` });
    } catch (e) { await client.query('ROLLBACK'); next(e); } finally { client.release(); }
};

// --- IMPORTAÇÃO CSV ---

exports.importCsv = (req, res, next) => {
    if (!req.file) return res.status(400).json({ message: 'Nenhum arquivo CSV foi enviado.' });

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

                if (!patrimonio || !nome) continue;

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
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
    })();
};