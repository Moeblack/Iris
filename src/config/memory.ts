/**
 * 记忆配置解析
 */

import { MemoryConfig } from './types';
import { memoryDbPath } from '../paths';
import type { AgentPaths } from '../paths';

export function parseMemoryConfig(raw: any, agentPaths?: AgentPaths): MemoryConfig {
  if (!raw) return { enabled: false, type: 'sqlite' };
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    ...source,
    enabled: source.enabled ?? false,
    type: typeof source.type === 'string' ? source.type : 'sqlite',
    dbPath: source.dbPath ?? agentPaths?.memoryDbPath ?? memoryDbPath,
  };
}
