require('dotenv').config();

const base = {
  dialect: process.env.DB_CLIENT || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'craftscript',
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || undefined,
  logging: process.env.DB_LOGGING === 'true',
};

module.exports = {
  development: process.env.DATABASE_URL
    ? { url: process.env.DATABASE_URL, dialect: 'postgres', logging: base.logging }
    : base,
  test: {
    dialect: 'sqlite',
    storage: ':memory:',
    logging: false,
  },
  production: process.env.DATABASE_URL
    ? { url: process.env.DATABASE_URL, dialect: 'postgres', logging: false }
    : base,
};
