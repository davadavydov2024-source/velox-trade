/**
 * Типы голосовых звонков. Вынесены в отдельный файл, чтобы не трогать общий types.ts.
 * Состояние звонка лежит в документе чата (messengerChats/{id}.call), пишет только сервер (/api/messenger/call).
 */
export interface ChatCall {
  id: string;
  from: string; // кто звонит
  to: string;
  status: "ringing" | "active" | "ended";
  startedAt: number;
  answeredAt?: number;
  endedAt?: number;
  endReason?: "hangup" | "declined" | "missed" | "busy" | "failed" | "cancelled";
  offer?: string; // SDP звонящего (после завершения удаляется)
  answer?: string; // SDP ответившего
  beat?: Record<string, number>; // «я на линии» от каждой стороны, раз в ~20 с
}

/** Запись о звонке в ленте (сообщение kind: "system"). */
export interface CallLogInfo {
  from: string;
  reason: NonNullable<ChatCall["endReason"]>;
  duration?: number;
}

/** Достаёт текущий звонок из документа чата. */
export const callOf = (chat: unknown): ChatCall | undefined => (chat as { call?: ChatCall } | null | undefined)?.call;

/** Достаёт запись о звонке из сообщения. */
export const callLogOf = (msg: unknown): CallLogInfo | undefined => (msg as { call?: CallLogInfo } | null | undefined)?.call;
