/**
 * 工具防御性参数（全局单例）
 *
 * 各工具 handler 内部通过 getToolLimits() 获取当前配置。
 * bootstrap 阶段通过 setToolLimits() 注入用户配置。
 *
 * 设计：与 process.cwd() 同为工具的隐式全局依赖，保持架构一致。
 */

// ─── 各工具限制类型 ───

export interface ReadFileLimits {
  /** 单次调用最多读取文件数 */
  maxFiles: number;
  /** 单文件最大字节数 */
  maxFileSizeBytes: number;
  /** 所有文件格式化后的总输出最大字符数 */
  maxTotalOutputChars: number;
}

export interface SearchInFilesLimits {
  /** 最大匹配结果数（search 模式） */
  maxResults: number;
  /** 最大处理文件数（replace 模式） */
  maxFiles: number;
  /** 每条匹配的上下文行数 */
  contextLines: number;
  /** 单文件最大字节数 */
  maxFileSizeBytes: number;
  /** 搜索结果中单行最大展示字符数 */
  maxLineDisplayChars: number;
  /** 匹配文本最大展示字符数 */
  maxMatchDisplayChars: number;
}

export interface ListFilesLimits {
  /** 递归列出最大条目数 */
  maxEntries: number;
}

export interface FindFilesLimits {
  /** 每 pattern 最大结果数 */
  maxResults: number;
}

export interface ShellLimits {
  /** 默认超时（毫秒） */
  defaultTimeout: number;
  /** 输出最大字符数 */
  maxOutputChars: number;
  /** exec maxBuffer 字节数 */
  maxBuffer: number;
}

export interface ToolLimitsConfig {
  read_file: ReadFileLimits;
  search_in_files: SearchInFilesLimits;
  list_files: ListFilesLimits;
  find_files: FindFilesLimits;
  shell: ShellLimits;
}

// ─── 默认值 ───

export const DEFAULT_TOOL_LIMITS: ToolLimitsConfig = {
  read_file: {
    maxFiles: 10,
    maxFileSizeBytes: 2 * 1024 * 1024,       // 2MB
    maxTotalOutputChars: 200_000,
  },
  search_in_files: {
    maxResults: 100,
    maxFiles: 50,
    contextLines: 2,
    maxFileSizeBytes: 2 * 1024 * 1024,       // 2MB
    maxLineDisplayChars: 500,
    maxMatchDisplayChars: 200,
  },
  list_files: {
    maxEntries: 2000,
  },
  find_files: {
    maxResults: 500,
  },
  shell: {
    defaultTimeout: 30_000,
    maxOutputChars: 50_000,
    maxBuffer: 10 * 1024 * 1024,             // 10MB
  },
};

// ─── 全局单例 ───

let _limits: ToolLimitsConfig = DEFAULT_TOOL_LIMITS;

/** bootstrap 阶段调用，注入用户配置 */
export function setToolLimits(config: Partial<ToolLimitsConfig> | undefined): void {
  if (!config) {
    _limits = DEFAULT_TOOL_LIMITS;
    return;
  }
  // 按工具逐层合并，缺省字段回退默认值
  _limits = {
    read_file: { ...DEFAULT_TOOL_LIMITS.read_file, ...config.read_file },
    search_in_files: { ...DEFAULT_TOOL_LIMITS.search_in_files, ...config.search_in_files },
    list_files: { ...DEFAULT_TOOL_LIMITS.list_files, ...config.list_files },
    find_files: { ...DEFAULT_TOOL_LIMITS.find_files, ...config.find_files },
    shell: { ...DEFAULT_TOOL_LIMITS.shell, ...config.shell },
  };
}

/** 各工具 handler 内部调用 */
export function getToolLimits(): ToolLimitsConfig {
  return _limits;
}
