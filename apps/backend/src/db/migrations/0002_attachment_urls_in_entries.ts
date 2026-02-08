import { change } from '../db_script';

change(async (db) => {
  await db.changeTable('journal_entries', (t) => ({
    attachmentUrls: t.add(t.array(t.array(t.string())).default([])),
  }));
});
