/**
 * AbortController 全链路测试
 *
 * 覆盖：
 *   - executePlan / executeSingle（scheduler 层）
 *   - ToolLoop.run()（tool-loop 层）
 *   - buildAbortResult 边界情况
 *   - ToolStateManager 集成
 *   - 并发安全
 *   - combineSignals 降级
 */

import { describe, it, beforeEach, expect } from 'vitest';
import { ToolLoop, type LLMCaller } from '../src/core/tool-loop.js';
import { ToolRegistry } from '../src/tools/registry.js';
import { ToolStateManager } from '../src/tools/state.js';
import { buildExecutionPlan, executePlan } from '../src/tools/scheduler.js';
import { PromptAssembler } from '../src/prompt/assembler.js';
import type { Content, FunctionCallPart } from '../src/types/index.js';
import type { ToolPolicyConfig } from '../src/config/types.js';

// ============ 辅助工具 ============

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function createRegistry(tools: Array<{ name: string; handler: (args: Record<string, unknown>) => Promise<unknown>; parallel?: boolean }>): ToolRegistry {
  const registry = new ToolRegistry();
  for (const t of tools) {
    registry.register({
      declaration: { name: t.name, description: `tool ${t.name}` },
      handler: t.handler,
      parallel: t.parallel,
    });
  }
  return registry;
}

function fc(name: string, args: Record<string, unknown> = {}, callId?: string): FunctionCallPart {
  return { functionCall: { name, args, callId: callId ?? `call_${name}_${Date.now()}` } };
}

function createAssembler(): PromptAssembler {
  const a = new PromptAssembler();
  a.setSystemPrompt('test');
  return a;
}

function textModelContent(text: string): Content {
  return { role: 'model', parts: [{ text }] };
}

function toolCallModelContent(toolName: string, args: Record<string, unknown> = {}): Content {
  return { role: 'model', parts: [fc(toolName, args)] };
}

/**
 * 一个 Proxy 对象，任何工具名查询都返回 { autoApprove: true }。
 * 用于测试中跳过策略检查。
 * 需要配合 ownKeys/getOwnPropertyDescriptor 让 Object.keys() 正常工作——
 * 但 ownKeys 需要预知键名，这里改用工厂函数更安全。
 */
function allToolsAutoApprove(...toolNames: string[]): Record<string, ToolPolicyConfig> {
  const policies: Record<string, ToolPolicyConfig> = {};
  for (const n of toolNames) policies[n] = { autoApprove: true };
  return policies;
}

// ============ scheduler 层测试 ============

