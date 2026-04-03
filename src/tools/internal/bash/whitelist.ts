/**
 * Bash 命令白名单 —— Unix/Linux/macOS 平台
 *
 * 四层分类：
 *   1. DENY_PATTERNS  —— 绝对禁止的危险模式（正则匹配）
 *   2. SAFE_COMMANDS   —— 静态只读/安全命令白名单（涵盖 Unix 命令 + 开发工具）
 *   3. RUNTIME_SAFE_COMMANDS —— 运行时动态白名单（安装依赖后 LLM 评估自动添加）
 *   4. 其余 → 'unknown'，交由 AI 分类器判定
 */

import type { CommandSafetyConfig, StaticClassification } from './types';

// ============ 第一层：绝对禁止 ============

/**
 * 无论任何上下文都拒绝执行的危险模式。
 * 匹配到就立即返回 deny，不进后续判定。
 */
const DENY_PATTERNS: { pattern: RegExp; reason: string }[] = [
  // ---- 系统破坏 ----
  { pattern: /\brm\s+(-[a-zA-Z]*[rf][a-zA-Z]*\s+)?\/(\s|$)/, reason: '禁止删除根目录' },
  { pattern: /\brm\s+(-[a-zA-Z]*[rf][a-zA-Z]*\s+)?~\/?(\s|$)/, reason: '禁止删除用户主目录' },
  { pattern: /\brm\s+(-[a-zA-Z]*[rf][a-zA-Z]*\s+)?\/(etc|usr|var|boot|sys|proc)\b/, reason: '禁止删除系统关键目录' },
  { pattern: /\bdd\b.*\bof=\/dev\/[sh]d/i, reason: '禁止直接写入磁盘设备' },
  { pattern: /\bmkfs\b/i, reason: '禁止格式化文件系统' },
  { pattern: /\b(shutdown|reboot|poweroff|halt)\b/i, reason: '禁止系统关机/重启' },
  { pattern: /\binit\s+[06]\b/, reason: '禁止切换运行级别' },

  // ---- 远程代码执行 ----
  { pattern: /\bcurl\b.*\|\s*(ba)?sh\b/i, reason: '禁止 curl | bash 远程代码执行' },
  { pattern: /\bwget\b.*\|\s*(ba)?sh\b/i, reason: '禁止 wget | bash 远程代码执行' },
  { pattern: /\bcurl\b.*\|\s*(python|perl|ruby|node)\b/i, reason: '禁止下载并执行脚本' },
  { pattern: /\bwget\b.*\|\s*(python|perl|ruby|node)\b/i, reason: '禁止下载并执行脚本' },

  // ---- 动态代码执行 ----
  { pattern: /\beval\b/, reason: '禁止 eval 动态代码执行' },

  // ---- 权限提升 ----
  { pattern: /\bsudo\b/, reason: '禁止 sudo 提权' },
  { pattern: /\bsu\s+-/, reason: '禁止 su 切换用户' },
  { pattern: /\bchmod\s+[0-7]*[suSt]/i, reason: '禁止设置 setuid/setgid/sticky bit' },

  // ---- Fork 炸弹 ----
  { pattern: /:\(\)\s*\{[^}]*:\|:/, reason: '禁止 fork 炸弹' },
];

/**
 * 获取命令被拒绝的原因。
 * 如果命令未被拒绝，返回 undefined。
 */
export function getDenyReason(command: string): string | null {
  const trimmed = command.trim();
  for (const { pattern, reason } of DENY_PATTERNS) {
    if (pattern.test(trimmed)) return reason;
  }
  return null;
}

// ============ 第二层：安全白名单 ============

/**
 * 安全命令白名单。
 * key 统一小写，匹配时对第一个 token 做 toLowerCase()。
 *
 * 涵盖范围：
 *   - Unix/Linux 文件系统只读命令
 *   - 文本处理工具
 *   - 系统信息查询
 *   - 网络诊断（只读）
 *   - Shell 内建命令
 *   - 常用开发工具的只读子命令
 */
