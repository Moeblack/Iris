/**
 * 用户交互层 —— 平台适配器基类
 *
 * 平台适配器负责：
 *   1. 启动和停止平台（连接服务、监听事件）
 *   2. 将平台的用户输入转换为 Backend.chat() 调用
 *   3. 监听 Backend 事件并转换为平台特定的输出
 *
 * 平台不再持有回调函数，改为直接使用 Backend 实例。
 */

/** 将文本按最大长度分段，优先在换行处切分 */
export function splitText(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    let splitAt = remaining.lastIndexOf('\n', maxLen);
    if (splitAt <= 0) splitAt = maxLen;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).replace(/^\n/, '');
  }
  return chunks;
}

export abstract class PlatformAdapter {
  /** 启动平台 */
  abstract start(): Promise<void>;

  /** 停止平台 */
  abstract stop(): Promise<void>;

  /** 平台名称 */
  get name(): string {
    return this.constructor.name;
  }
}
