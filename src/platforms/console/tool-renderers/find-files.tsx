/**
 * find_files 工具渲染器 - 极致紧凑版
 */

import React from 'react';
import { Text } from 'ink';
import { ToolRendererProps } from './default.js';

interface FindFilesResult {
  count?: number;
  truncated?: boolean;
}

export function FindFilesRenderer({ result }: ToolRendererProps) {
  const r = (result || {}) as FindFilesResult;
  const count = r.count ?? 0;
  const suffix = r.truncated ? ' (truncated)' : '';

  return (
    <Text dimColor italic>
      {' ↳ '} {count} files found{suffix}
    </Text>
  );
}
