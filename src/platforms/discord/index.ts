/**
 * Discord 平台适配器
 *
 * 基于 discord.js 官方 SDK。
 */

import { Client, GatewayIntentBits, Message, Partials } from 'discord.js';
import { PlatformAdapter, splitText } from '../base';
import { Backend } from '../../core/backend';
import { createLogger } from '../../logger';

const logger = createLogger('Discord');

const MESSAGE_MAX_LENGTH = 2000;

export interface DiscordConfig {
  token: string;
}

export class DiscordPlatform extends PlatformAdapter {
  private client: Client;
  private token: string;
  private backend: Backend;

  constructor(backend: Backend, config: DiscordConfig) {
    super();
    this.backend = backend;
    this.token = config.token;
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
      ],
      partials: [Partials.Channel],
    });
  }

  async start(): Promise<void> {
    // 监听 Backend 事件
    this.backend.on('response', (sid: string, text: string) => {
      this.sendToChannel(sid, text);
    });

this.backend.on('stream:start', () => {});
    this.backend.on('stream:chunk', () => {});
    this.backend.on('stream:end', (sid: string) => {
      // Discord 不支持流式，等全部结束后发送 —— 但流式文本已在 Backend 中累积，
      // Backend 会在非流式模式下触发 response 事件，所以这里不需要处理。
    });

    this.client.on('ready', () => {
      logger.info(`已连接 | Bot: ${this.client.user?.tag}`);
    });

    this.client.on('messageCreate', (msg) => this.handleMessage(msg));

    await this.client.login(this.token);
    logger.info('平台已启动');
  }

  async stop(): Promise<void> {
    await this.client.destroy();
    logger.info('平台已停止');
  }

  // ============ 内部方法 ============

  private async sendToChannel(sessionId: string, text: string): Promise<void> {
    const channelId = sessionId.replace('discord-', '');
    const channel = await this.client.channels.fetch(channelId);
    if (!channel?.isTextBased()) return;

    const chunks = splitText(text, MESSAGE_MAX_LENGTH);
    for (const chunk of chunks) {
      await (channel as any).send(chunk);
    }
  }

  private async handleMessage(msg: Message): Promise<void> {
    if (msg.author.bot) return;
    if (!msg.content) return;

    const isDM = !msg.guild;
    const isMentioned = msg.mentions.has(this.client.user!);

    if (!isDM && !isMentioned) return;

    let content = msg.content;
    if (isMentioned && this.client.user) {
      content = content.replace(new RegExp(`<@!?${this.client.user.id}>`, 'g'), '').trim();
    }
    if (!content) return;

    const sessionId = `discord-${msg.channelId}`;
    try {
      await this.backend.chat(sessionId, content);
    } catch (err) {
      logger.error('处理消息时出错:', err);
    }
  }
}
