export const DB_UPDATES_CHANNEL = "db-updates";
export const SSE_MESSAGES_CHANNEL = "sse-messages";

export interface DbUpdateMessage {
  table: string;
}

export type SseMessageType = 'SSE_CONNECTED' | 'SSE_HEARTBEAT' | 'SYNC_STATUS_REPLY' | 'NOTIFICATION' | 'SSE_AUTH_ERROR';

export interface SseNotificationPayload {
  message: string;
  level: 'info' | 'success' | 'warning' | 'error';
}

export type SseMessage = 
  | { type: 'SSE_CONNECTED'; payload?: never }
  | { type: 'SSE_HEARTBEAT'; payload?: never }
  | { type: 'SYNC_STATUS_REPLY'; payload?: never }
  | { type: 'NOTIFICATION'; payload: SseNotificationPayload }
  | { type: 'SSE_AUTH_ERROR'; payload?: never };