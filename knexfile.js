module.exports = {
  development: {
    client: process.env.KNEX_DB_CLIENT,
    connection: {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT, 10) || 5432,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    },
    acquireConnectionTimeout: 1000000,
    pool: {
      min: 2,
      max: 20,
      acquireTimeoutMillis: 300000,
      createTimeoutMillis: 300000,
      destroyTimeoutMillis: 300000,
      idleTimeoutMillis: 30000,
      reapIntervalMillis: 1000,
      createRetryIntervalMillis: 2000,
    },
    migrations: {
      tableName: process.env.DB_MIGRATIONS_TN,
    },
    seeds: {
      directory: process.env.DB_SEED_PATH,
    },
  },
};