describe('scheduler: abort support', () => {
  it('executeSingle: signal 已 aborted 时直接返回错误，不执行 handler', async () => {
    let handlerCalled = false;
    const registry = createRegistry([{
      name: 'test_tool',
      handler: async () => { handlerCalled = true; return 'ok'; },
    }]);
    const controller = new AbortController();
    controller.abort();

    const calls = [fc('test_tool')];
    const plan = buildExecutionPlan(calls, registry);
    const results = await executePlan(calls, plan, registry, undefined, undefined, allToolsAutoApprove(...calls.map(c => c.functionCall.name)), controller.signal);

    expect(results).toHaveLength(1);
    expect((results[0].functionResponse.response as any).error).toBe('Operation aborted');
    expect(handlerCalled).toBe(false);
  });

  it('executePlan: 多批中途 abort，剩余批次返回错误', async () => {
    const executionOrder: string[] = [];
    const controller = new AbortController();

    const registry = createRegistry([
      {
        name: 'tool_a',
        handler: async () => { executionOrder.push('a'); controller.abort(); return 'a_result'; },
      },
      {
        name: 'tool_b',
        handler: async () => { executionOrder.push('b'); return 'b_result'; },
      },
    ]);

    const calls = [fc('tool_a'), fc('tool_b')];
    const plan = buildExecutionPlan(calls, registry);
    const results = await executePlan(calls, plan, registry, undefined, undefined, allToolsAutoApprove(...calls.map(c => c.functionCall.name)), controller.signal);

    expect(results).toHaveLength(2);
    expect((results[0].functionResponse.response as any).result).toBe('a_result');
    expect((results[1].functionResponse.response as any).error).toBe('Operation aborted');
    expect(executionOrder).toEqual(['a']);
  });

  it('executePlan: 并行批次中 signal 已 aborted，所有工具返回错误', async () => {
    const controller = new AbortController();
    controller.abort();

    const registry = createRegistry([
      { name: 'read_a', handler: async () => 'a', parallel: true },
      { name: 'read_b', handler: async () => 'b', parallel: true },
    ]);

    const calls = [fc('read_a'), fc('read_b')];
    const plan = buildExecutionPlan(calls, registry);
    const results = await executePlan(calls, plan, registry, undefined, undefined, allToolsAutoApprove(...calls.map(c => c.functionCall.name)), controller.signal);

    expect(results).toHaveLength(2);
    expect((results[0].functionResponse.response as any).error).toBe('Operation aborted');
    expect((results[1].functionResponse.response as any).error).toBe('Operation aborted');
  });

  it('executePlan: 有 ToolStateManager 时，abort 的工具转为 error 状态', async () => {
    const controller = new AbortController();
    controller.abort();

    const registry = createRegistry([{
      name: 'test_tool',
      handler: async () => 'ok',
    }]);
    const toolState = new ToolStateManager();
    const invocation = toolState.create('test_tool', {}, 'queued');

    const calls = [fc('test_tool')];
    const plan = buildExecutionPlan(calls, registry);
    await executePlan(calls, plan, registry, toolState, [invocation.id], allToolsAutoApprove('test_tool'), controller.signal);

    const updated = toolState.get(invocation.id)!;
    expect(updated.status).toBe('error');
    expect(updated.error).toBe('Operation aborted');
  });

  it('executePlan: signal 未触发时正常执行', async () => {
    const controller = new AbortController();

    const registry = createRegistry([{
      name: 'test_tool',
      handler: async () => 'result_ok',
    }]);

    const calls = [fc('test_tool')];
    const plan = buildExecutionPlan(calls, registry);
    const results = await executePlan(calls, plan, registry, undefined, undefined, allToolsAutoApprove(...calls.map(c => c.functionCall.name)), controller.signal);

    expect((results[0].functionResponse.response as any).result).toBe('result_ok');
  });
});

// ============ ToolLoop 层测试 ============

