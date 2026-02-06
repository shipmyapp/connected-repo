import { change } from '../db_script';

change(async (db) => {
  await db.createEnum('role', ['owner', 'admin', 'user']);
});

change(async (db) => {
  await db.createTable('team_members', (t) => ({
    teamMemberId: t.varchar(26).primaryKey(),
    teamId: t.varchar(26),
    userId: t.varchar(26).nullable(),
    email: t.string(),
    role: t.enum('role'),
    joinedAt: t.timestamp().nullable(),
    createdAt: t.timestamps().createdAt,
    updatedAt: t.timestamps().updatedAt,
  }));
});
