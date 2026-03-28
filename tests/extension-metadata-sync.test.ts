import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { buildExtensionIndex, buildExtensionManifestWithDistribution } from '../src/extension/catalog.js';

const extensionsDir = path.resolve('extensions');

describe('extension metadata sync', () => {
  it('index.json 与各扩展 manifest 的 distribution.files 应与当前目录结构保持一致', () => {
    const indexPath = path.join(extensionsDir, 'index.json');
    const savedIndex = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    const generatedIndex = buildExtensionIndex(extensionsDir);

    expect(savedIndex).toEqual(generatedIndex);

    for (const relativePath of generatedIndex.extensions) {
      const manifestPath = path.join(extensionsDir, relativePath, 'manifest.json');
      const savedManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const generatedManifest = buildExtensionManifestWithDistribution(path.join(extensionsDir, relativePath));
      expect(savedManifest).toEqual(generatedManifest);
    }
  });
});
