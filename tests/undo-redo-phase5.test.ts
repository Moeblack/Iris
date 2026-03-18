/**
 * Phase 5 消息编辑与 Undo/Redo 测试。
 *
 * 覆盖飞书和 Telegram 两个平台的撤销和恢复对话功能。
 * 注意：Phase 7 加了消息去重，每次 payload 必须用不同的 message_id。
 */

import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

// ---- 飞书 Undo/Redo 测试 ----

describe('Lark Phase 5: Undo/Redo', () => {
  it('执行 /undo 时截断历史并撤回上一条消息', async () => {
    const { LarkPlatform } = await import('../src/platforms/lark');

    class FakeBackend extends EventEmitter {
      chats: any[] = [];
      async chat(sid: string, text: string) { this.chats.push({ sid, text }); }
      async getHistory() {
        return [
          { role: 'user', parts: [{ text: '你好' }] },
          { role: 'model', parts: [{ text: '你好！' }] },
          { role: 'user', parts: [{ text: '撤销这句' }] },
          { role: 'model', parts: [{ text: '好的' }] },
        ];
      }
      async truncateHistory(sid: string, len: number) {
        this.emit('truncated', sid, len);
      }
      isStreamEnabled() { return false; }
    }

    const backend = new FakeBackend();
    const platform = new LarkPlatform(backend as any, {
      appId: 'cli_test',
      appSecret: 'secret_test',
    });

    const deletedIds: string[] = [];
    (platform as any).client = {
      sendText: vi.fn(async () => ({ messageId: 'mock', chatId: 'mock' })),
      replyText: vi.fn(async () => ({ messageId: 'mock', chatId: 'mock' })),
      deleteMessage: vi.fn(async (id: string) => { deletedIds.push(id); }),
      patchCard: vi.fn(),
    };
    (platform as any).messageHandler.setBotOpenId('ou_bot');

    // 每次用不同的 message_id，避免 Phase 7 去重拦截
    let seq = 0;
    const makePayload = (text: string) => ({
      event: {
        sender: { sender_id: { open_id: 'ou_user1' } },
        message: {
          message_id: `msg_undo_${++seq}`,
          chat_id: 'oc_chat1',
          chat_type: 'p2p' as const,
          message_type: 'text',
          content: JSON.stringify({ text }),
          create_time: String(Date.now()),
        },
      },
    });

    // 发一条消息建立 ChatState
    await (platform as any).handleIncomingEvent(makePayload('测试消息'));
    const cs = (platform as any).getChatState({ chatKey: 'dm:ou_user1' } as any);
    cs.lastBotMessageId = 'bot_msg_999';
    cs.busy = false;

    let truncatedLen = -1;
    backend.on('truncated', (_sid: string, len: number) => { truncatedLen = len; });

    // 执行 /undo
    await (platform as any).handleIncomingEvent(makePayload('/undo'));

    expect(truncatedLen).toBe(2);
    expect(cs.undoStack).toContain('撤销这句');
    expect(deletedIds).toContain('bot_msg_999');
    expect(cs.lastBotMessageId).toBeUndefined();
  });

  it('执行 /redo 时恢复上一轮的用户输入', async () => {
    const { LarkPlatform } = await import('../src/platforms/lark');

    class FakeBackend extends EventEmitter {
      chats: any[] = [];
      async chat(sid: string, text: string) { this.chats.push({ sid, text }); }
      isStreamEnabled() { return false; }
    }

    const backend = new FakeBackend();
    const platform = new LarkPlatform(backend as any, {
      appId: 'cli_test',
      appSecret: 'secret_test',
    });

    (platform as any).client = {
      sendText: vi.fn(async () => ({ messageId: 'mock', chatId: 'mock' })),
      replyText: vi.fn(async () => ({ messageId: 'mock', chatId: 'mock' })),
    };
    (platform as any).messageHandler.setBotOpenId('ou_bot');

    let seq = 0;
    const makePayload = (text: string) => ({
      event: {
        sender: { sender_id: { open_id: 'ou_user1' } },
        message: {
          message_id: `msg_redo_${++seq}`,
          chat_id: 'oc_chat1',
          chat_type: 'p2p' as const,
          message_type: 'text',
          content: JSON.stringify({ text }),
          create_time: String(Date.now()),
        },
      },
    });

    await (platform as any).handleIncomingEvent(makePayload('测试消息'));
    const cs = (platform as any).getChatState({ chatKey: 'dm:ou_user1' } as any);
    cs.busy = false;
    cs.undoStack = ['被撤销的话'];

    await (platform as any).handleIncomingEvent(makePayload('/redo'));
    await new Promise((r) => setTimeout(r, 50));

    expect(backend.chats).toHaveLength(2);
    expect(backend.chats[1].text).toBe('被撤销的话');
    expect(cs.undoStack).toHaveLength(0);
  });
});

