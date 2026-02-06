import { change } from '../db_script';

change(async (db) => {
  await db.createTable(
    'leads',
    (t) => ({
      leadId: t.string(26).primaryKey(),
      contactName: t.string(),
      companyName: t.string().nullable(),
      jobTitle: t.string().nullable(),
      email: t.string().nullable(),
      phone: t.string(15).nullable(),
      website: t.string().nullable(),
      address: t.text().nullable(),
      notes: t.text().nullable(),
      capturedByUserId: t.uuid().foreignKey('users', 'id', {
        onUpdate: 'RESTRICT',
        onDelete: 'CASCADE',
      }),
      teamId: t.uuid().foreignKey('teams', 'teamId', {
        onUpdate: 'RESTRICT',
        onDelete: 'CASCADE',
      }).nullable(),
      deletedAt: t.timestamp().nullable(),
      createdAt: t.timestamps().createdAt,
      updatedAt: t.timestamps().updatedAt,
    }),
    (t) => [
      t.index(
        [
          'capturedByUserId',
          {
            column: 'updatedAt',
            order: 'DESC',
          },
        ]
      ),
      t.index(
        [
          'teamId',
          {
            column: 'updatedAt',
            order: 'DESC',
          },
        ]
      ),
      t.index(
        [
          {
            column: 'deletedAt',
            order: 'DESC',
          },
        ]
      ),
    ],
  );
});