const SAFE_COMMANDS: Record<string, CommandSafetyConfig> = {
  // =========================================================================
  // 文件系统只读
  // =========================================================================
  'ls': { safe: true },
  'cat': { safe: true },
  'head': { safe: true },
  'tail': { safe: true },
  'wc': { safe: true },
  'stat': { safe: true },
  'file': { safe: true },
  'strings': { safe: true },
  'hexdump': { safe: true },
  'od': { safe: true },
  'nl': { safe: true },
  'base64': { safe: true },
  'readlink': { safe: true },
  'realpath': { safe: true },
  'basename': { safe: true },
  'dirname': { safe: true },
  'tree': { safe: true },
  'less': { safe: true },
  'more': { safe: true },
  'md5sum': { safe: true },
  'sha1sum': { safe: true },
  'sha256sum': { safe: true },
  'sha512sum': { safe: true },

  // =========================================================================
  // 文本处理（只读管道工具）
  // =========================================================================
  'grep': { safe: true },
  'egrep': { safe: true },
  'fgrep': { safe: true },
  'awk': { safe: true },
  'sed': {
    // sed 无 -i 时是只读管道过滤器；sed -i 会就地修改文件
    isDangerous: (args) => args.some(a => /^-[a-zA-Z]*i/.test(a)),
  },
  'sort': { safe: true },
  'uniq': { safe: true },
  'cut': { safe: true },
  'paste': { safe: true },
  'tr': { safe: true },
  'column': { safe: true },
  'tac': { safe: true },
  'rev': { safe: true },
  'fold': { safe: true },
  'expand': { safe: true },
  'unexpand': { safe: true },
  'fmt': { safe: true },
  'comm': { safe: true },
  'cmp': { safe: true },
  'diff': { safe: true },
  'colordiff': { safe: true },
  'numfmt': { safe: true },
  'jq': { safe: true },
  'yq': { safe: true },
  // xargs 可以执行任意命令，安全性取决于目标命令，交由分类器判定
  // 不放入白名单（缺省 → 'unknown' → 分类器）

  // =========================================================================
  // 系统信息（只读）
  // =========================================================================
  'uname': { safe: true },
  'whoami': { safe: true },
  'id': { safe: true },
  'uptime': { safe: true },
  'free': { safe: true },
  'df': { safe: true },
  'du': { safe: true },
  'locale': { safe: true },
  'groups': { safe: true },
  'nproc': { safe: true },
  'arch': { safe: true },
  'cal': { safe: true },
  'date': { safe: true },
  'hostname': { safe: true },
  'env': { safe: true },
  'printenv': { safe: true },
  'lsb_release': { safe: true },
  'lscpu': { safe: true },
  'lsmem': { safe: true },
  'lsblk': { safe: true },
  'lspci': { safe: true },
  'lsusb': { safe: true },
  'dmidecode': { safe: true },
  'getconf': { safe: true },

  // =========================================================================
  // 进程信息（只读）
  // =========================================================================
  'ps': { safe: true },
  'top': {
    // top -b -n 1 批处理模式安全；交互模式可能阻塞
    isDangerous: (args) => !args.some(a => a === '-b'),
  },
  'htop': { safe: false },    // 交互式，不适合非交互执行
  'pgrep': { safe: true },
  'pidof': { safe: true },
  'lsof': { safe: true },

  // =========================================================================
  // 网络诊断（只读）
  // =========================================================================
  'ping': {
    // ping 需要 -c 限制次数，否则无限运行
    isDangerous: (args) => !args.some(a => a === '-c'),
  },
  'traceroute': { safe: true },
  'tracepath': { safe: true },
  'dig': { safe: true },
  'nslookup': { safe: true },
  'host': { safe: true },
  'ss': { safe: true },
  'netstat': { safe: true },
  'ip': {
    // ip addr/link/route/neigh 只读；ip link set 等修改
    safeSubcommands: ['addr', 'address', 'link show', 'route show', 'route list', 'neigh show', 'rule show', '-s link', '-s addr'],
  },
  'ifconfig': {
    // ifconfig 无参数或接口名只读；ifconfig eth0 up/down 修改
    isDangerous: (args) => args.some(a => /^(up|down|add|del|netmask|broadcast|hw|mtu)$/i.test(a)),
  },
  'curl': {
    // curl 只读: GET 请求 + 下载文件（无管道到 sh 的已在 DENY 里）
    // 有 -X POST / -d / --data / -F / --upload-file 视为写操作
    isDangerous: (args) => args.some(a => /^(-X|--request|-d|--data|--data-raw|--data-binary|-F|--form|--upload-file|-T|--delete)$/.test(a)),
  },
  'wget': {
    // wget 下载文件到本地，视为写操作
    isDangerous: () => true,
  },

  // =========================================================================
  // 搜索工具
  // =========================================================================
  'find': {
    // find 只读查找安全；-exec/-delete/-execdir 危险
    isDangerous: (args) => args.some(a => /^(-exec|-execdir|-delete|-ok|-okdir)$/.test(a)),
  },
  'fd': { safe: true },
  'fdfind': { safe: true },
  'rg': { safe: true },         // ripgrep
  'ag': { safe: true },         // the silver searcher
  'ack': { safe: true },
  'locate': { safe: true },
  'mlocate': { safe: true },
  'which': { safe: true },
  'whereis': { safe: true },
  'type': { safe: true },

  // =========================================================================
  // Shell 内建
  // =========================================================================
  'echo': { safe: true },
  'printf': { safe: true },
  'pwd': { safe: true },
  'cd': { safe: true },
  'alias': { safe: true },
  'history': { safe: true },
  'true': { safe: true },
  'false': { safe: true },
  'test': { safe: true },
  '[': { safe: true },           // test 的别名
  'expr': { safe: true },
  'sleep': { safe: true },
  'seq': { safe: true },
  'yes': { safe: false },        // 可能生成无限输出
  'man': { safe: true },
  'help': { safe: true },
  'info': { safe: true },

  // =========================================================================
  // 开发工具 —— 只读子命令
  // =========================================================================
  'git': {
    safeSubcommands: [
      'status', 'log', 'diff', 'show', 'branch', 'tag',
      'remote', 'config', 'rev-parse', 'ls-files', 'ls-tree',
      'blame', 'shortlog', 'describe', 'stash list', 'reflog',
      'rev-list', 'cat-file', 'name-rev', 'for-each-ref',
      'merge-base', 'grep', 'stash show', 'worktree list',
    ],
  },
  'gh': {
    safeSubcommands: [
      'issue list', 'issue view', 'issue status',
      'pr list', 'pr view', 'pr checks', 'pr diff', 'pr status',
      'repo view', 'status',
      'run list', 'run view',
      'auth status',
      'release list', 'release view',
    ],
  },
  'npm': {
    safeSubcommands: [
      'list', 'ls', 'view', 'info', 'show', 'outdated', 'audit',
      'config list', 'config get', 'why', 'explain', 'prefix',
      'root', 'bin', 'pack --dry-run', 'version',
    ],
  },
  'yarn': {
    safeSubcommands: ['list', 'info', 'why', 'config list', 'versions'],
  },
  'pnpm': {
    safeSubcommands: ['list', 'ls', 'why', 'config list', 'outdated', 'audit'],
  },
  'pip': {
    safeSubcommands: ['list', 'show', 'freeze', 'check'],
  },
  'pip3': {
    safeSubcommands: ['list', 'show', 'freeze', 'check'],
  },
  'python': {
    safeSubcommands: ['--version', '-c "import sys; print(sys.version)"'],
  },
  'python3': {
    safeSubcommands: ['--version', '-c "import sys; print(sys.version)"'],
  },
  'node': {
    safeSubcommands: ['--version', '-v', '-e', '-p'],
  },
  'cargo': {
    safeSubcommands: ['metadata', 'tree', 'version', 'check'],
  },
  'go': {
    safeSubcommands: ['list', 'version', 'env', 'doc', 'vet'],
  },
  'dotnet': {
    safeSubcommands: [
      'list', '--info', '--list-sdks', '--list-runtimes', '--version',
    ],
  },
  'docker': {
    safeSubcommands: [
      'ps', 'images', 'info', 'version', 'inspect',
      'logs', 'stats', 'top', 'port', 'network ls',
      'volume ls', 'container ls',
    ],
  },
  'docker-compose': {
    safeSubcommands: ['ps', 'config', 'images', 'version'],
  },
  'podman': {
    safeSubcommands: [
      'ps', 'images', 'info', 'version', 'inspect',
      'logs', 'stats', 'top', 'port',
    ],
  },
  'bun': {
    safeSubcommands: ['--version', 'pm ls', 'pm cache'],
  },
  'deno': {
    safeSubcommands: ['--version', 'info', 'doc', 'lint', 'check', 'types'],
  },
  'rustc': {
    safeSubcommands: ['--version', '--print'],
  },
  'rustup': {
    safeSubcommands: ['show', 'which', 'check', 'component list', 'target list', 'toolchain list'],
  },
  'java': {
    safeSubcommands: ['-version', '--version'],
  },
  'javac': {
    safeSubcommands: ['-version', '--version'],
  },
  'mvn': {
    safeSubcommands: ['--version', '-v', 'dependency:tree', 'dependency:list', 'help:effective-pom'],
  },
  'gradle': {
    safeSubcommands: ['--version', 'dependencies', 'tasks', 'properties', 'projects'],
  },
  'make': {
    safeSubcommands: ['--version', '-n', '--dry-run', '-p'],
  },
  'cmake': {
    safeSubcommands: ['--version', '--help'],
  },
  'kubectl': {
    safeSubcommands: [
      'get', 'describe', 'logs', 'top', 'cluster-info', 'version',
      'api-resources', 'api-versions', 'config view', 'config current-context',
    ],
  },
  'terraform': {
    safeSubcommands: ['version', 'show', 'state list', 'state show', 'output', 'providers', 'validate', 'fmt -check'],
  },
  'az': {
    safeSubcommands: ['--version', 'account show', 'account list', 'group list', 'resource list'],
  },
  'gcloud': {
    safeSubcommands: ['--version', 'info', 'config list', 'auth list', 'projects list', 'compute instances list'],
  },

  // =========================================================================
  // Linux 包管理器 —— 只读查询
  // =========================================================================
  'apt': {
    safeSubcommands: ['list', 'show', 'search', 'depends', 'rdepends', 'policy', 'madison'],
  },
  'apt-cache': { safe: true },
  'dpkg': {
    safeSubcommands: ['-l', '--list', '-L', '--listfiles', '-s', '--status', '-S', '--search', '-p', '--print-avail'],
  },
  'brew': {
    safeSubcommands: ['list', 'info', 'search', 'deps', 'uses', 'outdated', 'config', 'doctor', '--version'],
  },
  'pacman': {
    // pacman -Q 查询已安装；-S 安装
    safeSubcommands: ['-Q', '-Qs', '-Qi', '-Ql', '-Qo', '-Ss', '-Si'],
  },
  'yum': {
    safeSubcommands: ['list', 'info', 'search', 'provides', 'repolist', 'deplist', 'check-update'],
  },
  'dnf': {
    safeSubcommands: ['list', 'info', 'search', 'provides', 'repolist', 'deplist', 'check-update'],
  },
  'snap': {
    safeSubcommands: ['list', 'info', 'find', 'version'],
  },
  'flatpak': {
    safeSubcommands: ['list', 'info', 'search', 'remote-ls'],
  },
};