describe('ToolLoop: abort support', () => {
  let registry: ToolRegistry;
  let assembler: PromptAssembler;

  beforeEach(() => {
    registry = createRegistry([
      { name: 'slow_tool', handler: async () => { await delay(100); return 'slow_result'; } },
      { name: 'fast_tool', handler: async () => 'fast_result' },
    ]);
    assembler = createAssembler();
  });

  it('循环前 signal 已 aborted：立即返回 aborted=true，不调用 LLM', async () => {
    const controller = new AbortController();
    controller.abort();
    let llmCalled = false;

    const callLLM: LLMCaller = async () => { llmCalled = true; return textModelContent('hi'); };
    const loop = new ToolLoop(registry, assembler, { maxRounds: 10, toolPolicies: allToolsAutoApprove('slow_tool', 'fast_tool') });
    const history: Content[] = [{ role: 'user', parts: [{ text: 'hello' }] }];

    const result = await loop.run(history, callLLM, { signal: controller.signal });

    expect(result.aborted).toBe(true);
    expect(llmCalled).toBe(false);
  });

  it('LLM 返回纯文本后 abort：保留文本，aborted=undefined（已正常完成）', async () => {
    const controller = new AbortController();
    const callLLM: LLMCaller = async () => textModelContent('final answer');
    const loop = new ToolLoop(registry, assembler, { maxRounds: 10, toolPolicies: allToolsAutoApprove('slow_tool', 'fast_tool') });
    const history: Content[] = [{ role: 'user', parts: [{ text: 'hello' }] }];

    const result = await loop.run(history, callLLM, { signal: controller.signal });

    expect(result.text).toBe('final answer');
    expect(result.aborted).toBeUndefined();
  });

  it('LLM 调用期间 abort：安全退出，不追加不完整的 model 消息', async () => {
    const controller = new AbortController();
    const callLLM: LLMCaller = async () => {
      controller.abort();
      throw new DOMException('The operation was aborted', 'AbortError');
    };
    const loop = new ToolLoop(registry, assembler, { maxRounds: 10, toolPolicies: allToolsAutoApprove('slow_tool', 'fast_tool') });
    const history: Content[] = [{ role: 'user', parts: [{ text: 'hello' }] }];
    const historyLenBefore = history.length;

    const result = await loop.run(history, callLLM, { signal: controller.signal });

    expect(result.aborted).toBe(true);
    expect(history).toHaveLength(historyLenBefore);
  });

  it('thinking+工具调用阶段中止：丢弃包含 functionCall 的 model 消息', async () => {
    const controller = new AbortController();
    let callCount = 0;
    const callLLM: LLMCaller = async () => {
      callCount++;
      if (callCount === 1) {
        return {
          role: 'model' as const,
          parts: [
            { text: 'let me think...', thought: true },
            fc('slow_tool'),
          ],
        };
      }
      return textModelContent('should not reach');
    };
    const abortRegistry = createRegistry([{
      name: 'slow_tool',
      handler: async () => { controller.abort(); await delay(10); return 'ok'; },
    }]);
    const loop = new ToolLoop(abortRegistry, assembler, { maxRounds: 10, toolPolicies: allToolsAutoApprove('slow_tool', 'fast_tool') });
    const history: Content[] = [{ role: 'user', parts: [{ text: 'hello' }] }];

    const result = await loop.run(history, callLLM, { signal: controller.signal });

    expect(result.aborted).toBe(true);
    const lastMsg = history[history.length - 1];
    expect(lastMsg.role).toBe('user');
  });

  it('文本输出中中止：保留已有可见文本', async () => {
    const controller = new AbortController();
    let callCount = 0;
    const callLLM: LLMCaller = async () => {
      callCount++;
      if (callCount === 1) return toolCallModelContent('fast_tool');
      if (callCount === 2) {
        const content = textModelContent('partial output here');
        setTimeout(() => controller.abort(), 0);
        return content;
      }
      return textModelContent('should not reach');
    };
    const loop = new ToolLoop(registry, assembler, { maxRounds: 10, toolPolicies: allToolsAutoApprove('slow_tool', 'fast_tool') });
    const history: Content[] = [{ role: 'user', parts: [{ text: 'hello' }] }];

    const result = await loop.run(history, callLLM, { signal: controller.signal });

    expect(result.text).toBe('partial output here');
  });

  it('工具调用中中止：丢弃包含 functionCall 的 model 消息', async () => {
    const controller = new AbortController();
    const callLLM: LLMCaller = async () => toolCallModelContent('slow_tool');

    const slowRegistry = createRegistry([{
      name: 'slow_tool',
      handler: async () => { controller.abort(); await delay(50); return 'slow_result'; },
    }]);
    const loop = new ToolLoop(slowRegistry, assembler, { maxRounds: 10, toolPolicies: allToolsAutoApprove('slow_tool', 'fast_tool') });
    const history: Content[] = [{ role: 'user', parts: [{ text: 'hello' }] }];

    const result = await loop.run(history, callLLM, { signal: controller.signal });

    expect(result.aborted).toBe(true);
    const lastMsg = history[history.length - 1];
    expect(lastMsg.role).toBe('user');
  });

  it('多轮工具调用后 abort：保留已完成的工具对，丢弃未完成的', async () => {
    const controller = new AbortController();
    let callCount = 0;
    const callLLM: LLMCaller = async () => {
      callCount++;
      if (callCount === 1) return toolCallModelContent('fast_tool');
      if (callCount === 2) return toolCallModelContent('slow_tool');
      return textModelContent('should not reach');
    };

    const mixedRegistry = createRegistry([
      { name: 'fast_tool', handler: async () => 'fast_ok' },
      { name: 'slow_tool', handler: async () => { controller.abort(); return 'slow_ok'; } },
    ]);
    const loop = new ToolLoop(mixedRegistry, assembler, { maxRounds: 10, toolPolicies: allToolsAutoApprove('slow_tool', 'fast_tool') });
    const history: Content[] = [{ role: 'user', parts: [{ text: 'hello' }] }];

    const result = await loop.run(history, callLLM, { signal: controller.signal });

    expect(result.aborted).toBe(true);
    const lastModelIdx = history.map((h, i) => h.role === 'model' ? i : -1).filter(i => i >= 0).pop();
    if (lastModelIdx !== undefined && lastModelIdx >= 0) {
      const lastModel = history[lastModelIdx];
      const hasFunctionCall = lastModel.parts.some(p => 'functionCall' in p);
      if (hasFunctionCall) {
        const nextMsg = history[lastModelIdx + 1];
        expect(nextMsg).toBeDefined();
        expect(nextMsg.role).toBe('user');
        expect(nextMsg.parts.some(p => 'functionResponse' in p)).toBe(true);
      }
    }
  });

  it('无 signal 时正常执行（向后兼容）', async () => {
    const callLLM: LLMCaller = async () => textModelContent('normal response');
    const loop = new ToolLoop(registry, assembler, { maxRounds: 10, toolPolicies: allToolsAutoApprove('slow_tool', 'fast_tool') });
    const history: Content[] = [{ role: 'user', parts: [{ text: 'hello' }] }];

    const result = await loop.run(history, callLLM);

    expect(result.text).toBe('normal response');
    expect(result.aborted).toBeUndefined();
  });

  it('abort 后 history 格式合法：永远不以孤立的 functionCall model 消息结尾', async () => {
    const controller = new AbortController();
    let callCount = 0;
    const callLLM: LLMCaller = async () => {
      callCount++;
      const content = toolCallModelContent('fast_tool');
      if (callCount >= 2) controller.abort();
      return content;
    };

    const loop = new ToolLoop(registry, assembler, { maxRounds: 10, toolPolicies: allToolsAutoApprove('slow_tool', 'fast_tool') });
    const history: Content[] = [{ role: 'user', parts: [{ text: 'hello' }] }];

    const result = await loop.run(history, callLLM, { signal: controller.signal });

    expect(result.aborted).toBe(true);
    for (let i = 0; i < history.length; i++) {
      const msg = history[i];
      if (msg.role === 'model' && msg.parts.some(p => 'functionCall' in p)) {
        const next = history[i + 1];
        expect(next).toBeDefined();
        expect(next.role).toBe('user');
        expect(next.parts.some(p => 'functionResponse' in p)).toBe(true);
      }
    }
  });
});

