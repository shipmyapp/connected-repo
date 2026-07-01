import { change } from "../db_script";

change(async (db) => {
	await db.createEnum("theme_setting_enum", ["dark", "light", "system"]);

	await db.createEnum("team_member_role_enum", ["Owner", "Admin", "Member"]);

	await db.createEnum("file_table_name_enum", ["journalEntries"]);

	await db.createEnum("file_type_enum", ["attachment"]);

	await db.createEnum("api_product_enum", ["journal_entry_create"]);

	await db.createEnum("api_request_method_enum", [
		"GET",
		"POST",
		"PUT",
		"DELETE",
	]);

	await db.createEnum("api_status_enum", [
		"AI Error",
		"Invalid API route",
		"No active subscription",
		"Requests exhausted",
		"Pending",
		"Server Error",
		"Success",
	]);

	await db.createEnum("pg_tbus_task_status_enum", [
		"pending",
		"active",
		"completed",
		"failed",
		"cancelled",
	]);

	await db.createTable(
		"prompts",
		(t) => ({
			id: t.string(26).primaryKey(),
			text: t.string(500),
			category: t.string(100).nullable(),
			tags: t.array(t.string()).nullable(),
			deletedAt: t.timestamp().nullable(),
			createdAt: t.timestamps().createdAt,
			updatedAt: t.timestamps().updatedAt,
		}),
		(t) =>
			t.index([
				{
					column: "updatedAt",
					order: "DESC",
				},
			]),
	);

	await db.createTable("teams_api", (t) => ({
		teamApiId: t.string(26).primaryKey(),
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

	await db.createTable(
		"sessions",
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
			t.index([
				"id",
				{
					column: "expiresAt",
					order: "DESC",
				},
				{
					column: "markedInvalidAt",
					order: "DESC",
				},
			]),
	);

	await db.createTable(
		"accounts",
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
		(t) => t.index(["userId"]),
	);

	await db.createTable(
		"verifications",
		(t) => ({
			id: t.string(26).primaryKey(),
			identifier: t.string(),
			value: t.text(),
			expiresAt: t.timestamp(),
			createdAt: t.timestamps().createdAt,
			updatedAt: t.timestamps().updatedAt,
		}),
		(t) => t.index(["identifier"]),
	);

	await db.createTable("users", (t) => ({
		id: t.uuid().primaryKey().default(t.sql`gen_random_uuid()`),
		email: t.string().nullable().unique(),
		emailVerified: t.boolean().default(false),
		name: t.string(),
		image: t.string().nullable(),
		timezone: t.string().default("Etc/UTC"),
		themeSetting: t.enum("theme_setting_enum"),
		journalReminderTimes: t.array(t.string()).default([]),
		phoneNumber: t.string().nullable().unique(),
		phoneNumberVerified: t.boolean().default(false),
		createdAt: t.timestamps().createdAt,
		updatedAt: t.timestamps().updatedAt,
	}));

	await db.createTable(
		"subscriptions",
		(t) => ({
			subscriptionId: t.string(26).primaryKey(),
			expiresAt: t.timestamp(),
			maxRequests: t.integer(),
			apiProductSku: t.enum("api_product_enum"),
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
		(t) => t.index(["teamApiId", "teamUserReferenceId", "apiProductSku"]),
	);

	await db.createTable(
		"api_product_request_logs",
		(t) => ({
			apiProductRequestId: t.string(26).primaryKey(),
			teamApiId: t.uuid(),
			teamUserReferenceId: t.string(),
			requestBodyText: t.text().nullable(),
			requestBodyJson: t.json().nullable(),
			method: t.enum("api_request_method_enum"),
			path: t.string(),
			ip: t.string(),
			status: t.enum("api_status_enum").default("Pending"),
			responseText: t.text().nullable(),
			responseJson: t.json().nullable(),
			responseTime: t.integer(),
			createdAt: t.timestamps().createdAt,
			updatedAt: t.timestamps().updatedAt,
		}),
		(t) =>
			t.index([
				"teamApiId",
				{
					column: "createdAt",
					order: "DESC",
				},
			]),
	);

	await db.createTable(
		"pg_tbus_task_log",
		(t) => ({
			pgTbusTaskLogId: t.string(26).primaryKey(),
			tbusTaskId: t.uuid().nullable(),
			taskName: t.string(),
			queueName: t.string().nullable(),
			entityType: t.string().nullable(),
			entityId: t.string().nullable(),
			teamApiId: t.uuid().nullable(),
			status: t.enum("pg_tbus_task_status_enum"),
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
			t.index(["taskName", "status"]),
			t.index(["entityType", "entityId"]),
			t.index(["teamApiId", "createdAt"]),
			t.index(["tbusTaskId"]),
			t.index(["status", "createdAt"]),
		],
	);

	await db.createTable(
		"teams_app", 
		(t) => ({
			id: t.string(26).primaryKey(),
			name: t.string(),
			logoUrl: t.string().nullable(),
			createdByUserId: t.uuid().foreignKey("users", "id", {
				onUpdate: "RESTRICT",
				onDelete: "CASCADE",
			}),
			personalTeamForUserId: t
				.uuid()
				.foreignKey("users", "id", {
					onUpdate: "RESTRICT",
					onDelete: "CASCADE",
				})
				.nullable(),
			deletedAt: t.timestamp().nullable(),
			createdAt: t.timestamps().createdAt,
			updatedAt: t.timestamps().updatedAt,
		}),
		(t) => [
			t.unique(["personalTeamForUserId"], {
				name: "teams_app_personal_team_for_user_id_idx",
				where: "deleted_at IS NULL AND personal_team_for_user_id IS NOT NULL",
			}),
		]
	);

	await db.changeTable("users", (t) => ({
		activeTeamAppId: t.add(
			t
				.string(26)
				.foreignKey("teams_app", "id", {
					onUpdate: "RESTRICT",
					onDelete: "RESTRICT",
				})
				.nullable(),
		),
	}));

	await db.createTable(
		"journal_entries",
		(t) => ({
			id: t.string(26).primaryKey(),
			prompt: t.string(500).nullable(),
			promptId: t
				.string(26)
				.foreignKey("prompts", "id", {
					onUpdate: "RESTRICT",
					onDelete: "SET NULL",
				})
				.nullable(),
			content: t.text(),
			authorUserId: t.uuid().foreignKey("users", "id", {
				onUpdate: "RESTRICT",
				onDelete: "CASCADE",
			}),
			teamId: t
				.string(26)
				.foreignKey("teams_app", "id", {
					onUpdate: "RESTRICT",
					onDelete: "SET NULL",
				})
				.nullable(),
			deletedAt: t.timestamp().nullable(),
			createdAt: t.timestamps().createdAt,
			updatedAt: t.timestamps().updatedAt,
		}),
		(t) =>
			t.index([
				"authorUserId",
				{
					column: "updatedAt",
					order: "DESC",
				},
			]),
	);

	await db.createTable("team_members", (t) => ({
		id: t.string(26).primaryKey(),
		teamId: t.string(26).foreignKey("teams_app", "id", {
			onUpdate: "RESTRICT",
			onDelete: "CASCADE",
		}),
		userId: t
			.uuid()
			.foreignKey("users", "id", {
				onUpdate: "RESTRICT",
				onDelete: "SET NULL",
			})
			.nullable(),
		email: t.string().nullable(),
		phoneNumber: t.string().nullable(),
		role: t.enum("team_member_role_enum"),
		addedAt: t.timestamp().default(t.sql`NOW()`),
		joinedAt: t.timestamp().nullable(),
		deletedAt: t.timestamp().nullable(),
		createdAt: t.timestamps().createdAt,
		updatedAt: t.timestamps().updatedAt,
	}));

	await db.changeTable("team_members", (t) => ({
		...t.add(
			t.unique(["teamId", "email"], {
				name: "team_members_team_id_email_idx",
				where: "deleted_at IS NULL",
			}),
		),
		...t.add(
			t.unique(["teamId", "phoneNumber"], {
				name: "team_members_team_id_phone_number_idx",
				where: "deleted_at IS NULL",
			}),
		),
		...t.add(
			t.unique(["teamId", "userId"], {
				name: "team_members_team_id_user_id_idx",
				where: "deleted_at IS NULL",
			}),
		),
	}));

	await db.createTable("files", (t) => ({
		id: t.string(26).primaryKey(),
		tableName: t.enum("file_table_name_enum"),
		tableId: t.string(),
		type: t.enum("file_type_enum"),
		fileName: t.string(),
		mimeType: t.string(),
		cdnUrl: t.string().nullable(),
		thumbnailCdnUrl: t.string().nullable(),
		isMainFileLost: t.boolean().default(false),
		createdByUserId: t.uuid().foreignKey("users", "id", {
			onUpdate: "RESTRICT",
			onDelete: "CASCADE",
		}),
		teamId: t
			.string(26)
			.foreignKey("teams_app", "id", {
				onUpdate: "RESTRICT",
				onDelete: "CASCADE",
			})
			.nullable(),
		deletedAt: t.timestamp().nullable(),
		createdAt: t.timestamps().createdAt,
		updatedAt: t.timestamps().updatedAt,
	}));

	await db.addIndex(
		"teams_app",
		["id", { column: "updated_at", order: "DESC" }],
		{ name: "teams_app_sync_delta_idx" },
	);

	await db.addIndex(
		"team_members",
		[
			"team_id",
			{ column: "updated_at", order: "DESC" },
			{ column: "id", order: "DESC" },
		],
		{ name: "team_members_sync_delta_idx" },
	);

	await db.addIndex(
		"prompts",
		[
			{ column: "updated_at", order: "DESC" },
			{ column: "id", order: "DESC" },
		],
		{ name: "prompts_sync_delta_idx" },
	);

	await db.addIndex(
		"journal_entries",
		[
			"team_id",
			{ column: "updated_at", order: "DESC" },
			{ column: "id", order: "DESC" },
		],
		{ name: "journal_entries_sync_delta_idx" },
	);

	await db.addIndex(
		"files",
		[
			"team_id",
			{ column: "updated_at", order: "DESC" },
			{ column: "id", order: "DESC" },
		],
		{ name: "files_sync_delta_idx" },
	);

	await db.createTable("feature_flags", (t) => ({
		id: t.string(26).primaryKey(),
		key: t.string(200),
		scope: t.string(16),
		scopeId: t.string(26).nullable(),
		enabled: t.boolean().default(false),
		notes: t.string(1000).nullable(),
		createdAt: t.timestamps().createdAt,
		updatedAt: t.timestamps().updatedAt,
	}));

	await db.changeTable("feature_flags", (t) => ({
		...t.add(
			t.unique(["key", "scope", "scopeId"], {
				name: "feature_flags_key_scope_scope_id_idx",
				nullsNotDistinct: true,
			}),
		),
	}));

	await db.createTable("rate_limits", (t) => ({
		id: t.string(26).primaryKey(),
		key: t.string(255).unique(),
		tokens: t.doublePrecision(),
		lastUpdatedAt: t.timestamp(),
	}));
});
