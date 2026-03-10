/**
 * 模式类型定义
 *
 * 模式是一组命名的运行时配置，包含提示词和工具策略。
 * 不同模式下，同一个 AI 会表现出不同的行为和能力范围。
 */

/** 工具过滤规则：白名单和黑名单互斥，白名单优先 */
export interface ToolFilter {
  /** 白名单：仅允许这些工具（优先于 exclude） */
  include?: string[];
  /**黑名单：排除这些工具 */
  exclude?: string[];
}

/** 模式定义 */
export interface ModeDefinition {
  /** 模式名称（唯一标识） */
  name: string;
  /** 模式描述（供人类和 LLM 了解用途） */
  description?: string;
  /** 该模式的系统提示词（覆盖默认提示词） */
  systemPrompt?: string;
  /** 工具过滤规则（未设置则使用全部工具） */
  tools?: ToolFilter;
}
