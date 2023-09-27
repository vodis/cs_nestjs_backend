export default {
  client: process.env.DB_CLIENT,
  connection: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  },
  pool: {
    min: 2,
    max: 20,
  },
  migrations: {
    tableName: process.env.DB_MIGRATIONS_TN,
  },
  seeds: {
    directory: process.env.DB_SEED_PATH,
  },
};
