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
    debug: false,
    acquireConnectionTimeout: 600000,
    pool: {
      min: 0,
      max: 100,
      acquireTimeoutMillis: 300000,
      createTimeoutMillis: 300000,
      destroyTimeoutMillis: 50000,
      idleTimeoutMillis: 300000,
      reapIntervalMillis: 10000,
      createRetryIntervalMillis: 2000,
      propagateCreateError: false,
    },
    migrations: {
      directory: process.env.DB_MIGRATIONS_TN,
      loadExtensions: ['.js'],
    },
    seeds: {
      directory: process.env.DB_SEED_PATH,
      loadExtensions: ['.js'],
    },
  },
};
