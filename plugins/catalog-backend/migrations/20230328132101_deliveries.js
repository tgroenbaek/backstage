/*
 * Copyright 2022 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// @ts-check

/**
 * @param { import("knex").Knex } knex
 */
exports.up = async function up(knex) {
  /**
   * Table: blobs
   *
   * This table is used to store raw blob data, for example entities. It's keyed
   * by etag, so it effectively holds the union of all blobs in the system. Note
   * that these aren't necessarily entities, or if they are entities, that they
   * are valid ones.
   *
   * We leverage the etag uniqueness to be able to quickly accept large
   * repetitive batch imports without worrying about bloating the database with
   * duplicates of entity data.
   */
  await knex.schema.createTable('blobs', table => {
    table.comment('Raw blob data, for example entities');

    table
      .string('etag')
      .primary()
      .notNullable()
      .comment('Hash of blob contents');
    table
      .dateTime('touched_at')
      .notNullable()
      .comment('When the blob was last touched, eg upserted by a source');
    table
      .text('data', 'longtext')
      .notNullable()
      .comment('Raw blob data contents');
  });

  /**
   * Table: deliveries
   *
   * For each delivery of data from a provider, a delivery is created to keep
   * track of the work and outcomes. Each delivery has a number of delivery
   * entries, see delivery_entries.
   *
   * There are several types of action that can be performed as part of a
   * delivery. Once the delivery is complete and persisted, an action-specific
   * finishing process will run on the delivery. For example, a full replacement
   * action will remove all previous entities from this particular provider and
   * replace them with the contents of the delivery.
   */
  await knex.schema.createTable('deliveries', table => {
    table.comment('Data deliveries from providers');

    table.bigIncrements('id').unsigned().comment('Primary ID');
    table
      .string('provider_name')
      .notNullable()
      .comment('The entity provider name');
    table
      .string('action')
      .notNullable()
      .comment('The type of action to perform with the delivered data');
    table
      .dateTime('started_at') // TODO: timezone or change to epoch-millis or similar
      .notNullable()
      .comment('When the delivery started');
    table
      .dateTime('ended_at') // TODO: timezone or change to epoch-millis or similar
      .nullable()
      .comment('When the delivery ended');

    table.index('provider_name', 'deliveries_provider_name_idx');
  });

  /**
   * Table: delivery_entries
   *
   * The individual parts of a given delivery. The contents of these rows are
   * dependent on the action type of the delivery that they belong to. For
   * example, some actions will have entries that are expected to refer to blobs
   * of entity data, while other actions will have e.g. an entity ref in the
   * value column.
   */
  await knex.schema.createTable('delivery_entries', table => {
    table.comment('Individual parts of a delivery');

    table.bigIncrements('id').unsigned().comment('Primary ID');
    table
      .bigInteger('delivery_id')
      .unsigned()
      .notNullable()
      .comment('The associated delivery');
    table.string('value').nullable().comment('An action dependent value');
    table
      .string('blob')
      .nullable()
      .comment('Reference to data, if applicable for the delivery action type');

    table.index('delivery_id', 'delivery_entries_delivery_id_idx');

    table
      .foreign(['delivery_id'], 'delivery_entries_delivery_id_fk')
      .references(['id'])
      .inTable('deliveries')
      .onDelete('CASCADE');

    table
      .foreign(['blob'], 'delivery_entries_blob_fk')
      .references(['etag'])
      .inTable('blobs')
      .onDelete('SET NULL');
  });
};

/**
 * @param { import("knex").Knex } knex
 */
exports.down = async function down(knex) {
  await knex.schema.alterTable('delivery_entries', table => {
    table.dropForeign([], 'delivery_entries_delivery_id_fk');
    table.dropForeign([], 'delivery_entries_blob_fk');
    table.dropIndex([], 'delivery_entries_delivery_id_idx');
  });
  await knex.schema.dropTable('delivery_entries');

  await knex.schema.alterTable('deliveries', table => {
    table.dropIndex([], 'deliveries_provider_name_idx');
  });
  await knex.schema.dropTable('deliveries');

  await knex.schema.dropTable('blobs');
};
