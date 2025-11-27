// backend/controllers/sectorController.js
const { pool } = require('../config/db');

exports.getAllSectors = async (req, res, next) => {
    try {
        const { rows } = await pool.query('SELECT id, nome FROM setores ORDER BY nome');
        res.json({ success: true, setores: rows });
    } catch (e) { next(e); }
};