// ---- Telegram Undo/Redo 测试 ----

describe('Telegram Phase 5: Undo/Redo', () => {
  it('执行 /undo 时截断历史并尝试 editText', async () => {
    const { TelegramPlatform } = await import('../src/platforms/telegram');

    class FakeBackend extends EventEmitter {
      async getHistory() {
        return [
          { role: 'user', parts: [{ text: 'Hello' }] },
          { role: 'model', parts: [{ text: 'Hi' }] },
          { role: 'user', parts: [{ text: 'Undo me' }] },
          { role: 'model', parts: [{ text: 'Sure' }] },
        ];
      }
      async truncateHistory(sid: string, len: number) {
        this.emit('truncated', sid, len);
      }
      isStreamEnabled() { return false; }
    }

    const backend = new FakeBackend();
    const platform = new TelegramPlatform(backend as any, {
      token: 'bot-token',
      groupMentionRequired: false,
    });

    const edited: Array<{ id: number; text: string }> = [];
    (platform as any).client = {
      sendMessageReturningId: vi.fn(async () => 999),
      editText: vi.fn(async (_t: any, id: number, text: string) => { edited.push({ id, text }); }),
      deleteMessage: vi.fn(),
    };

    // 每次用不同的 message_id，避免 Phase 7 去重拦截
    let seq = 100;
    const makeCtx = (text: string) => ({
      chat: { id: 3001, type: 'private' },
      me: { username: 'test_bot' },
      message: { message_id: ++seq, text, date: Math.floor(Date.now() / 1000) },
    });

    await (platform as any).handleMessage(makeCtx('Test'));
    const cs = (platform as any).getChatState({ chatKey: 'dm:3001' } as any);
    cs.lastBotMessageId = 888;
    cs.busy = false;

    let truncatedLen = -1;
    backend.on('truncated', (_sid: string, len: number) => { truncatedLen = len; });

    await (platform as any).handleMessage(makeCtx('/undo'));

    expect(truncatedLen).toBe(2);
    expect(cs.undoStack).toContain('Undo me');
    expect(edited).toHaveLength(1);
    expect(edited[0].id).toBe(888);
    expect(edited[0].text).toContain('已撤销');
    expect(cs.lastBotMessageId).toBeUndefined();
  });

  it('执行 /redo 时恢复上一轮的用户输入', async () => {
    const { TelegramPlatform } = await import('../src/platforms/telegram');

    class FakeBackend extends EventEmitter {
      chats: any[] = [];
      async chat(sid: string, text: string) { this.chats.push({ sid, text }); }
      isStreamEnabled() { return false; }
    }

    const backend = new FakeBackend();
    const platform = new TelegramPlatform(backend as any, {
      token: 'bot-token',
      groupMentionRequired: false,
    });

    (platform as any).client = {
      sendMessageReturningId: vi.fn(async () => 999),
    };

    let seq = 200;
    const makeCtx = (text: string) => ({
      chat: { id: 3002, type: 'private' },
      me: { username: 'test_bot' },
      message: { message_id: ++seq, text, date: Math.floor(Date.now() / 1000) },
    });

    await (platform as any).handleMessage(makeCtx('Test'));
    const cs = (platform as any).getChatState({ chatKey: 'dm:3002' } as any);
    cs.busy = false;
    cs.undoStack = ['Undo me'];

    await (platform as any).handleMessage(makeCtx('/redo'));
    await new Promise((r) => setTimeout(r, 50));

    expect(backend.chats).toHaveLength(2);
    expect(backend.chats[1].text).toBe('Undo me');
    expect(cs.undoStack).toHaveLength(0);
  });
});
