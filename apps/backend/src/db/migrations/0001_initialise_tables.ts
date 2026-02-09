import { change } from '../db_script';

change(async (db) => {
  await db.createEnum('theme_setting_enum', ['dark', 'light', 'system']);

  await db.createEnum('api_product_enum', ['journal_entry_create']);

  await db.createEnum('role', ['owner', 'admin', 'user']);

  await db.createEnum('api_request_method_enum', ['GET', 'POST', 'PUT', 'DELETE']);

  await db.createEnum('api_status_enum', ['AI Error', 'Invalid API route', 'No active subscription', 'Requests exhausted', 'Pending', 'Server Error', 'Success']);

  await db.createEnum('pg_tbus_task_status_enum', ['pending', 'active', 'completed', 'failed', 'cancelled']);

  await db.createTable(
    'prompts',
    (t) => ({
      promptId: t.smallint().identity().primaryKey(),
      text: t.string(500),
      category: t.string(100).nullable(),
      tags: t.array(t.string()).nullable(),
      deletedAt: t.timestamp().nullable(),
      createdAt: t.timestamps().createdAt,
      updatedAt: t.timestamps().updatedAt,
    }),
    (t) => 
      t.index(
        [
          {
            column: 'updatedAt',
            order: 'DESC',
          },
        ]
      ),
  );

  await db.createTable(
    'sessions',
    (t) => ({
      id: t.string().primaryKey(),
      token: t.string().unique(),
      userId: t.uuid().nullable(),
      ipAddress: t.string().nullable(),
      userAgent: t.text().nullable(),
      browser: t.string().nullable(),
      os: t.string().nullable(),
      device: t.string().nullable(),
      deviceFingerprint: t.string().nullable(),
      markedInvalidAt: t.timestamp().nullable(),
      expiresAt: t.timestamp(),
      createdAt: t.timestamps().createdAt,
      updatedAt: t.timestamps().updatedAt,
    }),
    (t) => 
      t.index(
        [
          'id',
          {
            column: 'expiresAt',
            order: 'DESC',
          },
          {
            column: 'markedInvalidAt',
            order: 'DESC',
          },
        ]
      ),
  );

  await db.createTable(
    'accounts',
    (t) => ({
      id: t.string().primaryKey(),
      userId: t.uuid(),
      accountId: t.string(),
      providerId: t.string(),
      accessToken: t.text().nullable(),
      refreshToken: t.text().nullable(),
      accessTokenExpiresAt: t.timestamp().nullable(),
      refreshTokenExpiresAt: t.timestamp().nullable(),
      scope: t.text().nullable(),
      idToken: t.text().nullable(),
      password: t.text().nullable(),
      createdAt: t.timestamps().createdAt,
      updatedAt: t.timestamps().updatedAt,
    }),
    (t) => t.index(['userId']),
  );

  await db.createTable(
    'verifications',
    (t) => ({
      identifier: t.string(),
      value: t.text(),
      expiresAt: t.timestamp(),
      createdAt: t.timestamps().createdAt,
      updatedAt: t.timestamps().updatedAt,
    }),
    (t) => t.primaryKey(['identifier', 'value']),
  );

  await db.createTable('teams_api', (t) => ({
    teamApiId: t.uuid().primaryKey().default(t.sql`gen_random_uuid()`),
    allowApiSubsCreationForSkus: t.array(t.string()).default([]),
    allowedDomains: t.array(t.string()),
    allowedIPs: t.array(t.string()),
    apiSecretHash: t.string().select(false),
    name: t.string(),
    rateLimitPerMinute: t.integer(),
    subscriptionAlertWebhookUrl: t.string().nullable(),
    subscriptionAlertWebhookBearerToken: t.string().select(false).nullable(),
    createdAt: t.timestamps().createdAt,
    updatedAt: t.timestamps().updatedAt,
  }));
});

