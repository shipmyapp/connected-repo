import { change } from '../db_script';

change(async (db) => {
  await db.changeTable('leads', (t) => ({
    contactName: t.change(t.varchar(255), t.string().nullable()),
  }));
});
