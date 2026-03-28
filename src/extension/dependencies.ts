import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../logger';
import type { ExtensionManifest } from './types';

const logger = createLogger('ExtensionDependencies');
const SOURCE_FILE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts']);
const RUNTIME_FILE_EXTENSIONS = new Set(['.mjs', '.js', '.cjs']);

export type ExtensionPackageManager = 'npm' | 'pnpm' | 'bun' | 'yarn';

export interface ExtensionInstallablePackageJson {
  name?: string;
  version?: string;
  private?: boolean;
  type?: string;
  packageManager?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export interface DetectedExtensionPackageManager {
  name: ExtensionPackageManager;
  lockfile?: string;
  executable: string;
}

export interface InstallExtensionDependenciesOptions {
  frozenLockfile?: boolean;
  commandRunner?: (command: string, args: string[], cwd: string) => Promise<void> | void;
}

export interface ExtensionDependencyInstallResult {
  installed: boolean;
  packageManager?: ExtensionPackageManager;
  lockfile?: string;
  frozenLockfile?: boolean;
}

export interface ValidatedInstallableExtensionResult {
  distributionMode: 'bundled';
  runnableEntries: string[];
}

interface RuntimeEntryGroup {
  label: string;
  alternatives: string[];
}

interface RuntimeEntryGroupAnalysis {
  label: string;
  alternatives: string[];
  existingAlternatives: string[];
  runnableAlternatives: string[];
  sourceAlternatives: string[];
  needsBuild: boolean;
}

function defaultCommandRunner(command: string, args: string[], cwd: string): void {
  const result = childProcess.spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.error) {
    throw result.error;
  }

  if (typeof result.status === 'number' && result.status !== 0) {
    throw new Error(`命令执行失败: ${command} ${args.join(' ')} (exit=${result.status})`);
  }
}

function readPackageJson(packageJsonPath: string): ExtensionInstallablePackageJson | undefined {
  if (!fs.existsSync(packageJsonPath)) return undefined;
  return JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as ExtensionInstallablePackageJson;
}

function normalizePathForManifest(input: string | undefined): string | undefined {
  const normalized = String(input ?? '').trim();
  return normalized || undefined;
}

function collectRuntimeEntryGroups(manifest: ExtensionManifest): RuntimeEntryGroup[] {
  const groups: RuntimeEntryGroup[] = [];

  const pluginEntry = normalizePathForManifest(manifest.plugin?.entry)
    ?? normalizePathForManifest(manifest.entry);
  const hasPlatforms = Array.isArray(manifest.platforms) && manifest.platforms.length > 0;

  if (pluginEntry) {
    groups.push({ label: 'plugin', alternatives: [pluginEntry] });
  } else if (!hasPlatforms) {
    groups.push({
      label: 'plugin',
      alternatives: ['index.mjs', 'index.js', 'index.cjs', 'index.ts'],
    });
  }

  for (const platform of manifest.platforms ?? []) {
    const entry = normalizePathForManifest(platform?.entry);
    if (!entry) continue;
    groups.push({ label: `platform:${platform.name}`, alternatives: [entry] });
  }

  return groups;
}

function analyzeRuntimeEntries(extensionDir: string, manifest: ExtensionManifest): RuntimeEntryGroupAnalysis[] {
  return collectRuntimeEntryGroups(manifest).map((group) => {
    const existingAlternatives = group.alternatives.filter((relativePath) => {
      return fs.existsSync(path.resolve(extensionDir, relativePath));
    });

    const runnableAlternatives = existingAlternatives.filter((relativePath) => {
      return RUNTIME_FILE_EXTENSIONS.has(path.extname(relativePath).toLowerCase());
    });

    const sourceAlternatives = existingAlternatives.filter((relativePath) => {
      const ext = path.extname(relativePath).toLowerCase();
      return SOURCE_FILE_EXTENSIONS.has(ext) || /(^|[\\/])src([\\/]|$)/.test(relativePath);
    });

    const needsBuild = runnableAlternatives.length === 0 || sourceAlternatives.length > 0;

    return {
      label: group.label,
      alternatives: group.alternatives,
      existingAlternatives,
      runnableAlternatives,
      sourceAlternatives,
      needsBuild,
    };
  });
}

function describeRuntimeIssues(analyses: RuntimeEntryGroupAnalysis[]): string {
  return analyses
    .filter((item) => item.needsBuild)
    .map((item) => {
      if (item.sourceAlternatives.length > 0) {
        return `${item.label} 使用了源码入口: ${item.sourceAlternatives.join(', ')}`;
      }
      if (item.existingAlternatives.length > 0) {
        return `${item.label} 缺少可运行入口，当前存在: ${item.existingAlternatives.join(', ')}`;
      }
      return `${item.label} 缺少入口文件，期望其一: ${item.alternatives.join(', ')}`;
    })
    .join('；');
}

