import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  loadEditableModelConfig,
  loadEditableModelRegistry,
  writeEditableModelConfig,
} from '../terminal/src/shared/models/config.js';

const createdDirs: string[] = [];
const originalIrisDataDir = process.env.IRIS_DATA_DIR;

function createTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  createdDirs.push(dir);
  return dir;
}

afterEach(() => {
  process.env.IRIS_DATA_DIR = originalIrisDataDir;
  for (const dir of createdDirs.splice(0, createdDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('terminal models config', () => {
  it('应优先读取 llm.yaml 中 defaultModel 对应的模型配置作为 models 面板初始值', () => {
    const installDir = createTempDir('iris-models-install-');
    const runtimeDataDir = createTempDir('iris-models-runtime-');
    const runtimeConfigDir = path.join(runtimeDataDir, 'configs');
    process.env.IRIS_DATA_DIR = runtimeDataDir;

    fs.mkdirSync(runtimeConfigDir, { recursive: true });
    fs.writeFileSync(path.join(runtimeConfigDir, 'llm.yaml'), [
      'defaultModel: claude_main',
      'models:',
      '  claude_main:',
      '    provider: claude',
      '    apiKey: test-api-key',
      '    model: claude-sonnet-4-20250514',
      '    baseUrl: https://api.anthropic.com/v1',
      '  gemini_flash:',
      '    provider: gemini',
      '    apiKey: another-key',
      '    model: gemini-2.5-flash',
      '    baseUrl: https://generativelanguage.googleapis.com/v1beta',
      '',
    ].join('\n'), 'utf8');

    const editable = loadEditableModelConfig(installDir);

    expect(editable).toEqual({
      provider: 'claude',
      apiKey: 'test-api-key',
      model: 'claude-sonnet-4-20250514',
      baseUrl: 'https://api.anthropic.com/v1',
      modelName: 'claude_main',
    });
  });

  it('应读取模型列表，并标记当前默认模型', () => {
    const installDir = createTempDir('iris-models-install-');
    const runtimeDataDir = createTempDir('iris-models-runtime-');
    const runtimeConfigDir = path.join(runtimeDataDir, 'configs');
    process.env.IRIS_DATA_DIR = runtimeDataDir;

    fs.mkdirSync(runtimeConfigDir, { recursive: true });
    fs.writeFileSync(path.join(runtimeConfigDir, 'llm.yaml'), [
      'defaultModel: gemini_flash',
      'models:',
      '  gemini_flash:',
      '    provider: gemini',
      '    apiKey: gemini-key',
      '    model: gemini-2.5-flash',
      '    baseUrl: https://generativelanguage.googleapis.com/v1beta',
      '  claude_main:',
      '    provider: claude',
      '    apiKey: claude-key',
      '    model: claude-sonnet-4-20250514',
      '    baseUrl: https://api.anthropic.com/v1',
      '',
    ].join('\n'), 'utf8');

    const registry = loadEditableModelRegistry(installDir);

    expect(registry.defaultModelName).toBe('gemini_flash');
    expect(registry.models.map((item) => ({
      originalModelName: item.originalModelName,
      isDefault: item.isDefault,
    }))).toEqual([
      { originalModelName: 'gemini_flash', isDefault: true },
      { originalModelName: 'claude_main', isDefault: false },
    ]);
  });

  it('写入模型配置时应保留其他模型，并在默认模型重命名时同步更新 defaultModel', () => {
    const installDir = createTempDir('iris-models-install-');
    const runtimeDataDir = createTempDir('iris-models-runtime-');
    const runtimeConfigDir = path.join(runtimeDataDir, 'configs');
    process.env.IRIS_DATA_DIR = runtimeDataDir;

    fs.mkdirSync(runtimeConfigDir, { recursive: true });
    fs.writeFileSync(path.join(runtimeConfigDir, 'llm.yaml'), [
      'defaultModel: gemini_flash',
      'rememberPlatformModel: true',
      'models:',
      '  gemini_flash:',
      '    provider: gemini',
      '    apiKey: gemini-key',
      '    model: gemini-2.5-flash',
      '    baseUrl: https://generativelanguage.googleapis.com/v1beta',
      '    supportsVision: true',
      '  claude_main:',
      '    provider: claude',
      '    apiKey: claude-key',
      '    model: claude-sonnet-4-20250514',
      '    baseUrl: https://api.anthropic.com/v1',
      '',
    ].join('\n'), 'utf8');

    writeEditableModelConfig(installDir, {
      originalModelName: 'gemini_flash',
      provider: 'gemini',
      apiKey: 'updated-key',
      model: 'gemini-2.5-pro',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      modelName: 'gemini_pro',
    });

    const nextRegistry = loadEditableModelRegistry(installDir);
    const nextLlmYaml = fs.readFileSync(path.join(runtimeConfigDir, 'llm.yaml'), 'utf8');

    expect(nextRegistry.defaultModelName).toBe('gemini_pro');
    expect(nextRegistry.models.map((item) => item.originalModelName)).toEqual(['claude_main', 'gemini_pro']);
    expect(nextLlmYaml).toContain('rememberPlatformModel: true');
    expect(nextLlmYaml).toContain('supportsVision: true');
    expect(nextLlmYaml).toContain('defaultModel: gemini_pro');
  });
});
