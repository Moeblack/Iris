/**
 * Bash 命令安全分类器 —— 类型定义
 *
 * 与 shell（Windows PowerShell）共享同一套接口，
 * 避免重复定义。
 */

export type {
  CommandSafetyConfig,
  StaticClassification,
  ClassifierResult,
  ShellClassifierConfig,
} from '../shell/types';

/** Bash 工具的依赖接口，与 shell 相同 */
export type { ShellToolDeps as BashToolDeps } from '../shell/types';
