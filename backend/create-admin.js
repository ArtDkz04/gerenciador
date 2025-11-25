// backend/create-admin.js

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const readline = require('readline');

// Interface para ler input do terminal
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Usamos a mesma variável de ambiente que a aplicação principal para conectar ao banco
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * Função para fazer perguntas ao usuário no terminal.
 * @param {string} query A pergunta a ser exibida.
 * @returns {Promise<string>} A resposta do usuário.
 */
function question(query) {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
}

/**
 * Função principal para criar o usuário.
 */
async function createAdmin() {
  let client;
  try {
    const username = await question('Digite o nome do usuário administrador: ');
    if (!username) {
      throw new Error('O nome do usuário não pode ser vazio.');
    }

    const password = await question(`Digite a senha para "${username}": `);
    if (!password) {
      throw new Error('A senha não pode ser vazia.');
    }
    
    // Mostra um aviso importante sobre a visibilidade da senha no terminal
    console.log('A senha foi digitada de forma visível. Isso é normal para este script.');
    console.log('Gerando hash seguro para a senha...');

    // Gera o salt e o hash da senha
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    console.log(`Conectando ao banco de dados...`);
    client = await pool.connect();

    // Insere o novo usuário com a role 'admin'
    const query = 'INSERT INTO usuarios (username, password_hash, role) VALUES ($1, $2, $3)';
    await client.query(query, [username, passwordHash, 'admin']);

    console.log(`\n✅ Sucesso! Usuário administrador "${username}" criado.`);
    
  } catch (error) {
    // Trata erro comum de usuário já existente
    if (error.code === '23505') {
      console.error(`\n❌ Erro: O usuário "${error.constraint.split('_')[1]}" já existe no banco de dados.`);
    } else {
      console.error('\n❌ Ocorreu um erro ao criar o usuário administrador:', error.message);
    }
  } finally {
    // Garante que a conexão com o banco e o readline sejam fechados
    if (client) {
      client.release();
    }
    pool.end();
    rl.close();
  }
}

// Executa a função principal
createAdmin();