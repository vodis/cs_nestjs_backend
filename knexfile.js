module.exports = {
  development: {
    client: process.env.KNEX_DB_CLIENT,
    connection: {
      host: process.env.HOST_IP_ADDRESS,
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
      directory: process.env.DB_MIGRATIONS_TN,
      loadExtensions: ['.js'],
    },
    seeds: {
      directory: process.env.DB_SEED_PATH,
      loadExtensions: ['.js'],
    },
  },
};
