/**
 * PreBootstrap 插件上下文实现
 */

import type { AppConfig } from '../config/types';
import type { BootstrapExtensionRegistry, LLMProviderFactory, StorageFactory, MemoryFactory, OCRFactory } from '../bootstrap/extensions';
import type { PlatformFactory } from '../platforms/registry';
import type { PreBootstrapContext, PluginLogger } from './types';
import { createLogger } from '../logger';

export class PreBootstrapContextImpl implements PreBootstrapContext {
  constructor(
    private pluginName: string,
    private appConfig: AppConfig,
    private extensions: BootstrapExtensionRegistry,
    private pluginConfig?: Record<string, unknown>,
  ) {}

  getConfig(): Readonly<AppConfig> {
    return this.appConfig;
  }

  mutateConfig(mutator: (config: AppConfig) => void): void {
    mutator(this.appConfig);
  }

  registerLLMProvider(name: string, factory: LLMProviderFactory): void {
    this.extensions.llmProviders.register(name, factory);
  }

  registerStorageProvider(type: string, factory: StorageFactory): void {
    this.extensions.storageProviders.register(type, factory);
  }

  registerMemoryProvider(type: string, factory: MemoryFactory): void {
    this.extensions.memoryProviders.register(type, factory);
  }

  registerOCRProvider(name: string, factory: OCRFactory): void {
    this.extensions.ocrProviders.register(name, factory);
  }

  registerPlatform(name: string, factory: PlatformFactory): void {
    this.extensions.platforms.register(name, factory);
  }

  getExtensions(): BootstrapExtensionRegistry {
    return this.extensions;
  }

  getLogger(tag?: string): PluginLogger {
    const prefix = tag
      ? `Plugin:${this.pluginName}:PreBootstrap:${tag}`
      : `Plugin:${this.pluginName}:PreBootstrap`;
    return createLogger(prefix);
  }

  getPluginConfig<T = Record<string, unknown>>(): T | undefined {
    return this.pluginConfig as T | undefined;
  }
}
