import type { Part } from '../message.js';
import type { ModeDefinition } from '../mode.js';
import type { IrisModelInfoLike } from '../platform.js';
import type { ToolDefinition } from '../tool.js';

export interface ToolRegistryLike {
  register(tool: ToolDefinition): void;
  registerAll(tools: ToolDefinition[]): void;
  unregister?(name: string): boolean;
  get?(name: string): ToolDefinition | undefined;
}

export interface ModeRegistryLike {
  register(mode: ModeDefinition): void;
  registerAll?(modes: ModeDefinition[]): void;
}

export interface LLMRouterLike {
  getCurrentModelInfo?(): IrisModelInfoLike | undefined;
  listModels?(): IrisModelInfoLike[];
  resolve?(modelName: string): unknown;
}

export interface PromptAssemblerLike {
  addSystemPart(part: Part): void;
  removeSystemPart(part: Part): void;
  setSystemPrompt?(prompt: string): void;
}

export interface PluginEventBusLike {
  emit?(event: string, ...args: unknown[]): void;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  off?(event: string, listener: (...args: unknown[]) => void): void;
}

export interface PluginManagerLike {
  listPlugins?(): Array<{ name: string; version?: string; enabled?: boolean }>;
}
