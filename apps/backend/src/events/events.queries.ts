/**
 * Query utilities for pg-tbus task monitoring
 * Provides visibility into pending, active, and failed tasks
 * 
 * Note: pg-tbus maintains internal tables for task state.
 * Direct queries to pg-tbus tables:
 * - pg_tbus_tasks: All tasks with their current state
 * - pg_tbus_events: Event log
 * 
 * This module provides helper functions to query these tables.
 */

import { db } from "@backend/db/db";

/**
 * Query pending tasks from pg-tbus internal tables
 * @param taskName - Optional filter by task name
 * @returns Array of pending task records
 */
export async function queryPendingTasks(taskName?: string) {
	// Query pg_tbus_task_log table for pending tasks
	// This is our audit log that tracks task execution
	const query = db.pgTbusTaskLogs
		.selectAll()
		.where({ status: "pending" });

	if (taskName) {
		return query.where({ taskName });
	}

	return query;
}

/**
 * Query active (currently executing) tasks
 * @param taskName - Optional filter by task name
 */
export async function queryActiveTasks(taskName?: string) {
	const query = db.pgTbusTaskLogs
		.selectAll()
		.where({ status: "active" });

	if (taskName) {
		return query.where({ taskName });
	}

	return query;
}

/**
 * Query failed tasks
 * @param taskName - Optional filter by task name
 * @param since - Optional timestamp to filter recent failures (epoch ms)
 */
export async function queryFailedTasks(taskName?: string, since?: number) {
	let query = db.pgTbusTaskLogs
		.selectAll()
		.where({ status: "failed" });

	if (taskName) {
		query = query.where({ taskName });
	}

	if (since) {
		query = query.where({ createdAt: { gte: new Date(since) } });
	}

	return query;
}

/**
 * Query tasks by entity (subscription, user, etc.)
 * @param entityType - Type of entity (e.g., "subscription")
 * @param entityId - ID of the entity
 */
export async function queryTasksByEntity(entityType: string, entityId: string) {
	return db.pgTbusTaskLogs
		.selectAll()
		.where({
			entityType,
			entityId,
		})
		.order({ createdAt: "DESC" });
}

/**
 * Query tasks for a specific team
 * @param teamApiId - Team API ID
 * @param limit - Maximum number of results (default 100)
 */
export async function queryTasksByTeam(teamApiId: string, limit: number = 100) {
	return db.pgTbusTaskLogs
		.selectAll()
		.where({ teamApiId })
		.order({ createdAt: "DESC" })
		.limit(limit);
}

/**
 * Get task execution statistics
 * @param taskName - Optional filter by task name
 * @param since - Optional timestamp to filter (defaults to last 24 hours, epoch ms)
 */
export async function getTaskStats(
	taskName?: string,
	since: number = Date.now() - 24 * 60 * 60 * 1000
) {
	let query = db.pgTbusTaskLogs.where({ createdAt: { gte: new Date(since) } });

	if (taskName) {
		query = query.where({ taskName });
	}

	const all = await query;

	return {
		total: all.length,
		pending: all.filter(t => t.status === "pending").length,
		active: all.filter(t => t.status === "active").length,
		completed: all.filter(t => t.status === "completed").length,
		failed: all.filter(t => t.status === "failed").length,
		cancelled: all.filter(t => t.status === "cancelled").length,
		successRate: all.length > 0
			? (all.filter(t => t.success === true).length / all.length * 100).toFixed(2) + "%"
			: "N/A",
	};
}

/**
 * Get recent webhook delivery status for a subscription
 * Useful for debugging webhook issues
 * @param subscriptionId - Subscription ID
 */
export async function getSubscriptionWebhookHistory(subscriptionId: string) {
	return db.pgTbusTaskLogs
		.selectAll()
		.where({
			entityType: "subscription",
			entityId: subscriptionId,
			taskName: "subscription.alert_webhook",
		})
		.order({ createdAt: "DESC" })
		.limit(10);
}
