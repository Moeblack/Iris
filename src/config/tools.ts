/**
 * 工具配置解析
 */

import { ToolsConfig, ToolPolicyConfig } from './types';
import { ToolLimitsConfig } from '../tools/tool-limits';

function parsePatternList(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const patterns = raw
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map(s => s.trim());
  return patterns.length > 0 ? patterns : undefined;
}

function normalizeToolPolicy(raw: unknown): ToolPolicyConfig | undefined {
  if (typeof raw === 'boolean') {
    return { autoApprove: raw };
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined;
  }

  const record = raw as Record<string, unknown>;
  const policy: ToolPolicyConfig = {
    autoApprove: record.autoApprove === true,
  };

  if (typeof record.showApprovalView === 'boolean') policy.showApprovalView = record.showApprovalView;

  const allow = parsePatternList(record.allowPatterns);
  if (allow) policy.allowPatterns = allow;

  const deny = parsePatternList(record.denyPatterns);
  if (deny) policy.denyPatterns = deny;

  // Shell 专用：AI 安全分类器
  const classifier = parseClassifierConfig(record.classifier);
  if (classifier) policy.classifier = classifier;

  return policy;
}

function parseClassifierConfig(raw: unknown): ToolPolicyConfig['classifier'] | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const obj = raw as Record<string, unknown>;

  // enabled 必须显式为 true 才启用
  if (obj.enabled !== true) return undefined;

  const config: NonNullable<ToolPolicyConfig['classifier']> = { enabled: true };
  if (typeof obj.model === 'string' && obj.model.trim()) config.model = obj.model.trim();
  if (typeof obj.confidenceThreshold === 'number' && obj.confidenceThreshold > 0 && obj.confidenceThreshold <= 1) {
    config.confidenceThreshold = obj.confidenceThreshold;
  }
  if (obj.fallbackPolicy === 'deny' || obj.fallbackPolicy === 'allow') {
    config.fallbackPolicy = obj.fallbackPolicy;
  }
  if (typeof obj.timeout === 'number' && obj.timeout > 0) {
    config.timeout = obj.timeout;
  }
  if (typeof obj.autoLearn === 'boolean') {
    config.autoLearn = obj.autoLearn;
  }
  return config;
}

function parsePositiveNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
  return value;
}

function parseLimitsSection(raw: unknown): Partial<ToolLimitsConfig> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const obj = raw as Record<string, unknown>;

  const pick = (section: unknown): Record<string, number> | undefined => {
    if (!section || typeof section !== 'object' || Array.isArray(section)) return undefined;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(section as Record<string, unknown>)) {
      const n = parsePositiveNumber(v);
      if (n !== undefined) out[k] = n;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  };

  const limits: Partial<ToolLimitsConfig> = {};
  if (pick(obj.read_file)) limits.read_file = pick(obj.read_file) as any;
  if (pick(obj.search_in_files)) limits.search_in_files = pick(obj.search_in_files) as any;
  if (pick(obj.list_files)) limits.list_files = pick(obj.list_files) as any;
  if (pick(obj.find_files)) limits.find_files = pick(obj.find_files) as any;
  if (pick(obj.shell)) limits.shell = pick(obj.shell) as any;
  return Object.keys(limits).length > 0 ? limits : undefined;
}

export function parseToolsConfig(raw: any): ToolsConfig {
  const permissions: Record<string, ToolPolicyConfig> = {};

  const globalConfig: Pick<ToolsConfig, 'autoApproveAll' | 'autoApproveConfirmation' | 'autoApproveDiff' | 'limits'> = {};

  // 保留字段名集合（全局开关，不作为工具名解析）
  const RESERVED_KEYS = new Set(['autoApproveAll', 'autoApproveConfirmation', 'autoApproveDiff', 'limits', 'disabledTools']);

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { permissions };
  }

  if (raw.autoApproveAll === true) globalConfig.autoApproveAll = true;
  if (raw.autoApproveConfirmation === true) globalConfig.autoApproveConfirmation = true;
  if (raw.autoApproveDiff === true) globalConfig.autoApproveDiff = true;

  const limits = parseLimitsSection(raw.limits);
  if (limits) globalConfig.limits = limits;

  for (const [toolName, value] of Object.entries(raw as Record<string, unknown>)) {
    if (RESERVED_KEYS.has(toolName)) continue;
    const policy = normalizeToolPolicy(value);
    if (!policy) continue;
    permissions[toolName] = policy;
  }

  const disabledTools = Array.isArray(raw.disabledTools)
    ? raw.disabledTools.filter((s: unknown): s is string => typeof s === 'string' && s.trim().length > 0)
    : undefined;

  return { ...globalConfig, permissions, ...(disabledTools && disabledTools.length > 0 ? { disabledTools } : {}) };
}
