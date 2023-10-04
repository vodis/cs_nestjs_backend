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
    debug: true,
    pool: {
      min: 2,
      max: 20,
      acquireTimeoutMillis: 60000,
      createTimeoutMillis: 30000,
      destroyTimeoutMillis: 5000,
      idleTimeoutMillis: 60000,
      reapIntervalMillis: 1000,
      createRetryIntervalMillis: 200,
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
