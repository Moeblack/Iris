import type { IrisSessionMetaLike } from '../platform.js';

/** @deprecated 请使用 IrisSessionMetaLike */
export type SessionInfoLike = IrisSessionMetaLike;

/** 类型化存储接口（替代 IrisAPI.storage 的 unknown） */
export interface StorageLike {
  getHistory(sessionId: string): Promise<unknown[]>;
  clearHistory(sessionId: string): Promise<void>;
  truncateHistory(sessionId: string, keepCount: number): Promise<void>;
  listSessions(): Promise<string[]>;
  listSessionMetas(): Promise<SessionInfoLike[]>;
}