change(async (db) => {
  await db.createTable('users', (t) => ({
    id: t.uuid().primaryKey().default(t.sql`gen_random_uuid()`),
    email: t.string().unique(),
    emailVerified: t.boolean().default(false),
    name: t.string(),
    image: t.string().nullable(),
    timezone: t.string().default('Etc/UTC'),
    themeSetting: t.enum('theme_setting_enum'),
    journalReminderTimes: t.array(t.string()).default([]),
    createdAt: t.timestamps().createdAt,
    updatedAt: t.timestamps().updatedAt,
  }));

  await db.createTable(
    'subscriptions',
    (t) => ({
      subscriptionId: t.string(26).primaryKey(),
      expiresAt: t.timestamp(),
      maxRequests: t.integer(),
      apiProductSku: t.enum('api_product_enum'),
      apiProductQuantity: t.smallint(),
      requestsConsumed: t.integer(),
      teamApiId: t.uuid(),
      teamUserReferenceId: t.string(),
      billingInvoiceNumber: t.string().nullable(),
      billingInvoiceDate: t.timestamp().nullable(),
      notifiedAt90PercentUse: t.timestamp().nullable(),
      paymentReceivedDate: t.timestamp().nullable(),
      paymentTransactionId: t.string().nullable(),
      createdAt: t.timestamps().createdAt,
      updatedAt: t.timestamps().updatedAt,
    }),
    (t) => t.index(['teamApiId', 'teamUserReferenceId', 'apiProductSku']),
  );

  await db.createTable(
    'api_product_request_logs',
    (t) => ({
      apiProductRequestId: t.string(26).primaryKey(),
      teamApiId: t.uuid(),
      teamUserReferenceId: t.string(),
      requestBodyText: t.text().nullable(),
      requestBodyJson: t.json().nullable(),
      method: t.enum('api_request_method_enum'),
      path: t.string(),
      ip: t.string(),
      status: t.enum('api_status_enum').default('Pending'),
      responseText: t.text().nullable(),
      responseJson: t.json().nullable(),
      responseTime: t.integer(),
      createdAt: t.timestamps().createdAt,
      updatedAt: t.timestamps().updatedAt,
    }),
    (t) => 
      t.index(
        [
          'teamApiId',
          {
            column: 'createdAt',
            order: 'DESC',
          },
        ]
      ),
  );

  await db.createTable(
    'pg_tbus_task_log',
    (t) => ({
      pgTbusTaskLogId: t.string(26).primaryKey(),
      tbusTaskId: t.uuid().nullable(),
      taskName: t.string(),
      queueName: t.string().nullable(),
      entityType: t.string().nullable(),
      entityId: t.string().nullable(),
      teamApiId: t.uuid().nullable(),
      status: t.enum('pg_tbus_task_status_enum'),
      attemptNumber: t.integer().default(0),
      scheduledAt: t.timestamp().nullable(),
      startedAt: t.timestamp().nullable(),
      completedAt: t.timestamp().nullable(),
      success: t.boolean().nullable(),
      errorMessage: t.text().nullable(),
      errorCode: t.string().nullable(),
      responseStatusCode: t.integer().nullable(),
      payload: t.json().nullable(),
      response: t.json().nullable(),
      retryLimit: t.integer().nullable(),
      willRetry: t.boolean().nullable(),
      createdAt: t.timestamps().createdAt,
      updatedAt: t.timestamps().updatedAt,
    }),
    (t) => [
      t.index(['taskName', 'status']),
      t.index(['entityType', 'entityId']),
      t.index(['teamApiId', 'createdAt']),
      t.index(['tbusTaskId']),
      t.index(['status', 'createdAt']),
    ],
  );
});

change(async (db) => {
  await db.createTable('teams', (t) => ({
    teamId: t.uuid().primaryKey().default(t.sql`gen_random_uuid()`),
    name: t.string(),
    logoUrl: t.string().nullable(),
    createdByUserId: t.uuid().foreignKey('users', 'id', {
      onUpdate: 'RESTRICT',
      onDelete: 'CASCADE',
    }),
    createdAt: t.timestamps().createdAt,
    updatedAt: t.timestamps().updatedAt,
  }));
});

change(async (db) => {
  await db.createTable(
    'journal_entries',
    (t) => ({
      journalEntryId: t.string(26).primaryKey(),
      prompt: t.string(500).nullable(),
      promptId: t.smallint().foreignKey('prompts', 'promptId', {
        onUpdate: 'RESTRICT',
        onDelete: 'SET NULL',
      }).nullable(),
      content: t.text(),
      authorUserId: t.uuid().foreignKey('users', 'id', {
        onUpdate: 'RESTRICT',
        onDelete: 'CASCADE',
      }),
      teamId: t.uuid().foreignKey('teams', 'teamId', {
        onUpdate: 'RESTRICT',
        onDelete: 'CASCADE',
      }).nullable(),
      attachmentUrls: t.array(t.array(t.string())).default([]),
      deletedAt: t.timestamp().nullable(),
      createdAt: t.timestamps().createdAt,
      updatedAt: t.timestamps().updatedAt,
    }),
    (t) => 
      t.index(
        [
          'authorUserId',
          {
            column: 'updatedAt',
            order: 'DESC',
          },
        ]
      ),
  );

  await db.createTable(
    'team_members',
    (t) => ({
      teamMemberId: t.string(26).primaryKey(),
      teamId: t.uuid().foreignKey('teams', 'teamId', {
        onUpdate: 'RESTRICT',
        onDelete: 'CASCADE',
      }),
      userId: t.uuid().foreignKey('users', 'id', {
        onUpdate: 'RESTRICT',
        onDelete: 'CASCADE',
      }).nullable(),
      email: t.string(),
      role: t.enum('role'),
      joinedAt: t.timestamp().nullable(),
      createdAt: t.timestamps().createdAt,
      updatedAt: t.timestamps().updatedAt,
    }),
    (t) => [
      t.unique(['teamId', 'userId']),
      t.unique(['teamId', 'email']),
    ],
  );
});
