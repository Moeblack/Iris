/**
 * Telegram 平台适配器
 *
 * 基于 grammＹ 官方 SDK。
 */

import { Bot, Context } from 'grammy';
import { PlatformAdapter, splitText } from '../base';
import { Backend } from '../../core/backend';
import { createLogger } from '../../logger';

const logger = createLogger('Telegram');

const MESSAGE_MAX_LENGTH = 4096;

export interface TelegramConfig {
  token: string;
}

export class TelegramPlatform extends PlatformAdapter {
  private bot: Bot;
  private backend: Backend;

  constructor(backend: Backend, config: TelegramConfig) {
    super();
    this.backend = backend;
    this.bot = new Bot(config.token);
  }

  async start(): Promise<void> {
    // 监听 Backend 事件
    this.backend.on('response', (sid: string, text: string) => {
      this.sendToChat(sid, text);
    });

    this.bot.on('message:text', (ctx) => this.handleMessage(ctx));

    this.bot.start({
      onStart: (info) => {
        logger.info(`已连接 | Bot: ${info.username}`);
      },
    });

    logger.info('平台已启动');
  }

  async stop(): Promise<void> {
    await this.bot.stop();
    logger.info('平台已停止');
  }

  // ============ 内部方法 ============

  private async sendToChat(sessionId: string, text: string): Promise<void> {
    const chatId =sessionId.replace('telegram-', '');
    const chunks = splitText(text, MESSAGE_MAX_LENGTH);
    for (const chunk of chunks) {
      await this.bot.api.sendMessage(chatId, chunk);
    }
  }

  private async handleMessage(ctx: Context): Promise<void> {
    const text = ctx.message?.text;
    if (!text) return;

    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const sessionId = `telegram-${chatId}`;
    try {
      await this.backend.chat(sessionId, text);
    } catch (err) {
    logger.error('处理消息时出错:', err);
    }
  }
}
