// backend/controllers/authController.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET;

exports.login = async (req, res, next) => {
    const { user, password } = req.body;
    
    if (!user || !password) {
        return res.status(400).json({ message: 'Utilizador e senha são obrigatórios.' });
    }

    try {
        const result = await pool.query(
            'SELECT id, username, role, password_hash, profile_image_url FROM usuarios WHERE username = $1', 
            [user]
        );
        const userData = result.rows[0];

        if (!userData || !await bcrypt.compare(password, userData.password_hash)) {
            return res.status(401).json({ message: 'Utilizador ou senha inválidos.' });
        }

        const token = jwt.sign(
            { userId: userData.id, user: userData.username, role: userData.role }, 
            JWT_SECRET, 
            { expiresIn: '8h' }
        );

        res.json({ 
            success: true, 
            token, 
            role: userData.role, 
            user: userData.username, 
            avatar: userData.profile_image_url 
        });
    } catch (error) { 
        next(error); 
    }
};