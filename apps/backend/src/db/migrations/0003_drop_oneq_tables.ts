import { change } from '../db_script';

change(async (db) => {
  await db.dropTable(
    'journal_entries',
    (t) => ({
      journalEntryId: t.varchar(26).primaryKey(),
      prompt: t.varchar(500).nullable(),
      promptId: t.smallint().foreignKey('prompts', 'prompt_id', {
        onUpdate: 'RESTRICT',
        onDelete: 'SET NULL',
      }).nullable(),
      content: t.text(),
      authorUserId: t.uuid().foreignKey('users', 'id', {
        onUpdate: 'RESTRICT',
        onDelete: 'CASCADE',
      }),
      deletedAt: t.timestamp().nullable().index({
        order: 'DESC',
      }),
      createdAt: t.timestamp().default(t.sql`(now() AT TIME ZONE 'UTC'::text)`),
      updatedAt: t.timestamp().default(t.sql`(now() AT TIME ZONE 'UTC'::text)`),
    }),
    (t) => 
      t.index(
        [
          {
            column: 'authorUserId',
          },
          {
            column: 'updatedAt',
            order: 'DESC',
          },
        ]
      ),
  );
});

change(async (db) => {
  await db.dropTable('prompts', (t) => ({
    promptId: t.smallint().identity().primaryKey(),
    text: t.varchar(500),
    category: t.varchar(100).nullable(),
    tags: t.array(t.varchar(255)).nullable(),
    isActive: t.boolean().default(t.sql`true`),
    deletedAt: t.timestamp().nullable().index({
      order: 'DESC',
    }),
    createdAt: t.timestamp().default(t.sql`(now() AT TIME ZONE 'UTC'::text)`),
    updatedAt: t.timestamp().default(t.sql`(now() AT TIME ZONE 'UTC'::text)`).index({
      order: 'DESC',
    }),
  }));
});
