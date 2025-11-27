// backend/controllers/dashboardController.js
const { pool } = require('../config/db');

exports.getStats = async (req, res, next) => {
    try {
        const [items, valor] = await Promise.all([
            pool.query('SELECT COUNT(id) FROM patrimonio'),
            pool.query('SELECT SUM(valor_unitario) FROM patrimonio')
        ]);
        res.json({ 
            success: true, 
            totalItems: parseInt(items.rows[0].count, 10), 
            totalValor: parseFloat(valor.rows[0].sum) || 0 
        });
    } catch (e) { next(e); }
};

exports.getChartsData = async (req, res, next) => {
    const fieldMap = { 
        setor: `SELECT s.nome as label, COUNT(p.id)::int as value FROM patrimonio p JOIN setores s ON p.setor_id = s.id GROUP BY s.nome ORDER BY value DESC LIMIT 10;`, 
        nome: `SELECT p.nome as label, COUNT(p.id)::int as value FROM patrimonio p GROUP BY p.nome ORDER BY value DESC LIMIT 10;`, 
        valor_por_nome: `SELECT p.nome as label, SUM(p.valor_unitario) as value FROM patrimonio p WHERE p.valor_unitario > 0 GROUP BY p.nome ORDER BY value DESC LIMIT 10;` 
    };
    
    if (!fieldMap[req.query.field]) return res.status(400).json({ message: 'Campo de agrupamento inválido.' });
    
    try { 
        const { rows } = await pool.query(fieldMap[req.query.field]); 
        res.json({ success: true, data: rows }); 
    } catch (e) { next(e); }
};