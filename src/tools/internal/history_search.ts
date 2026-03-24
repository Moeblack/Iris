/**
 * 历史搜索工具
 *
 * 将完整对话历史格式化为带行号的"虚拟文档"，
 * AI 可通过 search + read 两种模式检索对话内容：
 *
 * - search: 关键词/正则搜索，返回匹配行号和上下文
 * - read:   按行号范围读取格式化后的历史内容
 *
 * 格式化后的文档样例：
 * ```
 *    1 | ══ Round 1 (L1-L13) ══════════
 *    2 | 👤 User:
 *    3 | 帮我实现一个 WebSocket 连接
 *    4 |
 *    5 | 🤖 Model:
 *    6 | 好的，我来帮你实现...
 * ```
 *
 * 数据来源：StorageProvider.getHistory() 获取完整历史。
 * searchScope 为 'summarized' 时仅检索被压缩（isSummary 之前）的消息。
 */

import { ToolDefinition } from '../../types';
import type { Content, Part } from '../../types/message';
import { isFunctionCallPart, isFunctionResponsePart } from '../../types/message';
import type { StorageProvider } from '../../storage/base';

// ─── 默认常量 ───────────────────────────────────────────

const DEFAULT_CONFIG = {
  /** 搜索范围：'all' = 全部历史，'summarized' = 仅被压缩的历史 */
  searchScope: 'all' as 'all' | 'summarized',
  /** search 模式最大匹配数 */
  maxSearchMatches: 100,
  /** search 模式每个匹配的上下文行数 */
  searchContextLines: 3,
  /** read 模式单次最大读取行数 */
  maxReadLines: 300,
  /** 结果字符数上限 */
  maxResultChars: 50_000,
  /** 多行读取时单行显示字符限制 */
  lineDisplayLimit: 500,
};

type RuntimeConfig = typeof DEFAULT_CONFIG;

// ─── 格式化引擎 ─────────────────────────────────────────

/** 查找历史中最后一个总结消息的索引 */
function findLastSummaryIndex(history: Content[]): number {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].isSummary) return i;
  }
  return -1;
}

/** 提取被总结覆盖的消息（总结之前的消息） */
function getSummarizedMessages(history: Content[]): Content[] {
  const idx = findLastSummaryIndex(history);
  return idx < 0 ? [] : history.slice(0, idx);
}

/** 获取消息的类型标签 */
function getMessageTypeTag(parts: Part[]): string {
  if (parts.some(p => isFunctionCallPart(p))) return ' [tool_call]';
  if (parts.some(p => isFunctionResponsePart(p))) return ' [tool_result]';
  return '';
}

/** 判断消息是否整体为工具响应（所有 part 都是 functionResponse） */
function isToolResponseContent(content: Content): boolean {
  return content.parts.length > 0 && content.parts.every(p => isFunctionResponsePart(p));
}

/** 将单条消息格式化为文本行数组 */
function formatMessage(content: Content): string[] {
  const lines: string[] = [];
  const roleTag = content.role === 'user' ? '👤 User' : '🤖 Model';
  const typeTag = getMessageTypeTag(content.parts);
  lines.push(`${roleTag}${typeTag}:`);

  for (const part of content.parts) {
    // 跳过思考过程
    if ('thought' in part && part.thought) continue;

    if ('text' in part && part.text) {
      lines.push(...part.text.split('\n'));
    }
    if (isFunctionCallPart(part)) {
      const fc = part.functionCall;
      lines.push(`${fc.name}(${JSON.stringify(fc.args)})`);
    }
    if (isFunctionResponsePart(part)) {
      const fr = part.functionResponse;
      lines.push(`${fr.name} → ${JSON.stringify(fr.response)}`);
    }
  }

  return lines;
}

/**
 * 将消息列表格式化为完整的虚拟文档。
 *
 * 两遍扫描：
 * 1. 生成所有行，记录每个 Round 标题的行索引
 * 2. 回填 Round 标题的行号范围 (L start - L end)
 */
function formatToDocument(messages: Content[]): string[] {
  const docLines: string[] = [];
  let roundNumber = 0;
  const roundHeaderIndices: number[] = [];

  for (const message of messages) {
    // user 消息且非纯 functionResponse → 新回合
    if (message.role === 'user' && !isToolResponseContent(message)) {
      roundNumber++;
      if (docLines.length > 0) docLines.push(''); // 回合间空行
      roundHeaderIndices.push(docLines.length);
      docLines.push(''); // 占位，后面回填
    }

    docLines.push(...formatMessage(message));
    docLines.push(''); // 消息间空行
  }

  // 第二遍：回填 Round 标题
  for (let r = 0; r < roundHeaderIndices.length; r++) {
    const headerIdx = roundHeaderIndices[r];
    const startLine = headerIdx + 1; // 1-based
    const endLine = r + 1 < roundHeaderIndices.length
      ? roundHeaderIndices[r + 1] - 1
      : docLines.length;
    docLines[headerIdx] = `══ Round ${r + 1} (L${startLine}-L${endLine}) ══════════`;
  }

  return docLines;
}

