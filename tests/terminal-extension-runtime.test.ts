import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  deleteInstalledExtension,
  disableInstalledExtension,
  enableInstalledExtension,
  installRemoteExtension,
  listRemoteExtensions,
  loadInstalledExtensions,
} from '../terminal/src/shared/extensions/runtime.js';

const createdDirs: string[] = [];
const originalIrisDataDir = process.env.IRIS_DATA_DIR;
const originalRemoteIndexUrl = process.env.IRIS_EXTENSION_REMOTE_INDEX_URL;
const originalRemoteRawBaseUrl = process.env.IRIS_EXTENSION_REMOTE_RAW_BASE_URL;

function createTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  createdDirs.push(dir);
  return dir;
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function textResponse(value: string): Response {
  return new Response(value, { status: 200 });
}

function mockFetchWithMap(map: Record<string, Response>) {
  const fetchMock = vi.fn(async (input: any) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : String(input?.url ?? input);
    return map[url] ?? new Response('not found', { status: 404, statusText: 'Not Found' });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  process.env.IRIS_DATA_DIR = originalIrisDataDir;
  process.env.IRIS_EXTENSION_REMOTE_INDEX_URL = originalRemoteIndexUrl;
  process.env.IRIS_EXTENSION_REMOTE_RAW_BASE_URL = originalRemoteRawBaseUrl;
  for (const dir of createdDirs.splice(0, createdDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('terminal extension runtime', () => {
  it('应从远程 index 与各扩展 manifest 读取 extension 列表，并兼容已安装与源码内嵌版本提示', async () => {
    const runtimeDataDir = createTempDir('iris-terminal-extension-runtime-');
    const installDir = createTempDir('iris-terminal-extension-install-');
    const remoteIndexUrl = 'https://example.com/extensions/index.json';
    const remoteRawBaseUrl = 'https://example.com/raw';
    process.env.IRIS_DATA_DIR = runtimeDataDir;
    process.env.IRIS_EXTENSION_REMOTE_INDEX_URL = remoteIndexUrl;
    process.env.IRIS_EXTENSION_REMOTE_RAW_BASE_URL = remoteRawBaseUrl;

    fs.mkdirSync(path.join(runtimeDataDir, 'extensions', 'telegram', 'dist'), { recursive: true });
    fs.writeFileSync(path.join(runtimeDataDir, 'extensions', 'telegram', 'manifest.json'), JSON.stringify({
      name: 'telegram',
      version: '0.0.8',
      description: 'Installed telegram',
      platforms: [{ name: 'telegram', entry: 'dist/index.mjs' }],
    }, null, 2), 'utf8');
    fs.writeFileSync(path.join(runtimeDataDir, 'extensions', 'telegram', 'dist', 'index.mjs'), 'export default {};\n', 'utf8');

    fs.mkdirSync(path.join(installDir, 'extensions', 'telegram', 'dist'), { recursive: true });
    fs.mkdirSync(path.join(installDir, 'extensions', 'demo-plugin'), { recursive: true });
    fs.writeFileSync(path.join(installDir, 'extensions', 'embedded.json'), JSON.stringify({
      extensions: [
        { name: 'telegram' },
        { name: 'demo-plugin' },
      ],
    }, null, 2), 'utf8');
    fs.writeFileSync(path.join(installDir, 'extensions', 'telegram', 'manifest.json'), JSON.stringify({
      name: 'telegram',
      version: '0.0.7',
      description: 'Embedded telegram',
      platforms: [{ name: 'telegram', entry: 'dist/index.mjs' }],
    }, null, 2), 'utf8');
    fs.writeFileSync(path.join(installDir, 'extensions', 'telegram', 'dist', 'index.mjs'), 'export default {};\n', 'utf8');
    fs.writeFileSync(path.join(installDir, 'extensions', 'demo-plugin', 'manifest.json'), JSON.stringify({
      name: 'demo-plugin',
      version: '0.5.0',
      description: 'Embedded demo plugin',
      plugin: { entry: 'index.mjs' },
    }, null, 2), 'utf8');
    fs.writeFileSync(path.join(installDir, 'extensions', 'demo-plugin', 'index.mjs'), 'export default {};\n', 'utf8');

    const fetchMock = mockFetchWithMap({
      [remoteIndexUrl]: jsonResponse({
        extensions: ['telegram', 'demo-plugin'],
      }),
      [`${remoteRawBaseUrl}/extensions/telegram/manifest.json`]: textResponse(JSON.stringify({
        name: 'telegram',
        version: '0.1.0',
        description: 'Telegram platform extension for Iris',
        platforms: [{ name: 'telegram', entry: 'dist/index.mjs' }],
        distribution: { files: ['dist/index.mjs', 'package.json'] },
      })),
      [`${remoteRawBaseUrl}/extensions/demo-plugin/manifest.json`]: textResponse(JSON.stringify({
        name: 'demo-plugin',
        version: '1.0.0',
        description: 'Demo plugin extension',
        plugin: { entry: 'index.mjs' },
        distribution: { files: ['index.mjs', 'package.json'] },
      })),
    });

    const items = await listRemoteExtensions(installDir);
    const calledUrls = fetchMock.mock.calls.map((call) => String(call[0]));

    expect(items.map((item) => ({
      requestedPath: item.requestedPath,
      name: item.name,
      typeLabel: item.typeLabel,
      typeDetail: item.typeDetail,
      localVersionHint: item.localVersionHint,
    }))).toEqual([
      {
        requestedPath: 'demo-plugin',
        name: 'demo-plugin',
        typeLabel: '插件',
        typeDetail: '只包含插件入口。',
        localVersionHint: '本地已有版本 0.5.0（源码内嵌）',
      },
      {
        requestedPath: 'telegram',
        name: 'telegram',
        typeLabel: '平台',
        typeDetail: '只包含平台贡献，共 1 个平台。',
        localVersionHint: '本地已有版本 0.0.8（已安装，运行时优先于源码内嵌）',
      },
    ]);
    expect(calledUrls).toContain(remoteIndexUrl);
    expect(calledUrls).toContain(`${remoteRawBaseUrl}/extensions/telegram/manifest.json`);
    expect(calledUrls).toContain(`${remoteRawBaseUrl}/extensions/demo-plugin/manifest.json`);
  });

  it('应按远程 index 与 manifest.distribution.files 只下载所选 extension 文件夹，并对已安装 extension 执行开启、关闭、删除', async () => {
    const runtimeDataDir = createTempDir('iris-terminal-extension-runtime-');
    const runtimeExtensionsDir = path.join(runtimeDataDir, 'extensions');
    const runtimeConfigDir = path.join(runtimeDataDir, 'configs');
    const remoteIndexUrl = 'https://example.com/extensions/index.json';
    const remoteRawBaseUrl = 'https://example.com/raw';
    process.env.IRIS_DATA_DIR = runtimeDataDir;
    process.env.IRIS_EXTENSION_REMOTE_INDEX_URL = remoteIndexUrl;
    process.env.IRIS_EXTENSION_REMOTE_RAW_BASE_URL = remoteRawBaseUrl;

    const fetchMock = mockFetchWithMap({
      [remoteIndexUrl]: jsonResponse({
        extensions: ['community/demo-extension', 'another-extension'],
      }),
      [`${remoteRawBaseUrl}/extensions/community/demo-extension/manifest.json`]: textResponse(JSON.stringify({
        name: 'demo-extension',
        version: '0.2.0',
        description: 'Demo extension',
        plugin: { entry: 'index.mjs' },
        distribution: { files: ['index.mjs'] },
      })),
      [`${remoteRawBaseUrl}/extensions/community/demo-extension/index.mjs`]: textResponse('export default {};\n'),
    });

    const installed = await installRemoteExtension('community/demo-extension');
    const calledUrls = fetchMock.mock.calls.map((call) => String(call[0]));

    expect(fs.existsSync(path.join(runtimeExtensionsDir, 'demo-extension', 'manifest.json'))).toBe(true);
    expect(fs.existsSync(path.join(runtimeExtensionsDir, 'demo-extension', 'index.mjs'))).toBe(true);
    expect(installed.name).toBe('demo-extension');
    expect(installed.stateLabel).toBe('未启用');
    expect(installed.statusDetail).toContain('只包含插件入口');
    expect(calledUrls.some((url) => url.includes('another-extension') && url !== remoteIndexUrl)).toBe(false);

    enableInstalledExtension(installed);
    let loaded = loadInstalledExtensions();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].enabled).toBe(true);
    expect(loaded[0].stateLabel).toBe('已开启');
    expect(loaded[0].statusDetail).toBe('插件入口已启用。');
    expect(fs.readFileSync(path.join(runtimeConfigDir, 'plugins.yaml'), 'utf8')).toContain('name: demo-extension');
    expect(fs.readFileSync(path.join(runtimeConfigDir, 'plugins.yaml'), 'utf8')).toContain('enabled: true');

    disableInstalledExtension(loaded[0]);
    loaded = loadInstalledExtensions();
    expect(loaded[0].enabled).toBe(false);
    expect(loaded[0].stateLabel).toBe('已关闭');
    expect(loaded[0].statusDetail).toContain('本地禁用标记');
    expect(fs.existsSync(path.join(runtimeExtensionsDir, 'demo-extension', '.disabled'))).toBe(true);
    expect(fs.readFileSync(path.join(runtimeConfigDir, 'plugins.yaml'), 'utf8')).toContain('enabled: false');

    deleteInstalledExtension(loaded[0]);
    expect(loadInstalledExtensions()).toEqual([]);
    expect(fs.existsSync(path.join(runtimeExtensionsDir, 'demo-extension'))).toBe(false);
    expect(fs.readFileSync(path.join(runtimeConfigDir, 'plugins.yaml'), 'utf8')).not.toContain('demo-extension');
  });
});
