# Lark + Telegram 双平台适配器代码审查
- Date: 2026-03-17
- Overview: 对照开发计划、openclaw 参考代码和 Iris 核心架构，审查飞书和 Telegram 两个 channel 的实现，重点识别不必要的、过度预设的(OOP)代码。
- Status: completed
- Overall decision: conditionally_accepted

## Review Scope
# Lark + Telegram 双平台适配器代码审查

- `src/platforms/lark/` — 6 个文件（index.ts, client.ts, message-handler.ts, card-builder.ts, commands.ts, types.ts）
- `src/platforms/telegram/` — 8 个文件（index.ts, client.ts, commands.ts, media.ts, message-builder.ts, message-handler.ts, stream-controller.ts, types.ts）
- 对照：`src/platforms/wxwork/index.ts`（企微适配器）、`src/platforms/discord/index.ts`（Discord 适配器）
- 参考：openclaw-lark、wecom-openclaw-plugin 源码
- 参考：开发计划 `.limcode/plans/飞书lark平台适配器开发计划.plan.md`

### 审查标准
1. **不必要的代码**：能删掉而不影响功能的代码
2. **过度预设 (OOP / Over-Optimistic Pre-engineering)**：为尚未实现的功能预设了结构但实际空壳运转
3. **重复代码**：跨文件/跨平台可以提取为共享工具的重复实现
4. **架构合理性**：对照 openclaw 参考实现和 Iris 自身 base.ts 的设计意图

## Review Summary
<!-- LIMCODE_REVIEW_SUMMARY_START -->
- Current status: completed
- Reviewed modules: src/platforms/lark/, src/platforms/telegram/, src/platforms/wxwork/, src/platforms/telegram/stream-controller.ts, src/platforms/telegram/message-builder.ts, src/platforms/telegram/client.ts, src/platforms/telegram/media.ts, src/platforms/telegram/types.ts, src/platforms/lark/client.ts, src/platforms/lark/types.ts, src/platforms/lark/message-handler.ts, src/platforms/lark/card-builder.ts
- Current progress: 2 milestones recorded; latest: M2
- Total milestones: 2
- Completed milestones: 2
- Total findings: 16
- Findings by severity: high 2 / medium 7 / low 7
- Latest conclusion: ## 最终结论 接受你的判断：**跨平台重复是解耦的一部分，属于合理成本。** M1 中 F1-F6 全部降级为 informational，不构成行动项。 真正需要清理的是 M2 中发现的**死代码和过度预设**。按优先级分三档： ### 第一档：应立即清理的死代码（~50 行） | Finding | 文件 | 行数 | 说明 | |---|---|---|---| | F7 | `telegram/stream-controller.ts` | 42 | 整文件死代码，Phase 2 废弃后遗留 | | F8 | `telegram/types.ts` | 10 | 导出的 TelegramChatState 已被 index.ts 私有版替代 | | — | `telegram/types.ts` | ~8 | TelegramStreamSnapshot + createEmptyStreamSnapshot（仅 F7 使用） | 这些代码完全无用，删除零风险。 ### 第二档：建议清理的过度预设（~200 行） | Finding | 内容 | 行数 | |---|---|---| | F11 | LarkClient 的 uploadImage/uploadFile/sendImage/sendFile | ~110 | | F10 | TelegramClient 的 sendPlainText/onTextMessage/answerCallbackQuery/setCommands/getBot/getConfig | ~30 | | F9 | TelegramMessageBuilder 类改纯函数 + 删 extractAssistantText | ~15 | | F14 | ToolStatusEntry 死接口 | 6 | | F15 | supportsOutboundMedia() 死方法 | 3 | | F16 | index.ts 中未使用的 import | 2 | 这些是为尚未实现的 Phase 预留的空壳代码。删除后，需要时再写回来成本很低。但删除 sendPlainText 需要同步改 6 个测试文件的 mock。 ### 第三档：可保留（~15 行） | Finding | 说明 | |---|---| | F12 | LarkClient 的 3 个 getter，体积小，保留无害 | | F13 | extractLarkText 测试便利函数，保留无害 | ### 关于架构的整体评价 两个适配器的核心架构是合理的： - 文件拆分（client / handler / builder / types / commands）与开发计划一致 - 并发控制、流式输出、命令处理的设计从企微适配器自然演化而来 - 飞书的卡片流式方案（sendCard + patchCard）是对 openclaw-lark CardKit 的合理简化 - Telegram 的 editMessageText 流式方案是 Telegram 平台能力范围内的合理实现 主要问题不是架构错误，而是开发过程中**预设了后续 Phase 的接口但没清理未完成部分**，导致代码库中残留了较多空壳。
- Recommended next action: 按第一档、第二档的顺序清理死代码和过度预设，先删 stream-controller.ts 和 types.ts 中的死接口（零风险），再按需清理 LarkClient/TelegramClient 中的未调用方法。
- Overall decision: conditionally_accepted
<!-- LIMCODE_REVIEW_SUMMARY_END -->

## Review Findings
<!-- LIMCODE_REVIEW_FINDINGS_START -->
- [medium] maintainability: detectImageMime 在三个平台各复制一份
  - ID: F1
  - Description: src/platforms/lark/index.ts、src/platforms/telegram/media.ts、src/platforms/wxwork/index.ts 各有一份完全相同的 detectImageMime 函数（约 10 行）。任何一处改动需要同步修改三处。
  - Evidence Files:
    - `src/platforms/lark/index.ts`
    - `src/platforms/telegram/media.ts`
    - `src/platforms/wxwork/index.ts`
  - Related Milestones: M1
  - Recommendation: 提取到 src/platforms/base.ts 或 src/media/index.ts 作为共享导出。

- [low] maintainability: guessMimeByFileName 在两个平台各复制一份
  - ID: F2
  - Description: Lark 的 index.ts 和 Telegram 的 media.ts 各有一份完全相同的 guessMimeByFileName 函数（约 25 行），MIME_MAP 内容一致。
  - Evidence Files:
    - `src/platforms/lark/index.ts`
    - `src/platforms/telegram/media.ts`
  - Related Milestones: M1
  - Recommendation: 同 F1，提取到共享模块。

- [medium] maintainability: TOOL_STATUS_ICONS/LABELS 常量在三个平台各复制一份
  - ID: F3
  - Description: 工具状态的图标和中文标签映射在 lark/card-builder.ts、telegram/message-builder.ts、wxwork/index.ts 各存一份，内容完全一致。formatToolLine 函数也只有名称不同。
  - Evidence Files:
    - `src/platforms/lark/card-builder.ts`
    - `src/platforms/telegram/message-builder.ts`
    - `src/platforms/wxwork/index.ts`
  - Related Milestones: M1
  - Recommendation: 提取到 src/platforms/base.ts 导出 TOOL_STATUS_ICONS、TOOL_STATUS_LABELS、formatToolLine。各平台按需 import。

- [high] maintainability: Lark 和 Telegram 的 handleCommand 逻辑高度重复（约 180 行）
  - ID: F4
  - Description: 两个适配器的 /new /clear /model /session /stop /flush /undo /redo /help 共 9 条命令的处理逻辑几乎逐行一致，仅在消息发送和流式终结的具体 API 调用上不同。总计约 360 行（各 180 行）高度重复代码。
  - Evidence Files:
    - `src/platforms/lark/index.ts`
    - `src/platforms/telegram/index.ts`
  - Related Milestones: M1
  - Recommendation: 抽取一个 CommandHandler 基类或 mixin，接收 reply(text)、finalizeStream(cs, text)、cleanupStream(cs) 等抽象回调，在一处维护命令逻辑。各平台 adapter 只需注入这些回调。