/** 截断过长的行（仅输出时使用，内部仍保留完整内容） */
function truncateLineForDisplay(line: string, lineNum: number, limit: number): string {
  if (line.length <= limit) return line;
  return line.substring(0, limit)
    + `... [${line.length} chars, read line ${lineNum} for full content]`;
}

/** 给行数组添加行号前缀（1-based） */
function addLineNumbers(
  lines: string[],
  startLine: number = 1,
  truncateLong: boolean = false,
  lineLimit: number = DEFAULT_CONFIG.lineDisplayLimit,
): string {
  const totalLines = startLine + lines.length - 1;
  const maxDigits = String(totalLines).length;

  return lines.map((line, idx) => {
    const lineNum = startLine + idx;
    const numStr = String(lineNum).padStart(maxDigits, ' ');
    const displayLine = truncateLong
      ? truncateLineForDisplay(line, lineNum, lineLimit)
      : line;
    return `${numStr} | ${displayLine}`;
  }).join('\n');
}

// ─── 搜索/读取 实现 ─────────────────────────────────────

interface OperationResult {
  success: boolean;
  data?: string;
  error?: string;
}

/** search 模式：关键词/正则搜索 */
function handleSearch(
  docLines: string[],
  query: string,
  isRegex: boolean,
  cfg: RuntimeConfig,
): OperationResult {
  let pattern: RegExp;
  try {
    pattern = isRegex
      ? new RegExp(query, 'gi')
      : new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  } catch (e: any) {
    return { success: false, error: `Invalid regex: ${e.message}` };
  }

  // 查找所有匹配行
  const matchLineIndices: number[] = [];
  for (let i = 0; i < docLines.length; i++) {
    pattern.lastIndex = 0;
    if (pattern.test(docLines[i])) {
      matchLineIndices.push(i);
      if (matchLineIndices.length >= cfg.maxSearchMatches) break;
    }
  }

  if (matchLineIndices.length === 0) {
    return {
      success: true,
      data: `No matches found for "${query}" in ${docLines.length} lines.`,
    };
  }

  // 构建结果
  const resultParts: string[] = [];
  resultParts.push(
    `Found ${matchLineIndices.length} match(es) for "${query}" in ${docLines.length} lines:`,
  );
  resultParts.push('');

  // 合并相邻上下文范围，避免重复输出
  const ranges: Array<{ start: number; end: number; matchLines: number[] }> = [];
  for (const lineIdx of matchLineIndices) {
    const start = Math.max(0, lineIdx - cfg.searchContextLines);
    const end = Math.min(docLines.length - 1, lineIdx + cfg.searchContextLines);
    const lastRange = ranges[ranges.length - 1];
    if (lastRange && start <= lastRange.end + 1) {
      lastRange.end = Math.max(lastRange.end, end);
      lastRange.matchLines.push(lineIdx);
    } else {
      ranges.push({ start, end, matchLines: [lineIdx] });
    }
  }

  for (let ri = 0; ri < ranges.length; ri++) {
    const range = ranges[ri];
    const contextLines = docLines.slice(range.start, range.end + 1);
    const formatted = contextLines.map((line, idx) => {
      const lineNum = range.start + idx + 1; // 1-based
      const maxDigits = String(docLines.length).length;
      const numStr = String(lineNum).padStart(maxDigits, ' ');
      const displayLine = truncateLineForDisplay(line, lineNum, cfg.lineDisplayLimit);
      const isMatch = range.matchLines.includes(range.start + idx);
      const marker = isMatch ? '>' : ' ';
      return `${marker} ${numStr} | ${displayLine}`;
    }).join('\n');

    resultParts.push(formatted);
    if (ri < ranges.length - 1) resultParts.push('  ...');
  }

  if (matchLineIndices.length >= cfg.maxSearchMatches) {
    resultParts.push(`\n(Results limited to ${cfg.maxSearchMatches} matches)`);
  }

  const result = resultParts.join('\n');
  return { success: true, data: truncateResult(result, cfg.maxResultChars) };
}

/**
 * read 模式：按行号范围读取。
 * 单行读取（start_line === end_line）时不做字符数截断，保证完整返回。
 */
