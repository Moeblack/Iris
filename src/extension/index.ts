export type {
  ExtensionManifest,
  ExtensionPackage,
  ExtensionPlatformContribution,
  ExtensionPluginContribution,
  ExtensionSource,
  ResolvedLocalPlugin,
  ExtensionInstallFallbackReason,
  ExtensionDistributionMode,
  InstalledExtensionResult,
} from './types';

export {
  discoverLocalExtensions,
  importLocalExtensionModule,
  registerExtensionPlatforms,
  resolveLocalPluginSource,
} from './registry';

export {
  getRemoteExtensionIndexUrl,
  installExtension,
  installLocalExtension,
} from './installer';

export type { ExtensionInstallOptions } from './installer';
