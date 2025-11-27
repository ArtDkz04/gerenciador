// backend/controllers/maintenanceController.js
const { pool } = require('../config/db');
const { parseCurrency } = require('../utils/helpers');

exports.getByPatrimonio = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { rows } = await pool.query('SELECT * FROM manutencoes WHERE patrimonio_id = $1 ORDER BY data_envio DESC', [id]);
        res.json(rows);
    } catch (e) { next(e); }
};

exports.create = async (req, res, next) => {
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
};

exports.update = async (req, res, next) => {
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
};

exports.delete = async (req, res, next) => {
    const { manutencao_id } = req.params;
    try {
        const { rowCount } = await pool.query('DELETE FROM manutencoes WHERE id = $1', [manutencao_id]);
        if (rowCount === 0) return res.status(404).json({ message: 'Registro de manutenção não encontrado.' });
        res.status(200).json({ success: true, message: 'Registro de manutenção excluído com sucesso.' });
    } catch(e) { next(e); }
};