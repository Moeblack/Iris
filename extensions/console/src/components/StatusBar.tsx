/** @jsxImportSource @opentui/react */

import React from 'react';
import { C } from '../theme';

interface StatusBarProps {
  agentName?: string;
  modeName?: string;
  modelName: string;
  contextTokens: number;
  contextWindow?: number;
  queueSize?: number;
  /** 当前后台运行中的异步子代理数量 */
  backgroundTaskCount?: number;
  /** 所有后台任务的累计 token 数 */
  backgroundTaskTokens?: number;
}

export function StatusBar({ agentName, modeName, modelName, contextTokens, contextWindow, queueSize, backgroundTaskCount, backgroundTaskTokens }: StatusBarProps) {
  const resolvedModeName = modeName ?? 'normal';
  const modeNameCapitalized = resolvedModeName.charAt(0).toUpperCase() + resolvedModeName.slice(1);
  const contextStr = contextTokens > 0 ? contextTokens.toLocaleString() : '-';
  const contextLimitStr = contextWindow ? `/${contextWindow.toLocaleString()}` : '';
  const contextPercent = contextTokens > 0 && contextWindow
    ? ` (${Math.round(contextTokens / contextWindow * 100)}%)`
    : '';

  return (
    <box flexDirection="row" marginTop={1}>
      <box flexGrow={1}>
        <text>
          {agentName ? <span fg={C.accent}><strong>[{agentName}]</strong></span> : null}
          {agentName ? <span fg={C.dim}> · </span> : null}
          <span fg={C.primaryLight}><strong>{modeNameCapitalized}</strong></span>
          <span fg={C.dim}> · </span>
          <span fg={C.textSec}>{modelName}</span>
          {queueSize != null && queueSize > 0 ? (
            <>
              <span fg={C.dim}> · </span>
              <span fg={C.warn}>{queueSize} 条排队中</span>
            </>
          ) : null}
          {/* 异步子代理后台任务计数：让用户实时知道有多少子代理正在后台运行 */}
          {backgroundTaskCount != null && backgroundTaskCount > 0 ? (
            <>
              <span fg={C.dim}> · </span>
              <span fg={C.accent}>
                {backgroundTaskCount} 个后台任务{backgroundTaskTokens != null && backgroundTaskTokens > 0 ? ` ↑${backgroundTaskTokens.toLocaleString()}tk` : ''}
              </span>
            </>
          ) : null}
        </text>
      </box>
      <box>
        <text fg={C.dim}>ctx {contextStr}{contextLimitStr}{contextPercent}</text>
      </box>
    </box>
  );
}