// ============ 第三层：运行时动态白名单 ============

/**
 * 运行时动态白名单（内存中，重启后清空）。
 */
const RUNTIME_SAFE_COMMANDS = new Map<string, CommandSafetyConfig>();

export function addToRuntimeWhitelist(command: string, config: CommandSafetyConfig): void {
  RUNTIME_SAFE_COMMANDS.set(command.toLowerCase(), config);
}

export function getRuntimeWhitelistSize(): number {
  return RUNTIME_SAFE_COMMANDS.size;
}

export function clearRuntimeWhitelist(): void {
  RUNTIME_SAFE_COMMANDS.clear();
}

// ============ 分类函数 ============

/**
 * 对 bash 命令做静态安全分类。
 *
 * @returns 'allow' 白名单放行 | 'deny' 黑名单拒绝 | 'unknown' 需要分类器判定
 */
export function classifyCommand(command: string): StaticClassification {
  const trimmed = command.trim();
  if (!trimmed) return 'deny';

  // 1. 检查绝对禁止模式
  for (const { pattern } of DENY_PATTERNS) {
    if (pattern.test(trimmed)) return 'deny';
  }

  // 2. 拆分复合语句（; && || | 换行），逐条判定
  const statements = splitStatements(trimmed);

  let hasUnknown = false;
  for (const stmt of statements) {
    const result = classifySingleStatement(stmt);
    if (result === 'deny') return 'deny';
    if (result === 'unknown') hasUnknown = true;
  }

  return hasUnknown ? 'unknown' : 'allow';
}

