import { change } from '../db_script';

change(async (db) => {
  await db.changeTable('user_teams', (t) => ({
    ...t.drop(t.name('created_by_user_id').varchar(26)),
    ...t.add(t.name('created_by_user_id').uuid()),
  }));
});
