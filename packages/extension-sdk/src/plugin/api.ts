import type { IrisBackendLike } from '../platform.js';
import type {
  BootstrapExtensionRegistryLike,
  PatchMethod,
  PatchPrototype,
} from './types.js';
import type {
  LLMRouterLike,
  ModeRegistryLike,
  PluginEventBusLike,
  PluginManagerLike,
  PromptAssemblerLike,
  ToolRegistryLike,
} from './registry.js';
import type { StorageLike } from './storage.js';
import type { ToolPreviewUtilsLike } from './tool-preview.js';

/** 扩展面板定义（由插件通过 registerWebPanel 注册，宿主 Web UI 动态渲染） */
export interface WebPanelDefinition {
  /** 面板唯一标识 */
  id: string;
  /** 面板显示标题 */
  title: string;
  /** 面板图标名称（Material Symbols 图标名，如 'mouse'），缺省使用 'extension' */
  icon?: string;
  /** 面板内容 URL 路径（由扩展通过 registerWebRoute 提供，宿主用 iframe 加载） */
  contentPath: string;
}

export enum LogLevel { DEBUG = 0, INFO = 1, WARN = 2, ERROR = 3, SILENT = 4 }

export interface MCPServerInfoLike {
  name: string;
  status: string;
  toolCount: number;
  error?: string;
}

export interface MCPManagerLike {
  getServerInfo?(name: string): MCPServerInfoLike | undefined;
  listServers?(): MCPServerInfoLike[];
  getConfig?(): Record<string, unknown>;
  connectAll?(): Promise<void>;
}

export interface ConfigManagerLike {
  getConfigDir(): string;
  readEditableConfig(): Record<string, unknown>;
  updateEditableConfig(updates: Record<string, unknown>): { mergedRaw: Record<string, unknown>; sanitized?: Record<string, unknown> };
  applyRuntimeConfigReload(mergedConfig: Record<string, unknown>): Promise<{ success: boolean; error?: string }>;
  getLLMDefaults(): Record<string, Record<string, unknown>>;
  parseLLMConfig(raw?: Record<string, unknown>): Record<string, unknown>;
  parseSystemConfig(raw?: Record<string, unknown>): Record<string, unknown>;
  parseToolsConfig(raw?: Record<string, unknown>): Record<string, unknown>;
}

export interface AgentDefinitionLike {
  name: string;
  description?: string;
  dataDir?: string;
}

/** 可用模型信息 */
export interface ModelCatalogResultLike {
  provider: string;
  baseUrl: string;
  models: { id: string; displayName?: string }[];
}

/** 扩展管理接口（安装/启用/禁用/删除） */
export interface ExtensionManagerLike {
  listInstalled(): Array<{ name: string; version?: string; enabled?: boolean }>;
  listRemote(): Promise<Array<{ name: string; description?: string }>>;
  install(url: string, options?: Record<string, unknown>): Promise<{ success: boolean; error?: string }>;
  enable(name: string): Promise<{ success: boolean; error?: string }>;
  disable(name: string): Promise<{ success: boolean; error?: string }>;
  remove(name: string): Promise<{ success: boolean; error?: string }>;
  collectPasswordFields?(): string[];
  listPlatformCatalog?(): unknown[];
}

/** Agent 管理接口（CRUD 操作 agents.yaml） */
export interface AgentManagerLike {
  getStatus(): { exists: boolean; enabled: boolean; agents: AgentDefinitionLike[]; manifestPath: string };
  setEnabled(enabled: boolean): { success: boolean; message: string };
  createManifest(): { success: boolean; message: string };
  create(name: string, description?: string): { success: boolean; message: string };
  update(name: string, fields: { description?: string; dataDir?: string }): { success: boolean; message: string };
  delete(name: string): { success: boolean; message: string };
  resetCache(): void;
}

export interface IrisAPI {
  backend: IrisBackendLike;
  router: LLMRouterLike;
  storage: StorageLike;
  /** @deprecated 由 memory 扩展插件通过 monkey-patch 设置，勿直接依赖 */
  memory?: unknown;
  tools: ToolRegistryLike;
  modes: ModeRegistryLike;
  prompt: PromptAssemblerLike;
  config: Readonly<Record<string, unknown>>;
  mcpManager?: MCPManagerLike;
  ocrService?: unknown;
  extensions: BootstrapExtensionRegistryLike;
  pluginManager: PluginManagerLike;
  eventBus: PluginEventBusLike;
  patchMethod: PatchMethod;
  patchPrototype: PatchPrototype;
  registerWebRoute?: (method: string, path: string, handler: (req: any, res: any, params: Record<string, string>) => Promise<void>) => void;
  /** 向 Web 平台注册扩展面板页面。宿主侧边栏会动态展示已注册的面板。 */
  registerWebPanel?: (panel: WebPanelDefinition) => void;
  configManager?: ConfigManagerLike;
  toolPreviewUtils?: ToolPreviewUtilsLike;
  /** @deprecated 未实现，预留接口 */
  estimateTokenCount?(text: string): number;
  isCompiledBinary?: boolean;
  setLogLevel?(level: LogLevel): void;
  getLogLevel?(): LogLevel;
  listAgents?(): AgentDefinitionLike[];
  projectRoot?: string;
  dataDir?: string;
  fetchAvailableModels?(config: { provider: string; apiKey: string; baseUrl?: string }): Promise<ModelCatalogResultLike>;
  extensionManager?: ExtensionManagerLike;
  agentManager?: AgentManagerLike;
}
