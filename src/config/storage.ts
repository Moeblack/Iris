/**
 * 存储配置解析
 */

import { StorageConfig } from './types';
import { sessionsDir, sessionDbPath } from '../paths';
import type { AgentPaths } from '../paths';

export function parseStorageConfig(raw: any = {}, agentPaths?: AgentPaths): StorageConfig {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    ...source,
    type: String(source.type ?? 'json-file'),
    dir: source.dir ?? agentPaths?.sessionsDir ?? sessionsDir,
    dbPath: source.dbPath ?? agentPaths?.sessionDbPath ?? sessionDbPath,
  };
}
