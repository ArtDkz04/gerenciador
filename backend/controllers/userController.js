// backend/controllers/userController.js
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');

exports.getAllUsers = async (req, res, next) => {
    try {
        const { rows } = await pool.query('SELECT id, username, role FROM usuarios ORDER BY username ASC');
        res.json(rows);
    } catch (e) { next(e); }
};

exports.createUser = async (req, res, next) => {
    const { username, password, role } = req.body;
    if (!username || !password || !role || !['admin', 'user'].includes(role)) {
        return res.status(400).json({ message: 'Dados inválidos (nome, senha e permissão são obrigatórios).' });
    }
    try {
        const passwordHash = await bcrypt.hash(password, 10);
        const { rows } = await pool.query(
            'INSERT INTO usuarios (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id, username, role', 
            [username, passwordHash, role]
        );
        res.status(201).json(rows[0]);
    } catch (e) { 
        if (e.code === '23505') return res.status(409).json({ message: 'Nome de usuário já existe.' });
        next(e); 
    }
};

exports.updateUser = async (req, res, next) => {
    const { id } = req.params;
    const { password, role } = req.body;
    
    // Proteção: não deixar remover o próprio admin se for o usuário logado tentando virar user
    if (parseInt(id, 10) === req.user.userId && role === 'user') {
        return res.status(403).json({ message: 'Você não pode remover a sua própria permissão de administrador.' });
    }
    
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
};

exports.deleteUser = async (req, res, next) => {
    const { id } = req.params;
    if (parseInt(id, 10) === req.user.userId) return res.status(403).json({ message: 'Você não pode deletar a sua própria conta.' });
    try {
        const { rowCount } = await pool.query('DELETE FROM usuarios WHERE id = $1', [id]);
        if (rowCount === 0) return res.status(404).json({ message: 'Usuário não encontrado.' });
        res.status(204).send();
    } catch (e) { next(e); }
};

exports.updateAvatar = async (req, res, next) => {
    if (!req.file) return res.status(400).json({ message: 'Nenhum arquivo de imagem enviado.' });
    try {
        // O middleware de upload já salvou o arquivo, aqui só atualizamos o banco
        const imageUrl = `/public/uploads/avatars/${req.file.filename}`;
        await pool.query('UPDATE usuarios SET profile_image_url = $1 WHERE username = $2', [imageUrl, req.user.user]);
        res.json({ success: true, message: 'Avatar atualizado com sucesso!', avatarUrl: imageUrl });
    } catch (error) { next(error); }
};