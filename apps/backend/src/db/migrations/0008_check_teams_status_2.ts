import { change } from '../db_script';

change(async (db) => {
  await db.changeTable('team_members', (t) => ({
    ...t.add(
      t.unique(['userTeamId', 'email'])
    ),
  }));
});
