/**
 * @param { import("knex").Knex } knex
 * @returns {Knex.SchemaBuilder}
 */
exports.up = function (knex) {
  return knex.schema.createTable('translations', function (t) {
    t.increments('id').primary().notNullable();
    t.string('key').notNullable();
    t.string('system').notNullable();
    t.string('language').notNullable();
    t.string('content');
    t.boolean('edited').defaultTo(false);
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists('translations');
};