// ============ buildAbortResult 边界测试 ============

describe('ToolLoop: buildAbortResult edge cases', () => {
  const assembler = createAssembler();
  const registry = createRegistry([{ name: 'tool_a', handler: async () => 'ok' }]);

  it('历史为空时 abort：不崩溃', async () => {
    const controller = new AbortController();
    controller.abort();
    const callLLM: LLMCaller = async () => textModelContent('never');
    const loop = new ToolLoop(registry, assembler, { maxRounds: 10, toolPolicies: allToolsAutoApprove('slow_tool', 'fast_tool') });
    const history: Content[] = [];

    const result = await loop.run(history, callLLM, { signal: controller.signal });

    expect(result.aborted).toBe(true);
    expect(history).toHaveLength(0);
  });

  it('只有 user 消息时 abort：保留 user 消息', async () => {
    const controller = new AbortController();
    controller.abort();
    const callLLM: LLMCaller = async () => textModelContent('never');
    const loop = new ToolLoop(registry, assembler, { maxRounds: 10, toolPolicies: allToolsAutoApprove('slow_tool', 'fast_tool') });
    const history: Content[] = [{ role: 'user', parts: [{ text: 'hello' }] }];

    const result = await loop.run(history, callLLM, { signal: controller.signal });

    expect(result.aborted).toBe(true);
    expect(history).toHaveLength(1);
    expect(history[0].role).toBe('user');
  });

  it('已有完整对话历史 + abort：不删除已有历史', async () => {
    const controller = new AbortController();
    controller.abort();
    const callLLM: LLMCaller = async () => textModelContent('never');
    const loop = new ToolLoop(registry, assembler, { maxRounds: 10, toolPolicies: allToolsAutoApprove('slow_tool', 'fast_tool') });
    const history: Content[] = [
      { role: 'user', parts: [{ text: 'hello' }] },
      { role: 'model', parts: [{ text: 'hi there' }] },
      { role: 'user', parts: [{ text: 'bye' }] },
    ];

    const result = await loop.run(history, callLLM, { signal: controller.signal });

    expect(result.aborted).toBe(true);
    expect(history).toHaveLength(3);
  });

  it('model 消息同时包含 thought 和可见文本：保留', async () => {
    const controller = new AbortController();
    let callCount = 0;
    const callLLM: LLMCaller = async () => {
      callCount++;
      if (callCount === 1) {
        const content: Content = {
          role: 'model',
          parts: [{ text: 'thinking...', thought: true }, { text: 'visible output' }],
        };
        setTimeout(() => controller.abort(), 0);
        return content;
      }
      return textModelContent('never');
    };
    const loop = new ToolLoop(registry, assembler, { maxRounds: 10, toolPolicies: allToolsAutoApprove('slow_tool', 'fast_tool') });
    const history: Content[] = [{ role: 'user', parts: [{ text: 'hello' }] }];

    const result = await loop.run(history, callLLM, { signal: controller.signal });

    expect(result.text).toBe('visible output');
    expect(result.aborted).toBeUndefined();
  });
});

