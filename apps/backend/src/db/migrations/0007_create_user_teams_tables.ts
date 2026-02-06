import { change } from '../db_script';

change(async (db) => {
  await db.createTable('user_teams', (t) => ({
    userTeamId: t.varchar(26).primaryKey(),
    name: t.string(),
    logoUrl: t.string().nullable(),
    createdByUserId: t.varchar(26),
    createdAt: t.timestamps().createdAt,
    updatedAt: t.timestamps().updatedAt,
    deletedAt: t.timestamp().nullable(),
  }));

  await db.changeTable('team_members', (t) => ({
    userTeamId: t.add(t.varchar(26)),
    teamId: t.drop(t.varchar(26)),
    ...t.add(
      t.unique(['userTeamId', 'userId'])
    ),
  }));
});

change(async (db) => {
  await db.changeTable('leads', (t) => ({
    userTeamId: t.add(t.varchar(26).foreignKey('user_teams', 'userTeamId', {
      onUpdate: 'RESTRICT',
      onDelete: 'CASCADE',
    }).nullable()),
    teamId: t.drop(t.uuid().foreignKey('teams', 'team_id', {
      onUpdate: 'RESTRICT',
      onDelete: 'CASCADE',
    }).nullable()),
    ...t.add(
      t.index(
        [
          'userTeamId',
          {
            column: 'updatedAt',
            order: 'DESC',
          },
        ]
      ),
    ),
  }));
});