function handleRead(
  docLines: string[],
  startLine: number,
  endLine: number,
  cfg: RuntimeConfig,
): OperationResult {
  const totalLines = docLines.length;
  const start0 = Math.max(0, startLine - 1);          // 转 0-based
  const end0 = Math.min(totalLines - 1, endLine - 1);  // 转 0-based

  if (start0 > end0 || start0 >= totalLines) {
    return {
      success: false,
      error: `Invalid range: lines ${startLine}-${endLine} (document has ${totalLines} lines)`,
    };
  }

  const actualEnd0 = Math.min(end0, start0 + cfg.maxReadLines - 1);
  const wasTruncated = actualEnd0 < end0;
  const isSingleLine = start0 === actualEnd0;

  const slice = docLines.slice(start0, actualEnd0 + 1);
  // 多行读取时截断长行，单行读取时保留完整内容
  const formatted = addLineNumbers(slice, start0 + 1, !isSingleLine, cfg.lineDisplayLimit);

  const parts: string[] = [];
  parts.push(`Lines ${start0 + 1}-${actualEnd0 + 1} of ${totalLines}:`);
  parts.push('');
  parts.push(formatted);

  if (wasTruncated) {
    parts.push('');
    parts.push(`(Truncated at ${cfg.maxReadLines} lines. Continue from line ${actualEnd0 + 2})`);
  }

  const result = parts.join('\n');
  return {
    success: true,
    data: isSingleLine ? result : truncateResult(result, cfg.maxResultChars),
  };
}

/** 截断结果字符串 */
function truncateResult(result: string, maxChars: number): string {
  if (result.length <= maxChars) return result;
  return result.substring(0, maxChars)
    + '\n\n[Result truncated. Try a narrower line range or more specific query.]';
}

// ─── 工具工厂 ───────────────────────────────────────────

/** 创建 history_search 工具所需的外部依赖 */
export interface HistorySearchDeps {
  getStorage: () => StorageProvider;
  getSessionId: () => string | undefined;
}

/** 创建 history_search 工具定义 */
export function createHistorySearchTool(deps: HistorySearchDeps): ToolDefinition {
  const cfg: RuntimeConfig = { ...DEFAULT_CONFIG };

  return {
    parallel: true,
    declaration: {
      name: 'history_search',
      description:
        `Search and read conversation history. ` +
        `The history is formatted as a virtual document with line numbers. ` +
        `Each round header shows its line range, e.g. "══ Round 3 (L45-L88) ══". ` +
        `Two modes:\n` +
        `"search" — find keywords/regex in history, returns matching line numbers and context. ` +
        `"read" — read specific line range from the formatted history (max ${cfg.maxReadLines} lines per read). ` +
        `Typical workflow: use search to locate relevant lines, then use read to get the full content around those lines.\n` +
        `Tip: to get the full content of a single long line (e.g. a tool response), ` +
        `use read with start_line=N end_line=N — single-line reads are never truncated.`,
      parameters: {
        type: 'object',
        properties: {
          mode: {
            type: 'string',
            description:
              'Operation mode. ' +
              '"search": search for keywords/regex, returns line numbers and context. ' +
              '"read": read lines by line number range.',
            enum: ['search', 'read'],
          },
          query: {
            type: 'string',
            description: '[search mode] Search keyword or regex pattern',
          },
          is_regex: {
            type: 'boolean',
            description:
              '[search mode] Whether to treat query as a regular expression. Default: false',
          },
          start_line: {
            type: 'number',
            description: '[read mode] Start line number (1-based, inclusive)',
          },
          end_line: {
            type: 'number',
            description:
              `[read mode] End line number (1-based, inclusive). Max ${cfg.maxReadLines} lines per read.`,
          },
        },
        required: ['mode'],
      },
    },

    handler: async (args) => {
      const sessionId = deps.getSessionId();
      if (!sessionId) {
        return { error: 'No active session' };
      }

      const mode = args.mode as string;
      if (!['search', 'read'].includes(mode)) {
        return { error: `Invalid mode: "${mode}". Use "search" or "read".` };
      }

      const storage = deps.getStorage();
      const fullHistory = await storage.getHistory(sessionId);

      const targetMessages = cfg.searchScope === 'summarized'
        ? getSummarizedMessages(fullHistory)
        : fullHistory;

      if (targetMessages.length === 0) {
        return {
          message: cfg.searchScope === 'summarized'
            ? 'No summarized history available.'
            : 'No conversation history available.',
        };
      }

      const docLines = formatToDocument(targetMessages);

      switch (mode) {
        case 'search': {
          const query = args.query as string;
          if (!query || typeof query !== 'string' || !query.trim()) {
            return { error: 'query is required for search mode' };
          }
          const isRegex = args.is_regex === true;
          const result = handleSearch(docLines, query.trim(), isRegex, cfg);
          return result.success ? result.data : { error: result.error };
        }

        case 'read': {
          const startLine = typeof args.start_line === 'number' ? args.start_line : 1;
          const endLine = typeof args.end_line === 'number'
            ? args.end_line
            : startLine + cfg.maxReadLines - 1;
          const result = handleRead(docLines, startLine, endLine, cfg);
          return result.success ? result.data : { error: result.error };
        }

        default:
          return { error: `Invalid mode: "${mode}"` };
      }
    },
  };
}