- [medium] maintainability: ChatState / 并发控制 / flushPendingMessages 三平台高度相似
  - ID: F5
  - Description: busy 锁、pendingMessages 缓冲、stream 状态管理、getChatState、findChatStateBySid、flushPendingMessages 等核心并发逻辑在三个适配器中各实现一份，结构和流程高度一致。
  - Evidence Files:
    - `src/platforms/lark/index.ts`
    - `src/platforms/telegram/index.ts`
    - `src/platforms/wxwork/index.ts`
  - Related Milestones: M1
  - Recommendation: 考虑抽取一个 ChatStateManager<TTarget, TStream> 泛型类，封装 busy 锁、缓冲、查找、flush 等通用逻辑。各平台只需定义 Target 和 Stream 的类型参数。

- [low] maintainability: Lark/Telegram 消息去重 + 过期检测逻辑完全重复
  - ID: F6
  - Description: messageDedup Set、常量（500/30000/60000）、cleanupDedupIfNeeded 方法在两个适配器中完全一致。
  - Evidence Files:
    - `src/platforms/lark/index.ts`
    - `src/platforms/telegram/index.ts`
  - Related Milestones: M1
  - Recommendation: 提取为 MessageDedup 工具类，或并入上述 ChatStateManager。

- [high] maintainability: stream-controller.ts 是完整的死文件（42行），无任何调用方
  - ID: F7
  - Description: TelegramStreamController 类在 Phase 2 升级后被废弃，所有流式状态已收敛到 ChatState.stream 中。该文件注释自述为「兼容桩」，但搜索整个 src/ 和 tests/ 目录，TelegramStreamController 类没有任何一处被 import 或实例化。TelegramStreamSnapshot 和 createEmptyStreamSnapshot 也仅在该文件内部互相引用。42 行纯死代码。
  - Evidence Files:
    - `src/platforms/telegram/stream-controller.ts`
    - `src/platforms/telegram/types.ts`
  - Related Milestones: M2
  - Recommendation: 删除 stream-controller.ts。同时删除 types.ts 中仅服务于该文件的 TelegramStreamSnapshot 接口和 createEmptyStreamSnapshot 函数。

- [medium] maintainability: types.ts 中 TelegramChatState 接口是导出的死接口，与 index.ts 内部私有定义重复
  - ID: F8
  - Description: types.ts L82-91 导出了 TelegramChatState 接口，但 index.ts L60-71 在内部重新定义了同名的 TelegramChatState 接口（且增加了 stream 字段）。搜索结果显示只有 index.ts 的私有版本在实际使用。types.ts 中的导出版本是 Phase 0 遗留，已被 Phase 2 的内嵌版本完全替代。
  - Evidence Files:
    - `src/platforms/telegram/types.ts`
    - `src/platforms/telegram/index.ts`
  - Related Milestones: M2
  - Recommendation: 删除 types.ts 中的 TelegramChatState 接口。

- [medium] maintainability: TelegramMessageBuilder 类的 4 个方法中 3 个是单行透传，buildResponseText 是 identity 函数
  - ID: F9
  - Description: TelegramMessageBuilder 是一个无状态的类，4 个方法：buildResponseText(text) 直接返回 text（identity）；buildErrorText 拼一个前缀；buildThinkingText 返回常量字符串；extractAssistantText 透传调用 extractText。没有任何内部状态、配置注入、或需要实例化的理由。特别是 extractAssistantText 在 src/ 和 tests/ 中均无调用方。把这些做成类没有增加任何价值，反而增加了 index.ts 的 constructor 复杂度。
  - Evidence Files:
    - `src/platforms/telegram/message-builder.ts`
    - `src/platforms/telegram/index.ts`
  - Related Milestones: M2
  - Recommendation: 改为顶层导出的纯函数。如果只是返回固定字符串或拼前缀，甚至可以直接内联到调用处。删除 extractAssistantText（0调用方）。

- [medium] maintainability: TelegramClient 有 5 个方法定义后从未被调用
  - ID: F10
  - Description: 以下方法在 src/ 中仅有定义处一次出现（无调用方）：(1) sendPlainText — 仅 sendText 的零参版透传，测试中虽有 mock 但实际代码不调用；(2) onTextMessage — 被 onMessage 替代；(3) answerCallbackQuery — Phase 4 预设但 Phase 4 未实现；(4) setCommands — Phase 4 预设；(5) getConfig — 无调用方。另外 getBot 也无调用。
  - Evidence Files:
    - `src/platforms/telegram/client.ts`
  - Related Milestones: M2
  - Recommendation: sendPlainText 和 onTextMessage 可直接删除。answerCallbackQuery/setCommands 是 Phase 4 预设，如果 Phase 4 尚未排期建议删除，实现时再加。getBot 和 getConfig 同理。注意 sendPlainText 被多个测试 mock 引用，需要同步修改测试。

- [medium] maintainability: LarkClient 有 4 个多媒体出站方法从未被调用（uploadImage/uploadFile/sendImage/sendFile）
  - ID: F11
  - Description: lark/client.ts 中 uploadImage（L302-319）、uploadFile（L325-347）、sendImage（L355-378）、sendFile（L384-407）共 4 个方法，在 src/ 中均只有定义处出现，index.ts 没有任何地方调用它们。这些是 Phase 3 媒体「出站发送」的预设，但开发计划中 Phase 3 标记为已完成的只有媒体「下载/入站」部分。出站发送功能实际未接入。约 110 行预设代码。
  - Evidence Files:
    - `src/platforms/lark/client.ts`
    - `src/platforms/lark/types.ts`
  - Related Milestones: M2
  - Recommendation: 如果出站媒体发送不在近期计划内，删除这 4 个方法及关联类型（LarkUploadImageResult、LarkUploadFileResult、LarkSendMediaOptions）。实现时再添加。

- [low] maintainability: LarkClient 的 getBotOpenId/getBotName/isWebSocketConnected 无外部调用方
  - ID: F12
  - Description: 这三个 getter 在 src/ 中仅有定义处。index.ts 在 start() 中直接使用 probe 返回的 botOpenId/botName，不通过 client.getBotOpenId()。isWebSocketConnected 无任何调用。
  - Evidence Files:
    - `src/platforms/lark/client.ts`
  - Related Milestones: M2
  - Recommendation: 如果未来确有需要可保留，但当前是纯预设。建议标记为 @internal 或删除。

- [low] maintainability: extractLarkText 是 extractLarkMessageContent 的单字段透传，只在测试中被调用
  - ID: F13
  - Description: message-handler.ts L102-107 的 extractLarkText 函数仅返回 extractLarkMessageContent(message).text，在 src/ 中无调用方，仅 tests/lark-phase1.test.ts 使用。
  - Evidence Files:
    - `src/platforms/lark/message-handler.ts`
  - Related Milestones: M2
  - Recommendation: 可保留为测试便利函数。但如果追求精简，可以删除，测试直接调用 extractLarkMessageContent。

- [low] maintainability: ToolStatusEntry 接口导出后无任何调用方
  - ID: F14
  - Description: telegram/message-builder.ts L40-45 导出的 ToolStatusEntry 接口在整个项目中未被引用。index.ts 的 tool:update 事件直接使用内联类型。
  - Evidence Files:
    - `src/platforms/telegram/message-builder.ts`
  - Related Milestones: M2
  - Recommendation: 删除该导出接口。

- [low] maintainability: TelegramMediaService 的 supportsOutboundMedia() 返回硬编码 false，无调用方
  - ID: F15
  - Description: media.ts L33-35 的 supportsOutboundMedia() 方法在 src/ 中无任何调用。是出站媒体能力的预留桩。
  - Evidence Files:
    - `src/platforms/telegram/media.ts`
  - Related Milestones: M2
  - Recommendation: 删除。实现出站媒体时再添加。

- [low] maintainability: parseLarkSessionTarget / parseTelegramSessionTarget 在生产代码中均未使用
  - ID: F16
  - Description: 这两个函数仅在 types.ts 中定义并在 index.ts 中 import（但未使用），实际调用仅存在于测试文件中。在 lark/index.ts 中 parseLarkSessionTarget 被 import 但从未被调用。在 telegram/index.ts 同理。这些函数的意图是「从 sessionId 反解出 target」，但当前的 chatState 管理完全不需要这个反解能力。
  - Evidence Files:
    - `src/platforms/lark/types.ts`
    - `src/platforms/telegram/types.ts`
    - `src/platforms/lark/index.ts`
    - `src/platforms/telegram/index.ts`
  - Related Milestones: M2
  - Recommendation: 保留函数本身（测试在用），但从 index.ts 的 import 列表中移除未使用的引用。
