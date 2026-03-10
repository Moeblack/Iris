/**
 * 模式注册表
 *
 * 存储和检索模式定义。纯数据层，不依赖其他业务模块。
 */

import { ModeDefinition } from './types';

export class ModeRegistry {
  private modes = new Map<string, ModeDefinition>();

  /** 注册模式 */
  register(mode: ModeDefinition): void {
    this.modes.set(mode.name, mode);
  }

  /** 批量注册 */
  registerAll(modes: ModeDefinition[]): void {
    for (const mode of modes) {
      this.register(mode);
    }
  }

  /** 获取模式定义 */
  get(name: string): ModeDefinition | undefined {
    return this.modes.get(name);
  }

  /** 列出所有模式名称 */
  list(): string[] {
    return Array.from(this.modes.keys());
  }

  /** 获取所有模式定义 */
  getAll(): ModeDefinition[] {
    return Array.from(this.modes.values());
  }

  /** 已注册模式数量 */
  get size(): number {
    return this.modes.size;
  }
}
