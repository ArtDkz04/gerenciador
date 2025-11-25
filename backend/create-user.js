const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

function question(query) {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
}

async function createUser() {
  let client;
  try {
    const username = await question('Digite o nome do novo usuário: ');
    if (!username) throw new Error('O nome de usuário não pode ser vazio.');

    const password = await question(`Digite a senha para "${username}": `);
    if (!password) throw new Error('A senha não pode ser vazia.');

    let role = '';
    while (role !== 'admin' && role !== 'user') {
      role = await question(`Digite a permissão (role) para "${username}" (admin/user): `);
      if (role !== 'admin' && role !== 'user') {
        console.log('Permissão inválida. Por favor, digite "admin" ou "user".');
      }
    }
    
    console.log('Gerando hash seguro para a senha...');
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    console.log(`Conectando ao banco de dados...`);
    client = await pool.connect();

    const query = 'INSERT INTO usuarios (username, password_hash, role) VALUES ($1, $2, $3)';
    await client.query(query, [username, passwordHash, role]);

    console.log(`\n✅ Sucesso! Usuário "${username}" com permissão "${role}" foi criado.`);
    
  } catch (error) {
    if (error.code === '23505') {
      console.error(`\n❌ Erro: Um usuário com este nome já existe.`);
    } else {
      console.error('\n❌ Ocorreu um erro:', error.message);
    }
  } finally {
    if (client) client.release();
    pool.end();
    rl.close();
  }
}

createUser();