<!-- LIMCODE_REVIEW_FINDINGS_END -->

## Review Milestones
<!-- LIMCODE_REVIEW_MILESTONES_START -->
### M1 · M1: 跨平台重复代码与共享提取分析
- Status: completed
- Recorded At: 2026-03-17T16:05:04.695Z
- Reviewed Modules: src/platforms/lark/, src/platforms/telegram/, src/platforms/wxwork/
- Summary:
### 分析对象

将 Lark、Telegram、WXWork 三个适配器逐一比对，识别完全重复或高度相似的代码片段。

### 发现

#### 1. detectImageMime — 三处完全相同的实现

以下函数在三个文件中逐字节完全一致：

| 文件 | 行号 | 函数名 |
|---|---|---|
| `src/platforms/lark/index.ts` | L710-L719 | `detectImageMime()` |
| `src/platforms/telegram/media.ts` | L111-L120 | `detectImageMime()` |
| `src/platforms/wxwork/index.ts` | L859-L868 | `detectImageMime()` |

三处代码完全一致，均通过魔术字节检测 JPEG/PNG/GIF/WebP/BMP。应提取到 `src/platforms/base.ts` 或 `src/media/` 共享模块。

#### 2. guessMimeByFileName — 两处几乎完全相同的实现

| 文件 | 行号 |
|---|---|
| `src/platforms/lark/index.ts` | L722-L746 |
| `src/platforms/telegram/media.ts` | L123-L147 |

两处的 MIME_MAP 内容完全一致（含 pdf/doc/docx/xls/xlsx/ppt/pptx/txt/csv/json/xml/html/md/zip/ogg/opus/mp3/wav/mp4），仅有变量名不同。应提取为共享函数。

#### 3. TOOL_STATUS_ICONS / TOOL_STATUS_LABELS — 三处完全相同的常量映射

| 文件 | 行号 | 变量名 |
|---|---|---|
| `src/platforms/lark/card-builder.ts` | L15-L35 | `TOOL_STATUS_ICONS` + `TOOL_STATUS_LABELS` |
| `src/platforms/telegram/message-builder.ts` | L18-L38 | 同名 |
| `src/platforms/wxwork/index.ts` | L828-L856 | `STATUS_ICONS` + `STATUS_LABELS` |

三处的 key-value 映射完全一致（queued/executing/success/error/streaming/awaiting_approval/awaiting_apply/warning）。格式化函数 `formatToolLine` / `formatLarkToolLine` / `formatTelegramToolLine` 也几乎一致，仅函数名不同。

#### 4. 命令处理逻辑 — Lark 和 Telegram 的 handleCommand 高度重复

`src/platforms/lark/index.ts` 的 `handleCommand()` 方法（L400-L588）与 `src/platforms/telegram/index.ts` 的 `handleCommand()`（L397-L573）在以下命令上的逻辑几乎逐行一致：

- `/new`：生成新 sessionId 并更新 activeSessions
- `/clear`：调用 backend.clearSession
- `/model`：listModels / switchModel
- `/session`：listSessionMetas + 列表展示 + 切换
- `/stop`：设 stopped + abortChat + finalize stream
- `/flush`：中止 + 等 done 或直接 flush
- `/undo`：getHistory + truncateHistory + 编辑/删除消息
- `/redo`：从 undoStack pop + dispatchChat
- `/help`：buildHelpText

差异仅在于：
- 发送消息的方式（`sendTextToChat` vs `sendToChat`）
- 消息 ID 类型（string vs number）
- 流式终结方式（`finalizeStreamCard` vs `finalizeStream`）

这些命令逻辑可以提取为一个平台无关的基类方法或 mixin，子类仅实现差异化的 reply/finalize 接口。

#### 5. ChatState / 并发控制结构 — 三平台高度相似

`LarkChatState`、`TelegramChatState`、WXWork 的 `ChatState` 结构几乎一致：

```
busy: boolean
sessionId: string
target: XxxSessionTarget
pendingMessages: XxxPendingMessage[]
stopped: boolean
stream: { buffer, committedToolIds, dirty, throttleTimer, ... } | null
```

三个适配器的 `getChatState()`、`findChatStateBySid()`、`flushPendingMessages()` 逻辑也高度相似。

#### 6. 去重 + 过期检测 — Lark 和 Telegram 完全相同的结构

两者都有：
- `messageDedup: Set`
- `lastDedupCleanup: number`
- `MESSAGE_DEDUP_MAX_SIZE = 500`
- `MESSAGE_EXPIRE_MS = 30_000`
- `DEDUP_CLEANUP_INTERVAL_MS = 60_000`
- `cleanupDedupIfNeeded()` 方法逻辑一致

WXWork 没有这些（因为是先开发的）。
- Conclusion: ### 分析对象 将 Lark、Telegram、WXWork 三个适配器逐一比对，识别完全重复或高度相似的代码片段。 ### 发现 #### 1. detectImageMime — 三处完全相同的实现 以下函数在三个文件中逐字节完全一致： | 文件 | 行号 | 函数名 | |---|---|---| | `src/platforms/lark/index.ts` | L710-L719 | `detectImageMime()` | | `src/platforms/telegram/media.ts` | L111-L120 | `detectImageMime()` | | `src/platforms/wxwork/index.ts` | L859-L868 | `detectImageMime()` | 三处代码完全一致，均通过魔术字节检测 JPEG/PNG/GIF/WebP/BMP。应提取到 `src/platforms/base.ts` 或 `src/media/` 共享模块。 #### 2. guessMimeByFileName — 两处几乎完全相同的实现 | 文件 | 行号 | |---|---| | `src/platforms/lark/index.ts` | L722-L746 | | `src/platforms/telegram/media.ts` | L123-L147 | 两处的 MIME_MAP 内容完全一致（含 pdf/doc/docx/xls/xlsx/ppt/pptx/txt/csv/json/xml/html/md/zip/ogg/opus/mp3/wav/mp4），仅有变量名不同。应提取为共享函数。 #### 3. TOOL_STATUS_ICONS / TOOL_STATUS_LABELS — 三处完全相同的常量映射 | 文件 | 行号 | 变量名 | |---|---|---| | `src/platforms/lark/card-builder.ts` | L15-L35 | `TOOL_STATUS_ICONS` + `TOOL_STATUS_LABELS` | | `src/platforms/telegram/message-builder.ts` | L18-L38 | 同名 | | `src/platforms/wxwork/index.ts` | L828-L856 | `STATUS_ICONS` + `STATUS_LABELS` | 三处的 key-value 映射完全一致（queued/executing/success/error/streaming/awaiting_approval/awaiting_apply/warning）。格式化函数 `formatToolLine` / `formatLarkToolLine` / `formatTelegramToolLine` 也几乎一致，仅函数名不同。 #### 4. 命令处理逻辑 — Lark 和 Telegram 的 handleCommand 高度重复 `src/platforms/lark/index.ts` 的 `handleCommand()` 方法（L400-L588）与 `src/platforms/telegram/index.ts` 的 `handleCommand()`（L397-L573）在以下命令上的逻辑几乎逐行一致： - `/new`：生成新 sessionId 并更新 activeSessions - `/clear`：调用 backend.clearSession - `/model`：listModels / switchModel - `/session`：listSessionMetas + 列表展示 + 切换 - `/stop`：设 stopped + abortChat + finalize stream - `/flush`：中止 + 等 done 或直接 flush - `/undo`：getHistory + truncateHistory + 编辑/删除消息 - `/redo`：从 undoStack pop + dispatchChat - `/help`：buildHelpText 差异仅在于： - 发送消息的方式（`sendTextToChat` vs `sendToChat`） - 消息 ID 类型（string vs number） - 流式终结方式（`finalizeStreamCard` vs `finalizeStream`） 这些命令逻辑可以提取为一个平台无关的基类方法或 mixin，子类仅实现差异化的 reply/finalize 接口。 #### 5. ChatState / 并发控制结构 — 三平台高度相似 `LarkChatState`、`TelegramChatState`、WXWork 的 `ChatState` 结构几乎一致： ``` busy: boolean sessionId: string target: XxxSessionTarget pendingMessages: XxxPendingMessage[] stopped: boolean stream: { buffer, committedToolIds, dirty, throttleTimer, ... } | null ``` 三个适配器的 `getChatState()`、`findChatStateBySid()`、`flushPendingMessages()` 逻辑也高度相似。 #### 6. 去重 + 过期检测 — Lark 和 Telegram 完全相同的结构 两者都有： - `messageDedup: Set` - `lastDedupCleanup: number` - `MESSAGE_DEDUP_MAX_SIZE = 500` - `MESSAGE_EXPIRE_MS = 30_000` - `DEDUP_CLEANUP_INTERVAL_MS = 60_000` - `cleanupDedupIfNeeded()` 方法逻辑一致 WXWork 没有这些（因为是先开发的）。
- Findings:
  - [medium] maintainability: detectImageMime 在三个平台各复制一份
  - [low] maintainability: guessMimeByFileName 在两个平台各复制一份
  - [medium] maintainability: TOOL_STATUS_ICONS/LABELS 常量在三个平台各复制一份
  - [high] maintainability: Lark 和 Telegram 的 handleCommand 逻辑高度重复（约 180 行）
  - [medium] maintainability: ChatState / 并发控制 / flushPendingMessages 三平台高度相似
  - [low] maintainability: Lark/Telegram 消息去重 + 过期检测逻辑完全重复