function detectPackageManagerFromPackageJson(packageJson: ExtensionInstallablePackageJson | undefined): ExtensionPackageManager | undefined {
  const field = packageJson?.packageManager?.trim();
  if (!field) return undefined;
  if (field.startsWith('bun@')) return 'bun';
  if (field.startsWith('pnpm@')) return 'pnpm';
  if (field.startsWith('yarn@')) return 'yarn';
  if (field.startsWith('npm@')) return 'npm';
  return undefined;
}

export function detectExtensionPackageManager(extensionDir: string, packageJson?: ExtensionInstallablePackageJson): DetectedExtensionPackageManager {
  const lockfileCandidates: Array<{ file: string; manager: ExtensionPackageManager }> = [
    { file: 'bun.lock', manager: 'bun' },
    { file: 'bun.lockb', manager: 'bun' },
    { file: 'pnpm-lock.yaml', manager: 'pnpm' },
    { file: 'yarn.lock', manager: 'yarn' },
    { file: 'package-lock.json', manager: 'npm' },
    { file: 'npm-shrinkwrap.json', manager: 'npm' },
  ];

  for (const candidate of lockfileCandidates) {
    const lockfilePath = path.join(extensionDir, candidate.file);
    if (fs.existsSync(lockfilePath)) {
      return {
        name: candidate.manager,
        lockfile: candidate.file,
        executable: candidate.manager,
      };
    }
  }

  const resolvedPackageJson = packageJson ?? readPackageJson(path.join(extensionDir, 'package.json'));
  const fromPackageJson = detectPackageManagerFromPackageJson(resolvedPackageJson);
  if (fromPackageJson) {
    return {
      name: fromPackageJson,
      executable: fromPackageJson,
    };
  }

  return {
    name: 'npm',
    executable: 'npm',
  };
}

function getInstallCommand(manager: DetectedExtensionPackageManager, frozenLockfile: boolean): { command: string; args: string[] } {
  switch (manager.name) {
    case 'bun':
      return { command: manager.executable, args: frozenLockfile ? ['install', '--frozen-lockfile'] : ['install'] };
    case 'pnpm':
      return { command: manager.executable, args: frozenLockfile ? ['install', '--frozen-lockfile'] : ['install'] };
    case 'yarn':
      return { command: manager.executable, args: frozenLockfile ? ['install', '--frozen-lockfile'] : ['install'] };
    case 'npm':
    default:
      return { command: manager.executable, args: frozenLockfile ? ['ci'] : ['install'] };
  }
}

function copyDirectoryWithoutNodeModules(sourceDir: string, targetDir: string): void {
  fs.cpSync(sourceDir, targetDir, {
    recursive: true,
    filter: (sourcePath) => path.basename(sourcePath) !== 'node_modules',
  });
}

export function copyExtensionDirectory(sourceDir: string, targetDir: string): void {
  copyDirectoryWithoutNodeModules(sourceDir, targetDir);
}

export async function installExtensionDependencies(
  extensionDir: string,
  options: InstallExtensionDependenciesOptions = {},
): Promise<ExtensionDependencyInstallResult> {
  const manager = detectExtensionPackageManager(extensionDir);
  const frozenLockfile = options.frozenLockfile === true;
  const installCommand = getInstallCommand(manager, frozenLockfile);
  const runner = options.commandRunner ?? defaultCommandRunner;

  logger.info(`安装 extension 依赖: ${extensionDir} | manager=${manager.name}${manager.lockfile ? ` | lockfile=${manager.lockfile}` : ''}${frozenLockfile ? ' | frozen=true' : ''}`);
  await runner(installCommand.command, installCommand.args, extensionDir);

  return {
    installed: true,
    packageManager: manager.name,
    lockfile: manager.lockfile,
    frozenLockfile,
  };
}

export function assertInstallableExtensionPackage(
  extensionDir: string,
  manifest: ExtensionManifest,
): ValidatedInstallableExtensionResult {
  const analyses = analyzeRuntimeEntries(extensionDir, manifest);
  const issues = analyses.filter((item) => item.needsBuild);

  if (issues.length > 0) {
    throw new Error(`这不是可直接安装的发行包：${describeRuntimeIssues(issues)}`);
  }

  return {
    distributionMode: 'bundled',
    runnableEntries: analyses.flatMap((item) => item.runnableAlternatives),
  };
}
