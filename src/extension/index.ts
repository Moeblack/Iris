export type {
  ExtensionManifest,
  ExtensionPackage,
  ExtensionPlatformContribution,
  ExtensionPluginContribution,
  ExtensionSource,
  ResolvedLocalPlugin,
  ExtensionInstallFallbackReason,
  InstalledExtensionResult,
} from './types';

export {
  discoverLocalExtensions,
  importLocalExtensionModule,
  registerExtensionPlatforms,
  resolveLocalPluginSource,
} from './registry';

export {
  getRemoteExtensionArchiveUrl,
  installExtension,
  installLocalExtension,
} from './installer';

export type { ExtensionInstallOptions } from './installer';