### M2 · M2: 空壳代码与过度预设（OOP）审查
- Status: completed
- Recorded At: 2026-03-17T16:11:01.954Z
- Reviewed Modules: src/platforms/telegram/stream-controller.ts, src/platforms/telegram/message-builder.ts, src/platforms/telegram/client.ts, src/platforms/telegram/media.ts, src/platforms/telegram/types.ts, src/platforms/lark/client.ts, src/platforms/lark/types.ts, src/platforms/lark/message-handler.ts, src/platforms/lark/card-builder.ts
- Summary:
### 审查方法

对 Lark 和 Telegram 两个平台的所有源文件，逐个方法/接口/类在 `src/` 和 `tests/` 中搜索调用方。仅有定义处或仅在自身文件内互相引用的，判定为"死代码"或"过度预设"。

### 关于 M1 的修正

M1 中标记的跨平台重复代码（detectImageMime、guessMimeByFileName、TOOL_STATUS_ICONS 等）属于**解耦导致的合理重复**。各平台适配器是独立部署单元，应能独立演进。将这些提取为共享模块反而引入不必要的耦合。M1 中 F1-F6 的严重度应全部降级为 informational，不作为行动项。

### 本里程碑核心发现

**1. 整文件级死代码**
- `telegram/stream-controller.ts`（42 行）：完整的死文件，Phase 2 改造后被废弃但未清理。

**2. 过度预设的类结构**
- `TelegramMessageBuilder` 类：4 个方法中 3 个是单行返回，1 个无调用方。做成类没有任何价值。
- `TelegramMediaService` 类：`supportsOutboundMedia()` 返回硬编码 false，无调用方。

**3. 大量预留但未接入的 API 封装**
- LarkClient：`uploadImage`、`uploadFile`、`sendImage`、`sendFile` 共 110 行代码，为出站媒体发送预设，但 index.ts 中未接入。
- TelegramClient：`sendPlainText`、`onTextMessage`、`answerCallbackQuery`、`setCommands`、`getBot`、`getConfig` 共 6 个方法无调用方。
- LarkClient：`getBotOpenId`、`getBotName`、`isWebSocketConnected` 共 3 个 getter 无外部调用。

**4. 重复定义的接口**
- `TelegramChatState` 在 types.ts 中导出一份，在 index.ts 中又私有定义一份，导出版已���期。

**5. 导入但未使用的符号**
- `parseLarkSessionTarget` 在 lark/index.ts 中被 import 但从未调用。
- `parseTelegramSessionTarget` 在 telegram/index.ts 中被 import 但从未调用。

### 量化统计

| 类别 | 受影响行数（估算）|
|---|---|
| 可直接删除的死文件 | ~42 行 |
| 可删除的未调用方法/接口 | ~170 行 |
| 可简化的过度预设类 | ~30 行 |
| **总计可精简** | **~242 行** |
- Conclusion: ### 审查方法 对 Lark 和 Telegram 两个平台的所有源文件，逐个方法/接口/类在 `src/` 和 `tests/` 中搜索调用方。仅有定义处或仅在自身文件内互相引用的，判定为"死代码"或"过度预设"。 ### 关于 M1 的修正 M1 中标记的跨平台重复代码（detectImageMime、guessMimeByFileName、TOOL_STATUS_ICONS 等）属于**解耦导致的合理重复**。各平台适配器是独立部署单元，应能独立演进。将这些提取为共享模块反而引入不必要的耦合。M1 中 F1-F6 的严重度应全部降级为 informational，不作为行动项。 ### 本里程碑核心发现 **1. 整文件级死代码** - `telegram/stream-controller.ts`（42 行）：完整的死文件，Phase 2 改造后被废弃但未清理。 **2. 过度预设的类结构** - `TelegramMessageBuilder` 类：4 个方法中 3 个是单行返回，1 个无调用方。做成类没有任何价值。 - `TelegramMediaService` 类：`supportsOutboundMedia()` 返回硬编码 false，无调用方。 **3. 大量预留但未接入的 API 封装** - LarkClient：`uploadImage`、`uploadFile`、`sendImage`、`sendFile` 共 110 行代码，为出站媒体发送预设，但 index.ts 中未接入。 - TelegramClient：`sendPlainText`、`onTextMessage`、`answerCallbackQuery`、`setCommands`、`getBot`、`getConfig` 共 6 个方法无调用方。 - LarkClient：`getBotOpenId`、`getBotName`、`isWebSocketConnected` 共 3 个 getter 无外部调用。 **4. 重复定义的接口** - `TelegramChatState` 在 types.ts 中导出一份，在 index.ts 中又私有定义一份，导出版已���期。 **5. 导入但未使用的符号** - `parseLarkSessionTarget` 在 lark/index.ts 中被 import 但从未调用。 - `parseTelegramSessionTarget` 在 telegram/index.ts 中被 import 但从未调用。 ### 量化统计 | 类别 | 受影响行数（估算）| |---|---| | 可直接删除的死文件 | ~42 行 | | 可删除的未调用方法/接口 | ~170 行 | | 可简化的过度预设类 | ~30 行 | | **总计可精简** | **~242 行** |
- Findings:
  - [high] maintainability: stream-controller.ts 是完整的死文件（42行），无任何调用方
  - [medium] maintainability: types.ts 中 TelegramChatState 接口是导出的死接口，与 index.ts 内部私有定义重复
  - [medium] maintainability: TelegramMessageBuilder 类的 4 个方法中 3 个是单行透传，buildResponseText 是 identity 函数
  - [medium] maintainability: TelegramClient 有 5 个方法定义后从未被调用
  - [medium] maintainability: LarkClient 有 4 个多媒体出站方法从未被调用（uploadImage/uploadFile/sendImage/sendFile）
  - [low] maintainability: LarkClient 的 getBotOpenId/getBotName/isWebSocketConnected 无外部调用方
  - [low] maintainability: extractLarkText 是 extractLarkMessageContent 的单字段透传，只在测试中被调用
  - [low] maintainability: ToolStatusEntry 接口导出后无任何调用方
  - [low] maintainability: TelegramMediaService 的 supportsOutboundMedia() 返回硬编码 false，无调用方
  - [low] maintainability: parseLarkSessionTarget / parseTelegramSessionTarget 在生产代码中均未使用
