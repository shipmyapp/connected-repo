import { change } from '../db_script';

change(async (db) => {
  await db.changeTable('team_members', (t) => ({
    ...t.drop(t.name('user_id').varchar(26).nullable()),
    ...t.add(t.name('user_id').uuid().nullable()),
    ...t.add(
      t.unique(['userTeamId', 'userId'])
    ),
  }));
});
