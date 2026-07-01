import { change } from '../db_script';

change(async (db) => {

  await db.changeTable('teams_app', (t) => ({
    personalTeamForUserId: t.add(t.uuid().foreignKey('users', 'id', {
      onUpdate: 'RESTRICT',
      onDelete: 'CASCADE',
    }).nullable()),
  }));

  await db.changeTable('users', (t) => ({
    phoneNumber: t.add(t.string().nullable().unique()),
    phoneNumberVerified: t.add(t.boolean().default(false)),
    activeTeamAppId: t.add(t.string(26).foreignKey('teams_app', 'id', {
      onUpdate: 'RESTRICT',
      onDelete: 'RESTRICT',
    }).nullable()),
    email: t.change(t.varchar(255), t.string().nullable()),
  }));
});

change(async (db) => {
  await db.changeTable('team_members', (t) => ({
    phoneNumber: t.add(t.string().nullable()),
  }));
});