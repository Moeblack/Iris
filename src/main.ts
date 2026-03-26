/**
 * 统一入口
 *
 * 编译为二进制时使用此文件。根据命令行参数路由到不同模式。
 *
 * 路由规则：
 *   iris                        → 启动平台服务（默认）
 *   iris serve                  → 启动平台服务
 *   iris start                  → 启动平台服务（serve 别名）
 *   iris onboard                → 启动交互式配置引导
 *   iris -p "prompt"            → CLI 模式
 *   iris "prompt"               → CLI 模式
 *   iris --help                 → 显示帮助
 *   iris --version              → 显示版本
 *   iris --sidecar screen       → 内部：运行 screen sidecar 子进程
 *   iris --sidecar browser      → 内部：运行 browser sidecar 子进程
 */

import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const args = process.argv.slice(2);

function spawnAndExit(command: string, forwardedArgs: string[]): never {
  const result = childProcess.spawnSync(command, forwardedArgs, {
    stdio: 'inherit',
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  process.exit(typeof result.status === 'number' ? result.status : 0);
}

function runOnboard(): never {
  const binaryName = process.platform === 'win32' ? 'iris-onboard.exe' : 'iris-onboard';
  const hiddenBinaryName = process.platform === 'win32' ? '.iris-onboard.exe' : '.iris-onboard';
  const execDir = path.dirname(fs.realpathSync(process.execPath));
  const candidates = [
    path.join(execDir, binaryName),
    path.join(execDir, hiddenBinaryName),
  ];

  const onboardBinary = candidates.find((candidate) => fs.existsSync(candidate));
  if (!onboardBinary) {
    console.error('未找到 iris-onboard 二进制，请确认当前发行包已包含 onboard 工具。');
    process.exit(1);
  }

  spawnAndExit(onboardBinary, args.slice(1));
}

if (args[0] === 'onboard') {
  runOnboard();
}

// ============ Sidecar 模式（内部使用） ============
// 编译后的二进制通过 --sidecar 参数自举为 sidecar 子进程，
// 不再依赖外部 node + tsx 加载 .ts 源文件。

const sidecarIndex = args.indexOf('--sidecar');
if (sidecarIndex >= 0) {
  const sidecarType = args[sidecarIndex + 1];
  if (sidecarType === 'screen') {
    await import('./computer-use/screen-sidecar');
  } else if (sidecarType === 'browser') {
    await import('./computer-use/browser-sidecar');
  } else {
    console.error(`未知的 sidecar 类型: ${sidecarType}`);
    process.exit(1);
  }
} else {

  // ============ 正常模式 ============

  const CLI_FLAGS = new Set([
    '-p', '--prompt',
    '-s', '--session',
    '--model', '--agent', '--cwd',
    '--stream', '--no-stream',
    '--output', '--print-tools',
  ]);

  function shouldRunCLI(): boolean {
    if (args.length === 0) return false;
    if (args[0] === 'serve' || args[0] === 'start') return false;

    if (args.includes('-h') || args.includes('--help')) return true;
    if (args.includes('-v') || args.includes('--version')) return true;
    if (args.some(a => CLI_FLAGS.has(a))) return true;
    if (args.some(a => !a.startsWith('-'))) return true;

    return false;
  }

  if (shouldRunCLI()) {
    await import('./cli');
  } else {
    if (args[0] === 'serve' || args[0] === 'start') {
      process.argv.splice(2, 1);
    }
    await import('./index');
  }
}

export {};