/**
 * 拆分复合语句。
 * bash 支持 ; && || | 以及换行作为分隔符。
 */
function splitStatements(command: string): string[] {
  return command
    .split(/\s*(?:;|&&|\|\||\||\r?\n)\s*/)
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * 对单条语句做白名单判定。
 */
function classifySingleStatement(stmt: string): StaticClassification {
  // 检查是否有文件重定向（> >> 2> 等）—— 重定向意味着写文件
  // 但排除安全的重定向（>/dev/null, 2>&1, </dev/null）
  const stmtWithoutSafeRedirects = stmt
    .replace(/\s+[12]?>\s*\/dev\/null\b/g, '')
    .replace(/\s+2>&1\b/g, '')
    .replace(/\s+<\s*\/dev\/null\b/g, '');
  if (/(?:^|[^\-])(?:>>?|2>>?)\s*[^&]/.test(stmtWithoutSafeRedirects)) {
    return 'unknown';
  }

  // 提取第一个 token（命令名）
  const tokens = stmt.split(/\s+/);
  const firstToken = tokens[0];
  if (!firstToken) return 'unknown';

  const lowerToken = firstToken.toLowerCase();

  // 查找顺序：静态白名单 > 运行时白名单
  const config = SAFE_COMMANDS[lowerToken]
    ?? RUNTIME_SAFE_COMMANDS.get(lowerToken);
  if (!config) return 'unknown';

  // 无条件安全
  if (config.safe) return 'allow';

  const restArgs = tokens.slice(1);

  // 自定义危险检查
  if (config.isDangerous) {
    return config.isDangerous(restArgs) ? 'unknown' : 'allow';
  }

  // 子命令匹配
  if (config.safeSubcommands) {
    const rest = stmt.slice(firstToken.length).trim();

    // 无子命令 = 该命令本身安全（如 hostname 单独执行）
    if (!rest && config.safeSubcommands.length === 0) return 'allow';

    for (const sub of config.safeSubcommands) {
      if (rest.toLowerCase().startsWith(sub.toLowerCase())) {
        return 'allow';
      }
    }
    return 'unknown';
  }

  // 安全 flag 匹配
  if (config.safeFlags) {
    const allFlagsSafe = restArgs.every(arg => {
      if (!arg.startsWith('-') && !arg.startsWith('/')) return true;
      return config.safeFlags!.some(f => arg.toLowerCase().startsWith(f.toLowerCase()));
    });
    return allFlagsSafe ? 'allow' : 'unknown';
  }

  return 'unknown';
}
