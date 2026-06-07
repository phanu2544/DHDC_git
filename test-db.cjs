const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    password: '123456',
    database: 'dhdc_dev',
    connectTimeout: 5000,
  });

  const [rows] = await conn.query('SELECT COUNT(*) AS total FROM users');

  console.log('✅ Node.js ต่อ MariaDB ได้แล้ว');
  console.log('จำนวน users:', rows[0].total);

  await conn.end();
}

main().catch((err) => {
  console.error('❌ Node.js ต่อ MariaDB ไม่ได้');
  console.error('code:', err.code);
  console.error('message:', err.message);
  process.exit(1);
});