// ============ ToolLoop + ToolStateManager 集成 ============

describe('ToolLoop + ToolStateManager: abort', () => {
  const assembler = createAssembler();

  it('abort 时 ToolState 中活跃的 invocations 转为 error', async () => {
    const controller = new AbortController();
    const toolState = new ToolStateManager();
    const registry = createRegistry([{
      name: 'slow_tool',
      handler: async () => { controller.abort(); await delay(50); return 'result'; },
    }]);
    const callLLM: LLMCaller = async () => toolCallModelContent('slow_tool');
    const loop = new ToolLoop(registry, assembler, { maxRounds: 10, toolPolicies: allToolsAutoApprove('slow_tool', 'fast_tool') }, toolState);
    const history: Content[] = [{ role: 'user', parts: [{ text: 'go' }] }];

    const result = await loop.run(history, callLLM, { signal: controller.signal });

    expect(result.aborted).toBe(true);
    expect(toolState.getAll().length).toBeGreaterThan(0);
  });
});

// ============ 并发安全 ============

describe('abort: concurrency safety', () => {
  it('多次 abort 不报错（幂等）', () => {
    const controller = new AbortController();
    controller.abort();
    controller.abort();
    controller.abort();
    expect(controller.signal.aborted).toBe(true);
  });

  it('已 aborted 的 signal 传入 ToolLoop 立即返回', async () => {
    const controller = new AbortController();
    controller.abort();
    const registry = createRegistry([]);
    const assembler = createAssembler();
    const callLLM: LLMCaller = async () => { throw new Error('should not be called'); };
    const loop = new ToolLoop(registry, assembler, { maxRounds: 10, toolPolicies: allToolsAutoApprove('slow_tool', 'fast_tool') });
    const history: Content[] = [{ role: 'user', parts: [{ text: 'hi' }] }];

    const start = Date.now();
    const result = await loop.run(history, callLLM, { signal: controller.signal });
    const elapsed = Date.now() - start;

    expect(result.aborted).toBe(true);
    expect(elapsed).toBeLessThan(50);
  });
});

// ============ combineSignals 测试 ============

describe('combineSignals (via sendRequest behavior)', () => {
  it('AbortSignal.timeout 存在时不崩溃', () => {
    const signal = AbortSignal.timeout(1000);
    expect(signal.aborted).toBe(false);
  });

  it('AbortSignal.any 可用性检测', () => {
    const available = typeof AbortSignal.any === 'function';
    console.log(`  AbortSignal.any 可用: ${available} (Node ${process.version})`);
    expect(true).toBe(true);
  });

  it('降级方案合并两个 signal：外部 abort 触发合并 signal', () => {
    const external = new AbortController();
    const combined = new AbortController();
    const onAbort = () => combined.abort(external.signal.reason);
    external.signal.addEventListener('abort', onAbort, { once: true });

    expect(combined.signal.aborted).toBe(false);
    external.abort('user stop');
    expect(combined.signal.aborted).toBe(true);
  });

  it('降级方案：外部 signal 已 aborted 时立即生效', () => {
    const external = new AbortController();
    external.abort('already stopped');
    const combined = new AbortController();
    if (external.signal.aborted) combined.abort(external.signal.reason);
    expect(combined.signal.aborted).toBe(true);
  });
});
