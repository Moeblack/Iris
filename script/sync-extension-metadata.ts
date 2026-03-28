#!/usr/bin/env node

import * as path from 'path';
import { fileURLToPath } from 'url';
import { syncExtensionMetadata } from '../src/extension/catalog';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const extensionsDir = path.join(rootDir, 'extensions');

async function main(): Promise<void> {
  const result = syncExtensionMetadata(extensionsDir);

  console.log(`已生成 ${result.updatedIndexPath}`);
  if (result.updatedManifestPaths.length > 0) {
    console.log(`已更新 ${result.updatedManifestPaths.length} 个扩展 manifest：`);
    for (const manifestPath of result.updatedManifestPaths) {
      console.log(`- ${manifestPath}`);
    }
  } else {
    console.log('所有扩展 manifest 已是最新，无需更新');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