<!-- LIMCODE_REVIEW_MILESTONES_END -->

<!-- LIMCODE_REVIEW_METADATA_START -->
{
  "formatVersion": 3,
  "reviewRunId": "review-mmusyk49-bye8ip",
  "createdAt": "2026-03-17T00:00:00.000Z",
  "finalizedAt": "2026-03-17T16:11:31.782Z",
  "status": "completed",
  "overallDecision": "conditionally_accepted",
  "latestConclusion": "## 最终结论 接受你的判断：**跨平台重复是解耦的一部分，属于合理成本。** M1 中 F1-F6 全部降级为 informational，不构成行动项。 真正需要清理的是 M2 中发现的**死代码和过度预设**。按优先级分三档： ### 第一档：应立即清理的死代码（~50 行） | Finding | 文件 | 行数 | 说明 | |---|---|---|---| | F7 | `telegram/stream-controller.ts` | 42 | 整文件死代码，Phase 2 废弃后遗留 | | F8 | `telegram/types.ts` | 10 | 导出的 TelegramChatState 已被 index.ts 私有版替代 | | — | `telegram/types.ts` | ~8 | TelegramStreamSnapshot + createEmptyStreamSnapshot（仅 F7 使用） | 这些代码完全无用，删除零风险。 ### 第二档：建议清理的过度预设（~200 行） | Finding | 内容 | 行数 | |---|---|---| | F11 | LarkClient 的 uploadImage/uploadFile/sendImage/sendFile | ~110 | | F10 | TelegramClient 的 sendPlainText/onTextMessage/answerCallbackQuery/setCommands/getBot/getConfig | ~30 | | F9 | TelegramMessageBuilder 类改纯函数 + 删 extractAssistantText | ~15 | | F14 | ToolStatusEntry 死接口 | 6 | | F15 | supportsOutboundMedia() 死方法 | 3 | | F16 | index.ts 中未使用的 import | 2 | 这些是为尚未实现的 Phase 预留的空壳代码。删除后，需要时再写回来成本很低。但删除 sendPlainText 需要同步改 6 个测试文件的 mock。 ### 第三档：可保留（~15 行） | Finding | 说明 | |---|---| | F12 | LarkClient 的 3 个 getter，体积小，保留无害 | | F13 | extractLarkText 测试便利函数，保留无害 | ### 关于架构的整体评价 两个适配器的核心架构是合理的： - 文件拆分（client / handler / builder / types / commands）与开发计划一致 - 并发控制、流式输出、命令处理的设计从企微适配器自然演化而来 - 飞书的卡片流式方案（sendCard + patchCard）是对 openclaw-lark CardKit 的合理简化 - Telegram 的 editMessageText 流式方案是 Telegram 平台能力范围内的合理实现 主要问题不是架构错误，而是开发过程中**预设了后续 Phase 的接口但没清理未完成部分**，导致代码库中残留了较多空壳。",
  "recommendedNextAction": "按第一档、第二档的顺序清理死代码和过度预设，先删 stream-controller.ts 和 types.ts 中的死接口（零风险），再按需清理 LarkClient/TelegramClient 中的未调用方法。",
  "reviewedModules": [
    "src/platforms/lark/",
    "src/platforms/telegram/",
    "src/platforms/wxwork/",
    "src/platforms/telegram/stream-controller.ts",
    "src/platforms/telegram/message-builder.ts",
    "src/platforms/telegram/client.ts",
    "src/platforms/telegram/media.ts",
    "src/platforms/telegram/types.ts",
    "src/platforms/lark/client.ts",
    "src/platforms/lark/types.ts",
    "src/platforms/lark/message-handler.ts",
    "src/platforms/lark/card-builder.ts"
  ],
  "milestones": [
    {
      "id": "M1",
      "title": "M1: 跨平台重复代码与共享提取分析",
      "summary": "### 分析对象\n\n将 Lark、Telegram、WXWork 三个适配器逐一比对，识别完全重复或高度相似的代码片段。\n\n### 发现\n\n#### 1. detectImageMime — 三处完全相同的实现\n\n以下函数在三个文件中逐字节完全一致：\n\n| 文件 | 行号 | 函数名 |\n|---|---|---|\n| `src/platforms/lark/index.ts` | L710-L719 | `detectImageMime()` |\n| `src/platforms/telegram/media.ts` | L111-L120 | `detectImageMime()` |\n| `src/platforms/wxwork/index.ts` | L859-L868 | `detectImageMime()` |\n\n三处代码完全一致，均通过魔术字节检测 JPEG/PNG/GIF/WebP/BMP。应提取到 `src/platforms/base.ts` 或 `src/media/` 共享模块。\n\n#### 2. guessMimeByFileName — 两处几乎完全相同的实现\n\n| 文件 | 行号 |\n|---|---|\n| `src/platforms/lark/index.ts` | L722-L746 |\n| `src/platforms/telegram/media.ts` | L123-L147 |\n\n两处的 MIME_MAP 内容完全一致（含 pdf/doc/docx/xls/xlsx/ppt/pptx/txt/csv/json/xml/html/md/zip/ogg/opus/mp3/wav/mp4），仅有变量名不同。应提取为共享函数。\n\n#### 3. TOOL_STATUS_ICONS / TOOL_STATUS_LABELS — 三处完全相同的常量映射\n\n| 文件 | 行号 | 变量名 |\n|---|---|---|\n| `src/platforms/lark/card-builder.ts` | L15-L35 | `TOOL_STATUS_ICONS` + `TOOL_STATUS_LABELS` |\n| `src/platforms/telegram/message-builder.ts` | L18-L38 | 同名 |\n| `src/platforms/wxwork/index.ts` | L828-L856 | `STATUS_ICONS` + `STATUS_LABELS` |\n\n三处的 key-value 映射完全一致（queued/executing/success/error/streaming/awaiting_approval/awaiting_apply/warning）。格式化函数 `formatToolLine` / `formatLarkToolLine` / `formatTelegramToolLine` 也几乎一致，仅函数名不同。\n\n#### 4. 命令处理逻辑 — Lark 和 Telegram 的 handleCommand 高度重复\n\n`src/platforms/lark/index.ts` 的 `handleCommand()` 方法（L400-L588）与 `src/platforms/telegram/index.ts` 的 `handleCommand()`（L397-L573）在以下命令上的逻辑几乎逐行一致：\n\n- `/new`：生成新 sessionId 并更新 activeSessions\n- `/clear`：调用 backend.clearSession\n- `/model`：listModels / switchModel\n- `/session`：listSessionMetas + 列表展示 + 切换\n- `/stop`：设 stopped + abortChat + finalize stream\n- `/flush`：中止 + 等 done 或直接 flush\n- `/undo`：getHistory + truncateHistory + 编辑/删除消息\n- `/redo`：从 undoStack pop + dispatchChat\n- `/help`：buildHelpText\n\n差异仅在于：\n- 发送消息的方式（`sendTextToChat` vs `sendToChat`）\n- 消息 ID 类型（string vs number）\n- 流式终结方式（`finalizeStreamCard` vs `finalizeStream`）\n\n这些命令逻辑可以提取为一个平台无关的基类方法或 mixin，子类仅实现差异化的 reply/finalize 接口。\n\n#### 5. ChatState / 并发控制结构 — 三平台高度相似\n\n`LarkChatState`、`TelegramChatState`、WXWork 的 `ChatState` 结构几乎一致：\n\n```\nbusy: boolean\nsessionId: string\ntarget: XxxSessionTarget\npendingMessages: XxxPendingMessage[]\nstopped: boolean\nstream: { buffer, committedToolIds, dirty, throttleTimer, ... } | null\n```\n\n三个适配器的 `getChatState()`、`findChatStateBySid()`、`flushPendingMessages()` 逻辑也高度相似。\n\n#### 6. 去重 + 过期检测 — Lark 和 Telegram 完全相同的结构\n\n两者都有：\n- `messageDedup: Set`\n- `lastDedupCleanup: number`\n- `MESSAGE_DEDUP_MAX_SIZE = 500`\n- `MESSAGE_EXPIRE_MS = 30_000`\n- `DEDUP_CLEANUP_INTERVAL_MS = 60_000`\n- `cleanupDedupIfNeeded()` 方法逻辑一致\n\nWXWork 没有这些（因为是先开发的）。",
      "status": "completed",
      "conclusion": "### 分析对象 将 Lark、Telegram、WXWork 三个适配器逐一比对，识别完全重复或高度相似的代码片段。 ### 发现 #### 1. detectImageMime — 三处完全相同的实现 以下函数在三个文件中逐字节完全一致： | 文件 | 行号 | 函数名 | |---|---|---| | `src/platforms/lark/index.ts` | L710-L719 | `detectImageMime()` | | `src/platforms/telegram/media.ts` | L111-L120 | `detectImageMime()` | | `src/platforms/wxwork/index.ts` | L859-L868 | `detectImageMime()` | 三处代码完全一致，均通过魔术字节检测 JPEG/PNG/GIF/WebP/BMP。应提取到 `src/platforms/base.ts` 或 `src/media/` 共享模块。 #### 2. guessMimeByFileName — 两处几乎完全相同的实现 | 文件 | 行号 | |---|---| | `src/platforms/lark/index.ts` | L722-L746 | | `src/platforms/telegram/media.ts` | L123-L147 | 两处的 MIME_MAP 内容完全一致（含 pdf/doc/docx/xls/xlsx/ppt/pptx/txt/csv/json/xml/html/md/zip/ogg/opus/mp3/wav/mp4），仅有变量名不同。应提取为共享函数。 #### 3. TOOL_STATUS_ICONS / TOOL_STATUS_LABELS — 三处完全相同的常量映射 | 文件 | 行号 | 变量名 | |---|---|---| | `src/platforms/lark/card-builder.ts` | L15-L35 | `TOOL_STATUS_ICONS` + `TOOL_STATUS_LABELS` | | `src/platforms/telegram/message-builder.ts` | L18-L38 | 同名 | | `src/platforms/wxwork/index.ts` | L828-L856 | `STATUS_ICONS` + `STATUS_LABELS` | 三处的 key-value 映射完全一致（queued/executing/success/error/streaming/awaiting_approval/awaiting_apply/warning）。格式化函数 `formatToolLine` / `formatLarkToolLine` / `formatTelegramToolLine` 也几乎一致，仅函数名不同。 #### 4. 命令处理逻辑 — Lark 和 Telegram 的 handleCommand 高度重复 `src/platforms/lark/index.ts` 的 `handleCommand()` 方法（L400-L588）与 `src/platforms/telegram/index.ts` 的 `handleCommand()`（L397-L573）在以下命令上的逻辑几乎逐行一致： - `/new`：生成新 sessionId 并更新 activeSessions - `/clear`：调用 backend.clearSession - `/model`：listModels / switchModel - `/session`：listSessionMetas + 列表展示 + 切换 - `/stop`：设 stopped + abortChat + finalize stream - `/flush`：中止 + 等 done 或直接 flush - `/undo`：getHistory + truncateHistory + 编辑/删除消息 - `/redo`：从 undoStack pop + dispatchChat - `/help`：buildHelpText 差异仅在于： - 发送消息的方式（`sendTextToChat` vs `sendToChat`） - 消息 ID 类型（string vs number） - 流式终结方式（`finalizeStreamCard` vs `finalizeStream`） 这些命令逻辑可以提取为一个平台无关的基类方法或 mixin，子类仅实现差异化的 reply/finalize 接口。 #### 5. ChatState / 并发控制结构 — 三平台高度相似 `LarkChatState`、`TelegramChatState`、WXWork 的 `ChatState` 结构几乎一致： ``` busy: boolean sessionId: string target: XxxSessionTarget pendingMessages: XxxPendingMessage[] stopped: boolean stream: { buffer, committedToolIds, dirty, throttleTimer, ... } | null ``` 三个适配器的 `getChatState()`、`findChatStateBySid()`、`flushPendingMessages()` 逻辑也高度相似。 #### 6. 去重 + 过期检测 — Lark 和 Telegram 完全相同的结构 两者都有： - `messageDedup: Set` - `lastDedupCleanup: number` - `MESSAGE_DEDUP_MAX_SIZE = 500` - `MESSAGE_EXPIRE_MS = 30_000` - `DEDUP_CLEANUP_INTERVAL_MS = 60_000` - `cleanupDedupIfNeeded()` 方法逻辑一致 WXWork 没有这些（因为是先开发的）。",
      "evidenceFiles": [],
      "reviewedModules": [
        "src/platforms/lark/",
        "src/platforms/telegram/",
        "src/platforms/wxwork/"
      ],
      "recommendedNextAction": null,
      "recordedAt": "2026-03-17T16:05:04.695Z",
      "findingIds": [
        "F1",
        "F2",
        "F3",
        "F4",
        "F5",
        "F6"
      ]
    },
    {
      "id": "M2",
      "title": "M2: 空壳代码与过度预设（OOP）审查",
      "summary": "### 审查方法\n\n对 Lark 和 Telegram 两个平台的所有源文件，逐个方法/接口/类在 `src/` 和 `tests/` 中搜索调用方。仅有定义处或仅在自身文件内互相引用的，判定为\"死代码\"或\"过度预设\"。\n\n### 关于 M1 的修正\n\nM1 中标记的跨平台重复代码（detectImageMime、guessMimeByFileName、TOOL_STATUS_ICONS 等）属于**解耦导致的合理重复**。各平台适配器是独立部署单元，应能独立演进。将这些提取为共享模块反而引入不必要的耦合。M1 中 F1-F6 的严重度应全部降级为 informational，不作为行动项。\n\n### 本里程碑核心发现\n\n**1. 整文件级死代码**\n- `telegram/stream-controller.ts`（42 行）：完整的死文件，Phase 2 改造后被废弃但未清理。\n\n**2. 过度预设的类结构**\n- `TelegramMessageBuilder` 类：4 个方法中 3 个是单行返回，1 个无调用方。做成类没有任何价值。\n- `TelegramMediaService` 类：`supportsOutboundMedia()` 返回硬编码 false，无调用方。\n\n**3. 大量预留但未接入的 API 封装**\n- LarkClient：`uploadImage`、`uploadFile`、`sendImage`、`sendFile` 共 110 行代码，为出站媒体发送预设，但 index.ts 中未接入。\n- TelegramClient：`sendPlainText`、`onTextMessage`、`answerCallbackQuery`、`setCommands`、`getBot`、`getConfig` 共 6 个方法无调用方。\n- LarkClient：`getBotOpenId`、`getBotName`、`isWebSocketConnected` 共 3 个 getter 无外部调用。\n\n**4. 重复定义的接口**\n- `TelegramChatState` 在 types.ts 中导出一份，在 index.ts 中又私有定义一份，导出版已���期。\n\n**5. 导入但未使用的符号**\n- `parseLarkSessionTarget` 在 lark/index.ts 中被 import 但从未调用。\n- `parseTelegramSessionTarget` 在 telegram/index.ts 中被 import 但从未调用。\n\n### 量化统计\n\n| 类别 | 受影响行数（估算）|\n|---|---|\n| 可直接删除的死文件 | ~42 行 |\n| 可删除的未调用方法/接口 | ~170 行 |\n| 可简化的过度预设类 | ~30 行 |\n| **总计可精简** | **~242 行** |",
      "status": "completed",
      "conclusion": "### 审查方法 对 Lark 和 Telegram 两个平台的所有源文件，逐个方法/接口/类在 `src/` 和 `tests/` 中搜索调用方。仅有定义处或仅在自身文件内互相引用的，判定为\"死代码\"或\"过度预设\"。 ### 关于 M1 的修正 M1 中标记的跨平台重复代码（detectImageMime、guessMimeByFileName、TOOL_STATUS_ICONS 等）属于**解耦导致的合理重复**。各平台适配器是独立部署单元，应能独立演进。将这些提取为共享模块反而引入不必要的耦合。M1 中 F1-F6 的严重度应全部降级为 informational，不作为行动项。 ### 本里程碑核心发现 **1. 整文件级死代码** - `telegram/stream-controller.ts`（42 行）：完整的死文件，Phase 2 改造后被废弃但未清理。 **2. 过度预设的类结构** - `TelegramMessageBuilder` 类：4 个方法中 3 个是单行返回，1 个无调用方。做成类没有任何价值。 - `TelegramMediaService` 类：`supportsOutboundMedia()` 返回硬编码 false，无调用方。 **3. 大量预留但未接入的 API 封装** - LarkClient：`uploadImage`、`uploadFile`、`sendImage`、`sendFile` 共 110 行代码，为出站媒体发送预设，但 index.ts 中未接入。 - TelegramClient：`sendPlainText`、`onTextMessage`、`answerCallbackQuery`、`setCommands`、`getBot`、`getConfig` 共 6 个方法无调用方。 - LarkClient：`getBotOpenId`、`getBotName`、`isWebSocketConnected` 共 3 个 getter 无外部调用。 **4. 重复定义的接口** - `TelegramChatState` 在 types.ts 中导出一份，在 index.ts 中又私有定义一份，导出版已���期。 **5. 导入但未使用的符号** - `parseLarkSessionTarget` 在 lark/index.ts 中被 import 但从未调用。 - `parseTelegramSessionTarget` 在 telegram/index.ts 中被 import 但从未调用。 ### 量化统计 | 类别 | 受影响行数（估算）| |---|---| | 可直接删除的死文件 | ~42 行 | | 可删除的未调用方法/接口 | ~170 行 | | 可简化的过度预设类 | ~30 行 | | **总计可精简** | **~242 行** |",
      "evidenceFiles": [],
      "reviewedModules": [
        "src/platforms/telegram/stream-controller.ts",
        "src/platforms/telegram/message-builder.ts",
        "src/platforms/telegram/client.ts",
        "src/platforms/telegram/media.ts",
        "src/platforms/telegram/types.ts",
        "src/platforms/lark/client.ts",
        "src/platforms/lark/types.ts",
        "src/platforms/lark/message-handler.ts",
        "src/platforms/lark/card-builder.ts"
      ],
      "recommendedNextAction": null,
      "recordedAt": "2026-03-17T16:11:01.954Z",
      "findingIds": [
        "F7",
        "F8",
        "F9",
        "F10",
        "F11",
        "F12",
        "F13",
        "F14",
        "F15",
        "F16"
      ]
    }
  ],
  "findings": [
    {
      "id": "F1",
      "severity": "medium",
      "category": "maintainability",
      "title": "detectImageMime 在三个平台各复制一份",
      "description": "src/platforms/lark/index.ts、src/platforms/telegram/media.ts、src/platforms/wxwork/index.ts 各有一份完全相同的 detectImageMime 函数（约 10 行）。任何一处改动需要同步修改三处。",
      "evidenceFiles": [
        "src/platforms/lark/index.ts",
        "src/platforms/telegram/media.ts",
        "src/platforms/wxwork/index.ts"
      ],
      "relatedMilestoneIds": [
        "M1"
      ],
      "recommendation": "提取到 src/platforms/base.ts 或 src/media/index.ts 作为共享导出。"
    },
    {
      "id": "F2",
      "severity": "low",
      "category": "maintainability",
      "title": "guessMimeByFileName 在两个平台各复制一份",
      "description": "Lark 的 index.ts 和 Telegram 的 media.ts 各有一份完全相同的 guessMimeByFileName 函数（约 25 行），MIME_MAP 内容一致。",
      "evidenceFiles": [
        "src/platforms/lark/index.ts",
        "src/platforms/telegram/media.ts"
      ],
      "relatedMilestoneIds": [
        "M1"
      ],
      "recommendation": "同 F1，提取到共享模块。"
    },
    {
      "id": "F3",
      "severity": "medium",
      "category": "maintainability",
      "title": "TOOL_STATUS_ICONS/LABELS 常量在三个平台各复制一份",
      "description": "工具状态的图标和中文标签映射在 lark/card-builder.ts、telegram/message-builder.ts、wxwork/index.ts 各存一份，内容完全一致。formatToolLine 函数也只有名称不同。",
      "evidenceFiles": [
        "src/platforms/lark/card-builder.ts",
        "src/platforms/telegram/message-builder.ts",
        "src/platforms/wxwork/index.ts"
      ],
      "relatedMilestoneIds": [
        "M1"
      ],
      "recommendation": "提取到 src/platforms/base.ts 导出 TOOL_STATUS_ICONS、TOOL_STATUS_LABELS、formatToolLine。各平台按需 import。"
    },
    {
      "id": "F4",
      "severity": "high",
      "category": "maintainability",
      "title": "Lark 和 Telegram 的 handleCommand 逻辑高度重复（约 180 行）",
      "description": "两个适配器的 /new /clear /model /session /stop /flush /undo /redo /help 共 9 条命令的处理逻辑几乎逐行一致，仅在消息发送和流式终结的具体 API 调用上不同。总计约 360 行（各 180 行）高度重复代码。",
      "evidenceFiles": [
        "src/platforms/lark/index.ts",
        "src/platforms/telegram/index.ts"
      ],
      "relatedMilestoneIds": [
        "M1"
      ],
      "recommendation": "抽取一个 CommandHandler 基类或 mixin，接收 reply(text)、finalizeStream(cs, text)、cleanupStream(cs) 等抽象回调，在一处维护命令逻辑。各平台 adapter 只需注入这些回调。"
    },
    {
      "id": "F5",
      "severity": "medium",
      "category": "maintainability",
      "title": "ChatState / 并发控制 / flushPendingMessages 三平台高度相似",
      "description": "busy 锁、pendingMessages 缓冲、stream 状态管理、getChatState、findChatStateBySid、flushPendingMessages 等核心并发逻辑在三个适配器中各实现一份，结构和流程高度一致。",
      "evidenceFiles": [
        "src/platforms/lark/index.ts",
        "src/platforms/telegram/index.ts",
        "src/platforms/wxwork/index.ts"
      ],
      "relatedMilestoneIds": [
        "M1"
      ],
      "recommendation": "考虑抽取一个 ChatStateManager<TTarget, TStream> 泛型类，封装 busy 锁、缓冲、查找、flush 等通用逻辑。各平台只需定义 Target 和 Stream 的类型参数。"
    },
    {
      "id": "F6",
      "severity": "low",
      "category": "maintainability",
      "title": "Lark/Telegram 消息去重 + 过期检测逻辑完全重复",
      "description": "messageDedup Set、常量（500/30000/60000）、cleanupDedupIfNeeded 方法在两个适配器中完全一致。",
      "evidenceFiles": [
        "src/platforms/lark/index.ts",
        "src/platforms/telegram/index.ts"
      ],
      "relatedMilestoneIds": [
        "M1"
      ],
      "recommendation": "提取为 MessageDedup 工具类，或并入上述 ChatStateManager。"
    },
    {
      "id": "F7",
      "severity": "high",
      "category": "maintainability",
      "title": "stream-controller.ts 是完整的死文件（42行），无任何调用方",
      "description": "TelegramStreamController 类在 Phase 2 升级后被废弃，所有流式状态已收敛到 ChatState.stream 中。该文件注释自述为「兼容桩」，但搜索整个 src/ 和 tests/ 目录，TelegramStreamController 类没有任何一处被 import 或实例化。TelegramStreamSnapshot 和 createEmptyStreamSnapshot 也仅在该文件内部互相引用。42 行纯死代码。",
      "evidenceFiles": [
        "src/platforms/telegram/stream-controller.ts",
        "src/platforms/telegram/types.ts"
      ],
      "relatedMilestoneIds": [
        "M2"
      ],
      "recommendation": "删除 stream-controller.ts。同时删除 types.ts 中仅服务于该文件的 TelegramStreamSnapshot 接口和 createEmptyStreamSnapshot 函数。"
    },
    {
      "id": "F8",
      "severity": "medium",
      "category": "maintainability",
      "title": "types.ts 中 TelegramChatState 接口是导出的死接口，与 index.ts 内部私有定义重复",
      "description": "types.ts L82-91 导出了 TelegramChatState 接口，但 index.ts L60-71 在内部重新定义了同名的 TelegramChatState 接口（且增加了 stream 字段）。搜索结果显示只有 index.ts 的私有版本在实际使用。types.ts 中的导出版本是 Phase 0 遗留，已被 Phase 2 的内嵌版本完全替代。",
      "evidenceFiles": [
        "src/platforms/telegram/types.ts",
        "src/platforms/telegram/index.ts"
      ],
      "relatedMilestoneIds": [
        "M2"
      ],
      "recommendation": "删除 types.ts 中的 TelegramChatState 接口。"
    },
    {
      "id": "F9",
      "severity": "medium",
      "category": "maintainability",
      "title": "TelegramMessageBuilder 类的 4 个方法中 3 个是单行透传，buildResponseText 是 identity 函数",
      "description": "TelegramMessageBuilder 是一个无状态的类，4 个方法：buildResponseText(text) 直接返回 text（identity）；buildErrorText 拼一个前缀；buildThinkingText 返回常量字符串；extractAssistantText 透传调用 extractText。没有任何内部状态、配置注入、或需要实例化的理由。特别是 extractAssistantText 在 src/ 和 tests/ 中均无调用方。把这些做成类没有增加任何价值，反而增加了 index.ts 的 constructor 复杂度。",
      "evidenceFiles": [
        "src/platforms/telegram/message-builder.ts",
        "src/platforms/telegram/index.ts"
      ],
      "relatedMilestoneIds": [
        "M2"
      ],
      "recommendation": "改为顶层导出的纯函数。如果只是返回固定字符串或拼前缀，甚至可以直接内联到调用处。删除 extractAssistantText（0调用方）。"
    },
    {
      "id": "F10",
      "severity": "medium",
      "category": "maintainability",
      "title": "TelegramClient 有 5 个方法定义后从未被调用",
      "description": "以下方法在 src/ 中仅有定义处一次出现（无调用方）：(1) sendPlainText — 仅 sendText 的零参版透传，测试中虽有 mock 但实际代码不调用；(2) onTextMessage — 被 onMessage 替代；(3) answerCallbackQuery — Phase 4 预设但 Phase 4 未实现；(4) setCommands — Phase 4 预设；(5) getConfig — 无调用方。另外 getBot 也无调用。",
      "evidenceFiles": [
        "src/platforms/telegram/client.ts"
      ],
      "relatedMilestoneIds": [
        "M2"
      ],
      "recommendation": "sendPlainText 和 onTextMessage 可直接删除。answerCallbackQuery/setCommands 是 Phase 4 预设，如果 Phase 4 尚未排期建议删除，实现时再加。getBot 和 getConfig 同理。注意 sendPlainText 被多个测试 mock 引用，需要同步修改测试。"
    },
    {
      "id": "F11",
      "severity": "medium",
      "category": "maintainability",
      "title": "LarkClient 有 4 个多媒体出站方法从未被调用（uploadImage/uploadFile/sendImage/sendFile）",
      "description": "lark/client.ts 中 uploadImage（L302-319）、uploadFile（L325-347）、sendImage（L355-378）、sendFile（L384-407）共 4 个方法，在 src/ 中均只有定义处出现，index.ts 没有任何地方调用它们。这些是 Phase 3 媒体「出站发送」的预设，但开发计划中 Phase 3 标记为已完成的只有媒体「下载/入站」部分。出站发送功能实际未接入。约 110 行预设代码。",
      "evidenceFiles": [
        "src/platforms/lark/client.ts",
        "src/platforms/lark/types.ts"
      ],
      "relatedMilestoneIds": [
        "M2"
      ],
      "recommendation": "如果出站媒体发送不在近期计划内，删除这 4 个方法及关联类型（LarkUploadImageResult、LarkUploadFileResult、LarkSendMediaOptions）。实现时再添加。"
    },
    {
      "id": "F12",
      "severity": "low",
      "category": "maintainability",
      "title": "LarkClient 的 getBotOpenId/getBotName/isWebSocketConnected 无外部调用方",
      "description": "这三个 getter 在 src/ 中仅有定义处。index.ts 在 start() 中直接使用 probe 返回的 botOpenId/botName，不通过 client.getBotOpenId()。isWebSocketConnected 无任何调用。",
      "evidenceFiles": [
        "src/platforms/lark/client.ts"
      ],
      "relatedMilestoneIds": [
        "M2"
      ],
      "recommendation": "如果未来确有需要可保留，但当前是纯预设。建议标记为 @internal 或删除。"
    },
    {
      "id": "F13",
      "severity": "low",
      "category": "maintainability",
      "title": "extractLarkText 是 extractLarkMessageContent 的单字段透传，只在测试中被调用",
      "description": "message-handler.ts L102-107 的 extractLarkText 函数仅返回 extractLarkMessageContent(message).text，在 src/ 中无调用方，仅 tests/lark-phase1.test.ts 使用。",
      "evidenceFiles": [
        "src/platforms/lark/message-handler.ts"
      ],
      "relatedMilestoneIds": [
        "M2"
      ],
      "recommendation": "可保留为测试便利函数。但如果追求精简，可以删除，测试直接调用 extractLarkMessageContent。"
    },
    {
      "id": "F14",
      "severity": "low",
      "category": "maintainability",
      "title": "ToolStatusEntry 接口导出后无任何调用方",
      "description": "telegram/message-builder.ts L40-45 导出的 ToolStatusEntry 接口在整个项目中未被引用。index.ts 的 tool:update 事件直接使用内联类型。",
      "evidenceFiles": [
        "src/platforms/telegram/message-builder.ts"
      ],
      "relatedMilestoneIds": [
        "M2"
      ],
      "recommendation": "删除该导出接口。"
    },
    {
      "id": "F15",
      "severity": "low",
      "category": "maintainability",
      "title": "TelegramMediaService 的 supportsOutboundMedia() 返回硬编码 false，无调用方",
      "description": "media.ts L33-35 的 supportsOutboundMedia() 方法在 src/ 中无任何调用。是出站媒体能力的预留桩。",
      "evidenceFiles": [
        "src/platforms/telegram/media.ts"
      ],
      "relatedMilestoneIds": [
        "M2"
      ],
      "recommendation": "删除。实现出站媒体时再添加。"
    },
    {
      "id": "F16",
      "severity": "low",
      "category": "maintainability",
      "title": "parseLarkSessionTarget / parseTelegramSessionTarget 在生产代码中均未使用",
      "description": "这两个函数仅在 types.ts 中定义并在 index.ts 中 import（但未使用），实际调用仅存在于测试文件中。在 lark/index.ts 中 parseLarkSessionTarget 被 import 但从未被调用。在 telegram/index.ts 同理。这些函数的意图是「从 sessionId 反解出 target」，但当前的 chatState 管理完全不需要这个反解能力。",
      "evidenceFiles": [
        "src/platforms/lark/types.ts",
        "src/platforms/telegram/types.ts",
        "src/platforms/lark/index.ts",
        "src/platforms/telegram/index.ts"
      ],
      "relatedMilestoneIds": [
        "M2"
      ],
      "recommendation": "保留函数本身（测试在用），但从 index.ts 的 import 列表中移除未使用的引用。"
    }
  ]
}
<!-- LIMCODE_REVIEW_METADATA_END -->
