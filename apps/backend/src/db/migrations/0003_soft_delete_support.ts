import { change } from '../db_script';

change(async (db) => {
  await db.changeTable('journal_entries', (t) => ({
    deletedAt: t.add(t.timestamp().nullable()),
    ...t.add(
      t.index(
        [
          'authorUserId',
          {
            column: 'updatedAt',
            order: 'DESC',
          },
        ]
      ),
    ),
  }));

  await db.changeTable('prompts', (t) => ({
    deletedAt: t.add(t.timestamp().nullable()),
    isActive: t.drop(t.boolean().default(t.sql`true`)),
    ...t.add(
      t.index(
        [
          {
            column: 'updatedAt',
            order: 'DESC',
          },
        ]
      ),
    ),
  }));
});
