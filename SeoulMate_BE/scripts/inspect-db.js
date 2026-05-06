const { Client } = require("pg");
require("dotenv").config();

async function main() {
  const c = new Client({
    host: process.env.POSTGRES_HOST,
    port: Number(process.env.POSTGRES_PORT),
    database: process.env.POSTGRES_DB,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    ssl: { rejectUnauthorized: false }
  });

  await c.connect();

  const tables = await c.query(
    "select tablename from pg_tables where schemaname = 'public' order by tablename"
  );
  console.log("tables");
  console.table(tables.rows);

  const categories = await c.query(
    "select category, count(*)::int as count from public_data group by category order by count desc"
  );
  console.log("categories");
  console.table(categories.rows);

  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
