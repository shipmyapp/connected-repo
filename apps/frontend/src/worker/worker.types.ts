// ── Entity & Operation Maps ─────────────────────────────────────────

export interface EntityOperationMap {
  journalEntries: {
    query: 'getAll' | 'getById';
    mutation: 'create' | 'delete';
  };
  prompts: {
    query: 'getRandomActive' | 'getAllActive';
    mutation: never;
  };
}

export type EntityName = keyof EntityOperationMap;

// ── Worker Request ──────────────────────────────────────────────────

export interface WorkerInitRequest {
  correlationId: string;
  type: 'init';
  payload: { apiUrl: string };
}

export interface WorkerQueryRequest {
  correlationId: string;
  type: 'query';
  entity: EntityName;
  operation: string;
  payload?: Record<string, unknown>; 
  sortBy?: string;
  descending?: boolean;
  limit?: number;
  offset?: number;
}

export interface WorkerMutationRequest {
  correlationId: string;
  type: 'mutation';
  entity: EntityName;
  operation: string;
  payload?: unknown;
}

export interface WorkerGetPendingRequest {
  correlationId: string;
  type: 'get-pending';
  entity: EntityName;
  sortBy?: string;
  descending?: boolean;
  limit?: number;
  offset?: number;
}

export interface WorkerGetPendingByIdRequest {
  correlationId: string;
  type: 'get-pending-by-id';
  entity: EntityName;
  id: string;
}

export interface WorkerForceSyncRequest {
  correlationId: string;
  type: 'force-sync';
  payload?: { force: boolean };
}

export interface WorkerSyncUpdateRequest {
  correlationId: string;
  type: 'sync-update';
  payload: Record<string, unknown>;
}

export interface WorkerClearCacheRequest {
  correlationId: string;
  type: 'clear-cache';
}

export interface WorkerGetPendingCountRequest {
  correlationId: string;
  type: 'get-pending-count';
}

export interface WorkerGetSyncStatusRequest {
  correlationId: string;
  type: 'get-sync-status';
}

export interface WorkerGetSyncMetaRequest {
  correlationId: string;
  type: 'get-sync-meta';
}

export interface WorkerUpdateUserMetaRequest {
  correlationId: string;
  type: 'update-user-meta';
  payload: { userId: string; userEmail: string };
}

export interface WorkerRelayEventRequest {
  correlationId: string;
  type: 'relay-event';
  payload: { event: string; payload: Record<string, unknown> };
}

export type WorkerRequest =
  | WorkerInitRequest
  | WorkerQueryRequest
  | WorkerMutationRequest
  | WorkerGetPendingRequest
  | WorkerGetPendingByIdRequest
  | WorkerGetPendingCountRequest
  | WorkerGetSyncStatusRequest
  | WorkerGetSyncMetaRequest
  | WorkerUpdateUserMetaRequest
  | WorkerForceSyncRequest
  | WorkerSyncUpdateRequest
  | WorkerClearCacheRequest
  | WorkerRelayEventRequest;

export type WorkerRequestPayload =
  | Omit<WorkerInitRequest, 'correlationId'>
  | Omit<WorkerQueryRequest, 'correlationId'>
  | Omit<WorkerMutationRequest, 'correlationId'>
  | Omit<WorkerGetPendingRequest, 'correlationId'>
  | Omit<WorkerGetPendingByIdRequest, 'correlationId'>
  | Omit<WorkerGetPendingCountRequest, 'correlationId'>
  | Omit<WorkerGetSyncStatusRequest, 'correlationId'>
  | Omit<WorkerGetSyncMetaRequest, 'correlationId'>
  | Omit<WorkerUpdateUserMetaRequest, 'correlationId'>
  | Omit<WorkerForceSyncRequest, 'correlationId'>
  | Omit<WorkerClearCacheRequest, 'correlationId'>;

// ── Worker Response ─────────────────────────────────────────────────

export interface WorkerSuccessResponse {
  correlationId: string;
  type: 'response';
  success: true;
  data: unknown;
  meta: { source: 'server' | 'cache'; total?: number };
}

export interface WorkerErrorResponse {
  correlationId: string;
  type: 'response';
  success: false;
  error: { message: string; code?: string };
}

export type WorkerResponse = WorkerSuccessResponse | WorkerErrorResponse;

// ── Push Events (unsolicited Worker → Main) ─────────────────────────

export interface ConnectivityChangeEvent {
  type: 'push';
  event: 'connectivity-change';
  payload: { isOnline: boolean; isServerReachable: boolean };
}

export interface SyncProgressEvent {
  type: 'push';
  event: 'sync-progress';
  payload: { pending: number; inFlight: number; completed: number; failed: number };
}

export interface SyncCompleteEvent {
  type: 'push';
  event: 'sync-complete';
  payload: { syncedCount: number };
}

export interface SyncErrorEvent {
  type: 'push';
  event: 'sync-error';
  payload: { entryId: string; error: string; retriesLeft: number };
}

export interface TableChangedEvent {
  type: 'push';
  event: 'table-changed';
  payload: { table: string };
}

export interface AuthExpiredEvent {
  type: 'push';
  event: 'auth-expired';
  payload: Record<string, never>;
}

export interface SseStatusChangeEvent {
  type: 'push';
  event: 'sse-status-change';
  payload: { status: 'connected' | 'disconnected' | 'connecting' };
}

export type WorkerPushEvent =
  | ConnectivityChangeEvent
  | SyncProgressEvent
  | SyncCompleteEvent
  | SyncErrorEvent
  | TableChangedEvent
  | AuthExpiredEvent
  | SseStatusChangeEvent;

export type WorkerOutgoing = WorkerResponse | WorkerPushEvent;

// ── Pending Queue Entry ─────────────────────────────────────────────

export interface PendingQueueEntry {
  id: string;
  entity: EntityName;
  operation: string;
  payload: string; // JSON-serialized
  status: 'pending' | 'in-flight' | 'failed';
  retryCount: number;
  createdAt: number;
  nextRetryAt: number;
  tempId?: string; // temporary client-side ID for optimistic entries
}
