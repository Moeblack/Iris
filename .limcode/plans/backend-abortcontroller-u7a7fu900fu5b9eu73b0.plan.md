## TODO LIST

<!-- LIMCODE_TODO_LIST_START -->
- [ ] transport.ts: sendRequest 增加 signal 参数  `#t1`
- [ ] providers/base.ts: chat/chatStream 透传 signal  `#t2`
- [ ] router.ts: chat/chatStream 透传 signal  `#t3`
- [ ] scheduler.ts: executePlan/executeSingle 支持 signal  `#t4`
- [ ] tool-loop.ts: run() 支持 signal，每轮检查  `#t5`
- [ ] backend.ts: AbortController 管理 + abortChat() + 全链路穿透  `#t6`
- [ ] 编译验证 + 提交  `#t7`
<!-- LIMCODE_TODO_LIST_END -->

# Backend AbortController 穿透实现

## 目标
让平台层可以通过 `backend.abortChat(sessionId)` 真正中断 LLM 调用和工具执行。

## 改动路径（从底层向上）

### 1. transport.ts
`sendRequest` 增加 `signal?: AbortSignal` 参数，与内置的 `AbortSignal.timeout` 合并。

### 2. providers/base.ts
`chat()` 和 `chatStream()` 增加 `signal?: AbortSignal` 参数，透传给 `sendRequest`。

### 3. response.ts
`processStreamResponse` 的 SSE 解析循环中，reader 在 signal abort 时会自动中断（fetch body stream 行为），无需额外处理，但需要安全捕获 AbortError。

### 4. router.ts
`chat()` 和 `chatStream()` 增加 `signal?: AbortSignal` 参数，透传给 provider。

### 5. scheduler.ts
- `executeSingle` 增加 `signal?: AbortSignal`，执行前检查 `signal.aborted`
- `executePlan` 增加 `signal?: AbortSignal`，每批执行前检查

### 6. tool-loop.ts
- `ToolLoopRunOptions` 增加 `signal?: AbortSignal`
- `run()` 每轮循环前检查 signal
- `executeTools` 透传 signal 给 scheduler

### 7. backend.ts
- 用 Map 管理每个 sessionId 的 AbortController
- `chat()` 内创建 AbortController，穿透到 callLLM 和 toolLoop
- 新增 `abortChat(sessionId)` 公共方法
- `callLLMStream` 透传 signal 给 router
- `handleMessage` 内的 callLLM 闭包透传 signal
- `done` 事件发出后清理 AbortController

## 自定义错误
定义 `ChatAbortedError` 用于区分用户主动中止和其他异常。

## 鲁棒性要求
- signal 已 aborted 时，所有层级都应安全退出而非抛异常（除非调用者期望异常）
- AbortError 在 Backend 层统一捕获，不向平台层抛出
- 多次调用 abortChat 不报错（幂等）
- abortChat 对不存在的 sessionId 不报错
