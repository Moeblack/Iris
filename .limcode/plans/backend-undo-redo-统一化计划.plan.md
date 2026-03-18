## TODO LIST

<!-- LIMCODE_TODO_LIST_START -->
- [x] 在 Backend 中实现 per-session redoHistory 与统一 undo/redo API  `#p1`
- [x] 迁移 Telegram / Lark 的 /undo 与 /redo 到 Backend  `#p2`
- [x] 迁移 Console 的持久化 undo/redo 到 Backend  `#p3`
- [x] 补充 Backend 与平台层回归测试  `#p4`
- [x] 执行类型检查与相关测试验证  `#p5`
<!-- LIMCODE_TODO_LIST_END -->

# 背景

此前 Telegram 与 Lark 的 `/undo` 依赖平台层自己推断应截断多少条历史，容易在多轮工具调用后留下孤立的 `functionCall`。另外，平台层各自维护 redo 状态，导致行为不一致：有的平台是“重新问一次模型”，有的平台是“恢复原始 Content”。

本次改造将会话级 undo/redo 的权威状态统一收回 Backend。

# 设计目标

1. Backend 成为每个 session undo/redo 的唯一权威来源。
2. undo 不再按平台硬编码删除条数，而是按历史结构删除完整 Content 组。
3. redo 恢复原始 Content 组，不重新调用 LLM。
4. 任意新的历史写入会自动清空 redo，避免分叉后恢复旧分支。
5. 平台层只处理 UI：撤回消息、编辑消息、补发最终可见文本。

# 接口草案

- `backend.undo(sessionId, scope)`
  - `scope = 'last-turn' | 'last-visible-message'`
- `backend.redo(sessionId)`
- `backend.clearRedo(sessionId)`
- `backend.addMessage(sessionId, content, { clearRedo?: boolean })`

返回结构统一包含：

- `removed/restored: Content[]`
- `removedCount/restoredCount`
- `userText`
- `assistantText`

其中 `assistantText` 用于平台层在 redo 后补发最终可见文本；`removed/restored` 保证恢复的是精确历史，而不是重新生成。

# 执行记录

## 1. Backend

- 新增 per-session `redoHistory`。
- 新增 `undo()`、`redo()`、`clearRedo()`。
- 新增历史分组解析：
  - 识别末尾 assistant 回复段：`model + user(functionResponse)`。
  - `last-turn` 会把上一条普通 user 消息一并带走。
  - `last-visible-message` 只撤销末尾可见消息单元。
- 在 `chat()` 开始写入新的 user 消息前自动 `clearRedo(sessionId)`。
- `clearSession()` 时同步清理 redo。

## 2. Telegram / Lark

- `/undo` 改为调用 `backend.undo(sessionId, 'last-turn')`。
- `/redo` 改为调用 `backend.redo(sessionId)`。
- redo 后不再重新调 LLM，只把 `assistantText` 重新发到平台侧。
- 删除平台层原有的 `undoStack: string[]`。

## 3. Console

- 平台持久化不再自己维护 `Content[][] redoContentStack`。
- 持久化侧改为调用 `backend.undo(sessionId, 'last-visible-message')` 与 `backend.redo(sessionId)`。
- App 侧保留 UI 专用的本地消息撤销栈，只用于界面回放，不再作为权威历史来源。
- `onClearRedoStack` 同步调用 `backend.clearRedo(sessionId)`，保证视图栈与后端 redo 权威状态一致失效。

# 已知后续项

1. Console 当前仍保留 UI 级本地 undo/redo 栈，用于视图层移除与恢复气泡。这不是会话历史权威状态，但后续仍可继续收敛为“由 Backend 返回更直接的 UI 描述”。
2. 如果后续 Web 平台加入 `/undo`、`/redo`，应直接复用 Backend 接口，不再另建状态。
3. 如果未来需要更细粒度的撤销模式，可以继续扩展 `UndoScope`，而不是回到平台层手工截断历史。
