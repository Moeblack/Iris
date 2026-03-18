# 飞书 + Telegram 双平台适配器开发计划

## TODO LIST

<!-- LIMCODE_TODO_LIST_START -->
- [ ] Phase 0: 配置集成 — 修改 types.ts / platform.ts / index.ts / package.json，加入 lark 平台类型和配置解析  `#p0-config`
- [ ] Phase 1.1: LarkClient 封装 — 初始化 SDK Client + WSClient，WebSocket 连接管理  `#p1-client`
- [ ] Phase 1.2: 消息解析器 — 解析 text/post/image/file/audio 消息类型，提取文本和图片  `#p1-handler`
- [ ] Phase 1.3: LarkPlatform 主类 — 继承 PlatformAdapter，事件监听，并发控制，非流式回复  `#p1-platform`
- [ ] Phase 2.1: 卡片构建器 — 实现 thinking/streaming/complete/confirm 四态卡片 JSON 构建  `#p2-cardbuilder`
- [ ] Phase 2.3: 集成流式卡片到 LarkPlatform — 接入 Backend 流式事件  `#p2-integrate`
- [ ] Phase 2.2: 流式卡片控制器 — CardKit 创建/流式更新/关闭/中止，节流，reasoning 折叠面板  `#p2-streaming`
- [x] Phase 3: 多媒体处理 — 图片/文件下载、上传、发送  `#p3-media`
- [ ] Phase 4.1: 交互式工具审批 — Confirm 卡片 + card.action 回调 + backend.approveTool  `#p4-approval`
- [ ] Phase 4.2: Slash 命令 — /new /clear /model /session /stop /flush /help，卡片化展示  `#p4-commands`
- [ ] Phase 5: 消息编辑 + Undo/Redo — 利用 im.message.update 实现  `#p5-edit`
- [ ] Phase 6: 飞书官方 MCP 接入 — 配置文档，验证工具注册  `#p6-mcp`
- [ ] Phase 7: 健壮性 — 重连、去重、过期、错误降级、日志、超时  `#p7-robust`
- [ ] Telegram Phase 0: 目录重构与配置扩展 — 将 telegram 适配器拆分为 client / handler / builder / streaming / media / commands 模块  `#tg-p0-structure`
- [ ] Telegram Phase 1.1: TelegramClient 封装 — 封装 grammY Bot、消息发送/编辑/删除、文件下载、回调应答  `#tg-p1-client`
- [ ] Telegram Phase 1.2: 消息解析器 — 解析 text/caption/photo/document/voice/reply/topic/mention 等入站消息  `#tg-p1-handler`
- [ ] Telegram Phase 1.3: TelegramPlatform 主类 — 继承 PlatformAdapter，事件监听，并发控制，非流式回复  `#tg-p1-platform`
- [ ] Telegram Phase 2.1: 消息构建器 — 实现 thinking/streaming/complete/confirm 四态 HTML 消息与 Inline Keyboard 构建  `#tg-p2-builder`
- [x] Telegram Phase 2.2: 流式消息控制器 — 占位消息创建、节流编辑、完成/中止、reasoning 与工具状态汇总  `#tg-p2-streaming`
- [ ] Telegram Phase 2.3: 集成流式消息到 TelegramPlatform — 接入 Backend 流式事件  `#tg-p2-integrate`
- [x] Telegram Phase 3: 多媒体处理 — 图片/文件/语音下载、上传、发送、media group 处理  `#tg-p3-media`
- [ ] Telegram Phase 4.1: 交互式工具审批 — Confirm 消息 + Inline Keyboard 回调 + backend.approveTool  `#tg-p4-approval`
- [ ] Telegram Phase 4.2: Slash 命令 — /new /clear /model /session /stop /flush /help，按钮化展示  `#tg-p4-commands`
- [x] Telegram Phase 5: 消息编辑 + Undo/Redo — 利用 editMessageText / deleteMessage / 回复链实现  `#tg-p5-edit`
- [ ] Telegram Phase 6: 公共 MCP 能力对齐 — 在 Telegram 上完整展示公共 MCP 工具状态、审批、结果与回传文件  `#tg-p6-mcp`
- [x] Telegram Phase 7: 健壮性 — 重试、限流、去重、过期、错误降级、日志、超时、HTML 转义  `#tg-p7-robust`
- [ ] Telegram 适配器测试 — 参考飞书/企微测试先行流程，编写测试用例覆盖全部 TG Phase  `#tg-tests`
- [ ] 飞书适配器测试 — 参考企微的测试先行流程，编写测试用例覆盖全部 Phase  `#lark-tests`
<!-- LIMCODE_TODO_LIST_END -->


---

# Part A: 飞书 (Lark) 平台适配器

## 一、背景与目标

Iris 已有 Console、Discord、Telegram、Web、企业微信 五个平台适配器。本次新增飞书 (Lark/Feishu) 适配器，目标是充分利用飞书相对企微的显著优势：

| 能力 | 企微现状 | 飞书能力 |
|---|---|---|
| 流式输出 | `replyStream` 纯文本追加 | **CardKit 2.0 流式卡片**（打字机效果 + 思考折叠面板） |
| 消息编辑 | ❌ 不支持 | ✅ `im.message.update` / `im.message.patch` |
| 交互卡片 | 模板卡片，按钮只能跳 URL | ✅ 按钮/下拉/日期选择器 + 服务端回调 |
| 工具审批 | 被迫 autoApprove | ✅ 卡片按钮实现 Approve/Reject |
| 文档 MCP | 只写不读（8 个工具） | ✅ 官方 MCP 完整 CRUD（`@larksuiteoapi/lark-mcp`） |
| Undo/Redo | ❌ 无法实现 | ✅ 消息编辑 + 撤回 |
| 多媒体发送 | 需自建应用双通道 | ✅ 原生支持图片/文件/音频上传与发送 |

**核心依赖**: `@larksuiteoapi/node-sdk`（飞书官方 Node.js SDK，支持 WebSocket 长连接 + OpenAPI）

---

## 二、架构设计

### 2.1 目录结构

```
src/platforms/lark/
├── index.ts              # LarkPlatform 主类（PlatformAdapter 子类）
├── client.ts             # LarkClient 封装（SDK 初始化、WebSocket 连接、OpenAPI 调用）
├── message-handler.ts    # 入站消息解析（文本/图片/文件/音频/富文本/合并转发）
├── card-builder.ts       # CardKit 2.0 卡片构建（thinking/streaming/complete/confirm 四态）
├── card-streaming.ts     # 流式卡片控制器（创建卡片实体 → 流式更新 → 关闭流式模式）
├── media.ts              # 多媒体处理（图片/文件下载、上传、发送）
├── commands.ts           # Slash 命令处理（/new /clear /model /session /stop /flush /help）
└── types.ts              # 飞书相关类型定义
```

### 2.2 消息流程

```
入站: 飞书 WebSocket 事件 → message-handler 解析 → backend.chat(sessionId, text, images?, documents?)
出站(流式): stream:start → 创建 CardKit 流式卡片 → stream:chunk → 流式更新卡片内容
            → stream:end → 关闭流式模式 → done → 最终更新卡片为 complete 态
出站(非流式): response → 发送 Markdown 卡片
工具审批: tool:update(awaiting_approval) → 发送 Confirm 卡片(Approve/Reject 按钮)
         → 用户点击 → card.action 回调 → backend.approveTool(id, approved)
```

### 2.3 SessionId 格式

```
私聊: lark-dm-{user_open_id}
群聊: lark-group-{chat_id}
话题: lark-group-{chat_id}-thread-{thread_id}
```

### 2.4 与企微适配器的关键差异

| 方面 | 企微适配器 | 飞书适配器 |
|---|---|---|
| 连接方式 | `@wecom/aibot-node-sdk` WSClient | `@larksuiteoapi/node-sdk` wsClient |
| 流式回复 | `replyStream(frame, streamId, text, finish)` | CardKit: `card.create` → `cardElement.content` → `card.settings` |
| 回复方式 | 通过原始 frame 回复 | 通过 `im.message.create/reply` + `receive_id_type` |
| 工具审批 | 自动审批（无交互） | 卡片按钮交互 + `card.action.trigger` 回调 |
| 消息分段 | `splitText(text, 4000)` | 卡片内容无硬长度限制，超长内容用折叠面板 |

---

## 三、实现步骤

### Phase 0: 基础设施（配置集成）

修改以下文件，让 Iris 认识 `lark` 平台类型：

1. **`src/config/types.ts`** — `PlatformConfig.types` 数组加入 `'lark'`，新增 `lark` 子配置：
   ```typescript
   lark: {
     appId: string;        // 飞书自建应用 App ID
     appSecret: string;    // 飞书自建应用 App Secret
     /** 可选：验证 token（Webhook 模式用，WebSocket 模式不需要） */
     verificationToken?: string;
     /** 可选：加密 key（Webhook 模式用） */
     encryptKey?: string;
     /** 是否在流式回复中展示工具执行状态（默认 true） */
     showToolStatus?: boolean;
   }
   ```

2. **`src/config/platform.ts`** — `VALID_TYPES` 加入 `'lark'`，`parsePlatformConfig` 解析 lark 配置。

3. **`src/index.ts`** — switch-case 加入 `case 'lark'` 动态导入。

4. **`package.json`** — 加入依赖 `@larksuiteoapi/node-sdk`。

### Phase 1: 核心连接与文本对话

**目标**：能在飞书中与 AI 进行基本的文本对话。

1. **`src/platforms/lark/client.ts`** — 封装 SDK 初始化：
   - 使用 `@larksuiteoapi/node-sdk` 的 `Client` 类创建 API 客户端
   - 使用 `WSClient` 类创建 WebSocket 长连接（eventDispatcher 注册 `im.message.receive_v1` 等事件）
   - 封装 OpenAPI 调用：发送消息、编辑消息、撤回消息、上传媒体等

2. **`src/platforms/lark/message-handler.ts`** — 解析入站消息：
   - `im.message.receive_v1` 事件 → 解析 `message.message_type`
   - 支持 `text`（纯文本）、`post`（富文本）、`image`、`file`、`audio`、`media`、`merge_forward`
   - 解析 `@机器人` mention → 提取纯文本
   - 解析话题（`thread_id`）→ 区分 sessionId

3. **`src/platforms/lark/index.ts`** — LarkPlatform 主类：
   - 继承 `PlatformAdapter`
   - `start()`: 创建 client → 注册事件 → 建立 WebSocket 连接
   - `stop()`: 断开连接
   - 并发控制：同企微方案（chatKey → ChatState → busy 锁 + pendingMessages）
   - 非流式模式：监听 `response` 事件 → `im.message.create` 发送 Markdown 卡片

### Phase 2: CardKit 流式卡片

**目标**：实现飞书独有的流式卡片打字机效果。

1. **`src/platforms/lark/card-builder.ts`** — 构建四态卡片 JSON：
   - `thinking` — 思考中占位卡片（动画 icon + "思考中..."）
   - `streaming` — 流式内容卡片（CardKit streaming_mode + element_id）
   - `complete` — 最终完成卡片（折叠 reasoning 面板 + 正文 + 工具摘要 + 耗时 footer）
   - `confirm` — 工具审批卡片（操作描述 + Approve/Reject 按钮）

2. **`src/platforms/lark/card-streaming.ts`** — 流式卡片控制器：
   - `ensureCardCreated()`: 调用 CardKit `card.create` API 创建卡片实体（带 streaming_mode: true）→ `im.message.create` 发送卡片引用 → 获得 messageId
   - `updateContent(text)`: 调用 `cardElement.content` API 更新流式内容（节流 200ms）
   - `finalize()`: 调用 `card.settings` 关闭 streaming_mode → `card.update` 设置最终卡片内容
   - `abort()`: 中止流式 → 关闭 streaming_mode → 更新为"已中止"卡片
   - 思考阶段：记录 reasoning 文本和时长，最终渲染为折叠面板

3. 修改 `index.ts` 中 Backend 事件监听：
   - `stream:start` → `ensureCardCreated()`
   - `stream:chunk` → 累积 buffer → 节流调用 `updateContent()`
   - `stream:parts` → 解析 thought parts → 更新 reasoning 状态
   - `stream:end` → 记录 usage
   - `done` → `finalize()` 生成最终卡片
   - `error` → 更新卡片为错误态

### Phase 3: 多媒体处理

**目标**：支持图片/文件的收发。

1. **`src/platforms/lark/media.ts`**：
   - **下载**：调用 `im.message.resources` API 下载图片/文件 → 转为 `ImageInput` / `DocumentInput`
   - **上传**：调用 `im.image.create` / `im.file.create` 上传媒体 → 获得 `image_key` / `file_key`
   - **发送图片**：`im.message.create` msgtype=image，content=`{"image_key":"..."}`
   - **发送文件**：`im.message.create` msgtype=file，content=`{"file_key":"..."}`

2. 入站处理：
   - `message_type: image` → 下载图片 → `backend.chat(sid, '', [imageInput])`
   - `message_type: file` → 下载文件 → `backend.chat(sid, '', [], [docInput])`
   - `message_type: post` → 遍历富文本元素 → 提取文本 + 图片

### Phase 4: 交互式卡片（工具审批 + Slash Commands）

**目标**：利用飞书卡片按钮实现交互式工具审批和命令 UI。

1. **工具审批**：
   - `tool:update` 事件中检测 `awaiting_approval` 状态
   - 构建 Confirm 卡片（描述 + 工具名 + 参数预览 + Approve/Reject 按钮）
   - 注册 `card.action.trigger` 事件回调 → 解析 `action.value` → `backend.approveTool(id, approved)`
   - 审批结果后更新卡片为"已批准"/"已拒绝"

2. **`src/platforms/lark/commands.ts`** — Slash 命令处理：
   - 复用企微适配器的命令逻辑，但用飞书卡片呈现结果
   - `/model` → 模型列表卡片（每个模型一个按钮，点击切换）
   - `/session` → 会话列表卡片（每个会话一行，点击切换）
   - `/stop` → 中止 + abort 流式卡片
   - `/flush` → 打断 + 处理缓冲消息
   - `/help` → 帮助信息卡片

### Phase 5: 消息编辑与 Undo/Redo

**目标**：利用飞书消息编辑能力实现 undo/redo。

1. 维护 `lastBotMessageId` 映射（chatKey → messageId）
2. `/undo`:
   - 调用 `backend.truncateHistory(sid, history.length - 2)` 回滚最后一轮
   - 调用 `im.message.update` 编辑最后一条机器人消息为 "~~已撤销~~"
3. `/redo`:
   - 从内存栈恢复消息
   - 调用 `im.message.update` 恢复消息内容

### Phase 6: 飞书官方 MCP 接入（仅配置）

**目标**：接入飞书官方 MCP Server，获得完整文档/表格/日历/任务 CRUD 能力。

1. 文档配置（`data/configs/mcp.yaml`）：
   ```yaml
   mcp:
     servers:
       lark-mcp:
         transport: streamable-http
         url: "https://mcp.feishu.cn/sse?app_id={app_id}&app_secret={app_secret}"
   ```
   或本地模式：
   ```yaml
   mcp:
     servers:
       lark-mcp:
         transport: stdio
         command: "npx"
         args: ["@anthropic-ai/lark-mcp", "--app-id", "{app_id}", "--app-secret", "{app_secret}"]
   ```

2. 配置后 AI 自动获得飞书文档/多维表格/日历/任务的完整工具集。

### Phase 7: 健壮性与生产可用

1. **重连机制**：WebSocket 断线自动重连（SDK 内置）
2. **消息去重**：维护 `messageDedup` Set，跳过重连时重放的消息
3. **消息过期**：丢弃 `create_time` 超过 30s 的旧消息
4. **错误处理**：API 调用失败的优雅降级（CardKit 失败 → 回退到普通消息）
5. **日志**：使用 `createLogger('Lark')` 统一日志
6. **超时保护**：媒体下载 30s 超时

---

## 四、配置示例

```yaml
# data/configs/platform.yaml
platform:
  type: lark
  lark:
    appId: "cli_xxxxxxxxxxxx"
    appSecret: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
    showToolStatus: true

# data/configs/mcp.yaml
mcp:
  servers:
    lark-mcp:
      transport: streamable-http
      url: "https://mcp.feishu.cn/sse?app_id=cli_xxxxxxxxxxxx&app_secret=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

---

## 五、工时估算

| 阶段 | 内容 | 估时 |
|---|---|---|
| Phase 0 | 配置集成（types + platform + index） | 0.5h |
| Phase 1 | 核心连接 + 文本对话 | 3-4h |
| Phase 2 | CardKit 流式卡片 | 4-5h |
| Phase 3 | 多媒体处理 | 2-3h |
| Phase 4 | 交互式卡片（工具审批 + 命令 UI） | 3-4h |
| Phase 5 | 消息编辑 + Undo/Redo | 2h |
| Phase 6 | 飞书 MCP 接入（仅配置） | 0.5h |
| Phase 7 | 健壮性 + 测试 | 2-3h |
| **总计** | | **17-22h** |

---

## 六、风险与注意事项

1. **飞书 SDK WebSocket 模式**：需要在飞书开放平台创建自建应用，开启"机器人"能力，配置事件订阅。WebSocket 模式不需要公网 IP，但需要应用的 App ID 和 App Secret。

2. **CardKit 2.0 API**：流式卡片是较新的 API，需要确认 SDK 版本是否支持。参考 openclaw-lark 的 `cardkit.ts` 实现。

3. **权限申请**：飞书自建应用需要申请以下权限：
   - `im:message` — 发送/接收消息
   - `im:message:send_as_bot` — 以机器人身份发送
   - `im:resource` — 下载消息中的媒体资源
   - `im:chat` — 获取群信息
   - `contact:user.base:readonly` — 获取用户基本信息（用于 mention 解析）

4. **与企微适配器的代码复用**：并发控制（ChatState + busy 锁 + pendingMessages）、Slash 命令逻辑、工具状态格式化等可提取为 shared 工具或直接参考实现。


---

# Part B: Telegram 适配器重构（目标：能力看齐飞书版本）

## 一、背景与目标

当前 Iris 的 Telegram 适配器（`src/platforms/telegram/index.ts`）仅 102 行，仍停留在「最小可用」状态。此次不再只做补丁式增强，而是按飞书适配器同等级别重构，目标是在 Telegram 上补齐完整的平台能力，只保留 Telegram 原生能力边界带来的差异。

| 能力 | 当前状态 | Telegram 对齐目标 |
|---|---|---|
| 流式输出 | ❌ 缓存后一次发送 | ✅ `sendMessage` + `editMessageText` 实现实时流式编辑 |
| 消息编辑 | ❌ 未使用 | ✅ `editMessageText` / `editMessageCaption` / `deleteMessage` |
| 交互式消息 | ❌ 无 | ✅ Inline Keyboard 按钮、回调、列表选择 |
| 工具审批 | ❌ 自动批准 | ✅ Approve/Reject 按钮 + `callback_query` 回调 |
| 多媒体发送 | ❌ 不支持 | ✅ 图片 / 文件 / 语音下载、上传、发送 |
| 会话管理 | ❌ 无 | ✅ `/new` `/session` `/clear` `/stop` `/flush` |
| Undo/Redo | ❌ 无 | ✅ 通过消息编辑、删除与历史截断实现 |
| 话题 / 群触发 | ❌ 无 | ✅ 私聊、群聊 @、超级群 topic 全支持 |
| 公共 MCP 能力展示 | ⚠️ 仅公共层可用，平台侧无展示 | ✅ 工具状态、审批、结果、文件回传完整可见 |

**核心依赖**: `grammy`（已存在），并充分利用 Telegram Bot API 的消息编辑、Inline Keyboard、文件下载与多媒体发送能力。

---

## 二、架构设计

### 2.1 目录结构

```
src/platforms/telegram/
├── index.ts              # TelegramPlatform 主类（PlatformAdapter 子类）
├── client.ts             # TelegramClient 封装（Bot 初始化、API 调用、文件下载、命令注册）
├── message-handler.ts    # 入站消息解析（文本/图片/文件/语音/回复/话题/mention）
├── message-builder.ts    # HTML 消息构建（thinking/streaming/complete/confirm 四态）
├── stream-controller.ts  # 流式消息控制器（创建占位 → 节流编辑 → 完成/中止）
├── media.ts              # 多媒体处理（下载、上传、发送、media group）
├── commands.ts           # Slash 命令处理（/new /clear /model /session /stop /flush /help）
└── types.ts              # Telegram 相关类型定义
```

### 2.2 消息流程

```
入站: Telegram update → message-handler 解析 → backend.chat(sessionId, text, images?, documents?)
出站(流式): stream:start → 创建占位消息 → stream:chunk → 节流 editMessageText
            → stream:end → 记录 usage / 工具状态 → done → 最终编辑为 complete 态
出站(非流式): response → 发送 HTML 消息或媒体消息
工具审批: tool:update(awaiting_approval) → 发送 Confirm 消息(Approve/Reject 按钮)
         → 用户点击 → callback_query → backend.approveTool(id, approved)
```

### 2.3 SessionId 格式

```
私聊: telegram-dm-{chat_id}
群聊: telegram-group-{chat_id}
话题: telegram-group-{chat_id}-thread-{message_thread_id}
```

### 2.4 与飞书适配器的关键差异

| 方面 | 飞书适配器 | Telegram 适配器 |
|---|---|---|
| 连接方式 | `@larksuiteoapi/node-sdk` WebSocket | `grammy` Update 轮询 / Webhook |
| 流式承载 | CardKit 流式卡片 | `editMessageText` 持续编辑同一条消息 |
| 交互 UI | 卡片按钮 / 下拉 / 表单 | Inline Keyboard 按钮 + callback_query |
| reasoning 展示 | 折叠面板 | HTML 分区展示，必要时拆成摘要 + 正文 |
| 消息长度 | 卡片内容较宽松 | 文本 4096 字符，需要 HTML 感知分段与回退 |
| 平台 MCP | 可接飞书官方 MCP | 无 Telegram 官方 MCP，沿用 Iris 公共 MCP 能力 |

---

## 三、实现步骤

### TG-Phase 0: 基础设施与目录重构

**目标**：先把现有 102 行单文件适配器拆成可维护结构，为后续能力对齐打基础。

1. **`src/platforms/telegram/`** 拆分为 `client.ts`、`message-handler.ts`、`message-builder.ts`、`stream-controller.ts`、`media.ts`、`commands.ts`、`types.ts`。
2. 如有需要，扩展 Telegram 配置项（如 `showToolStatus`、群聊触发策略等），避免把行为开关硬编码在实现里。
3. 补齐共享类型定义，统一 chatKey、sessionId、stream state、approval state 的表达。

### TG-Phase 1: 核心连接与文本对话

**目标**：让 Telegram 具备与飞书 Phase 1 同级的文本与事件处理基础。

1. **`src/platforms/telegram/client.ts`** — 封装 Bot 与 API 调用：
   - 初始化 `Bot` 实例
   - 封装发送、编辑、删除、回复、answerCallbackQuery
   - 封装 `getFile`、文件下载、命令注册
   - 统一错误重试与限流错误处理

2. **`src/platforms/telegram/message-handler.ts`** — 解析入站消息：
   - 支持 `text`、`caption`、`photo`、`document`、`voice`、`audio`、`video_note`
   - 解析 reply、forward、media group、supergroup topic
   - 解析群聊 `@bot` mention，仅在 DM 或被触发时响应
   - 提取纯文本、图片、文件、语音输入给 Backend

3. **`src/platforms/telegram/index.ts`** — TelegramPlatform 主类：
   - 继承 `PlatformAdapter`
   - `start()`: 创建 client → 注册 update / callback / command 监听 → 启动 bot
   - `stop()`: 停止 bot，清理节流与待处理状态
   - 并发控制：复用企微的 ChatState + busy 锁 + pendingMessages
   - 非流式模式：监听 `response` 事件并发送 HTML 消息

### TG-Phase 2: 流式消息渲染

**目标**：让 Telegram 在体验层尽量贴近飞书的流式反馈。

1. **`src/platforms/telegram/message-builder.ts`** — 构建四态消息：
   - `thinking` — 思考中占位消息
   - `streaming` — 流式消息（正文 + reasoning 摘要 + 工具状态）
   - `complete` — 最终完成消息（正文 + reasoning 摘要 + 工具摘要 + 耗时）
   - `confirm` — 工具审批消息（描述 + 参数预览 + Inline Keyboard）

2. **`src/platforms/telegram/stream-controller.ts`** — 流式消息控制器：
   - `ensureMessageCreated()`: 发送占位消息并记录 `message_id`
   - `updateContent(text)`: 节流调用 `editMessageText`
   - `finalize()`: 编辑为最终 complete 态
   - `abort()`: 中止流式并更新为“已中止”
   - 持续累积 reasoning、tool status、usage，用于最终渲染

3. 修改 `index.ts` 中 Backend 事件监听：
   - `stream:start` → `ensureMessageCreated()`
   - `stream:chunk` → 累积 buffer → 节流调用 `updateContent()`
   - `stream:parts` → 提取 thought parts → 更新 reasoning 状态
   - `stream:end` → 记录 usage
   - `done` → `finalize()` 生成最终消息
   - `error` → 编辑消息为错误态

### TG-Phase 3: 多媒体处理

**目标**：支持图片、文件、语音的完整收发能力。

1. **`src/platforms/telegram/media.ts`**：
   - **下载**：`getFile` → 下载图片 / 文件 / 语音 → 转为 `ImageInput` / `DocumentInput`
   - **上传**：封装 `InputFile` / Buffer 上传
   - **发送图片**：`sendPhoto`
   - **发送文件**：`sendDocument`
   - **发送语音/音频**：`sendVoice` / `sendAudio`
   - **media group**：将多图消息合并处理

2. 入站处理：
   - `photo` → 下载最高分辨率图片 → `backend.chat(sid, '', [imageInput])`
   - `document` → 下载文件 → `backend.chat(sid, '', [], [docInput])`
   - `voice/audio` → 下载语音 → 转写或传入 Backend
   - `caption` → 与媒体共同解析，保留文本上下文

### TG-Phase 4: 交互式消息（工具审批 + Slash Commands）

**目标**：在 Telegram 上补齐交互式审批和命令 UI。

1. **工具审批**：
   - `tool:update` 中检测 `awaiting_approval`
   - 构建 Confirm 消息（工具名 + 参数预览 + Approve/Reject 按钮）
   - 监听 `callback_query` → 解析按钮 payload → `backend.approveTool(id, approved)`
   - 审批结果后编辑原消息为“已批准”/“已拒绝”

2. **`src/platforms/telegram/commands.ts`** — Slash 命令处理：
   - 注册 `/new`、`/clear`、`/model`、`/session`、`/stop`、`/flush`、`/help`
   - `/model` → 模型列表消息 + Inline Keyboard 选择
   - `/session` → 会话列表消息 + Inline Keyboard 切换
   - `/stop` → 中止当前流式消息
   - `/flush` → 打断等待，立即处理缓冲消息
   - `/help` → 帮助信息消息

### TG-Phase 5: 消息编辑与 Undo/Redo

**目标**：利用 Telegram 的消息编辑与删除能力实现回滚体验。

1. 维护 `lastBotMessageId` 映射（chatKey → messageId）
2. `/undo`:
   - 调用 `backend.truncateHistory(sid, history.length - 2)` 回滚最后一轮
   - 优先 `editMessageText` 将上一条机器人消息标记为“已撤销”
   - 如消息类型不支持编辑，则回退为删除并发送撤销说明
3. `/redo`:
   - 从内存栈恢复消息
   - 再次编辑或重发机器人消息

### TG-Phase 6: 公共 MCP 能力对齐（非 Telegram 官方特性）

**目标**：虽然 Telegram 没有飞书那样的官方平台级 MCP，但平台体验应完整承接 Iris 公共 MCP 能力。

1. 确保 MCP 工具调用在 Telegram 中具备完整状态展示：等待审批、执行中、成功、失败。
2. 确保 MCP 结果可按类型正确回传：文本、长文本分段、图片、文件。
3. 当 MCP 工具产出文件时，优先走 Telegram 文件发送，而不是只输出路径文本。
4. 在 `/help` 或工具审批消息中明确区分公共 MCP 工具与平台交互动作。

### TG-Phase 7: 健壮性与生产可用

1. **消息去重**：跳过重复 update、重复 callback、重复 media group 片段
2. **消息过期**：丢弃超时 update，避免 bot 重启后处理旧消息
3. **限流与重试**：处理 Telegram 429 / flood control，按 `retry_after` 退避
4. **HTML 安全**：严格转义用户输入与工具输出，避免格式破坏
5. **长度回退**：超过 4096 字符时自动分段，必要时转文件发送
6. **日志**：使用 `createLogger('Telegram')` 统一日志
7. **超时保护**：文件下载、消息编辑、回调处理增加超时控制

## 四、工时估算

| 阶段 | 内容 | 估时 |
|---|---|---|
| TG-Phase 0 | 目录重构与配置扩展 | 1h |
| TG-Phase 1 | 核心连接 + 文本对话 | 3-4h |
| TG-Phase 2 | 流式消息渲染 | 4-5h |
| TG-Phase 3 | 多媒体处理 | 2-3h |
| TG-Phase 4 | 交互式消息（工具审批 + 命令 UI） | 3-4h |
| TG-Phase 5 | 消息编辑 + Undo/Redo | 2h |
| TG-Phase 6 | 公共 MCP 能力对齐 | 1-2h |
| TG-Phase 7 | 健壮性 + 测试联调 | 2-3h |
| **总计** | | **18-24h** |

---

# Part C: 开发流程（测试先行）

参考企微适配器的开发经验，两个平台都采用「测试先行」流程：

1. **调研阶段**（已完成）：阅读参考代码，编写调研文档，制定计划
2. **测试编写**：先编写测试用例，覆盖所有核心行为
3. **实现开发**：基于测试用例逐步实现功能
4. **集成测试**：连接真实平台，验证端到端行为

### 参考代码位置

| 参考项 | 路径 |
|---|---|
| openclaw-lark（飞书） | `2026-03-15 Iris企业微信Channel调研报告/openclaw-lark/` |
| openclaw-telegram（Telegram） | `2026-03-15 Iris企业微信Channel调研报告/openclaw-telegram/` |
| openclaw-wecom（企微） | `2026-03-15 Iris企业微信Channel调研报告/wecom-openclaw-plugin/` |
| Iris 企微适配器 | `src/platforms/wxwork/index.ts` |
| Iris Telegram 适配器 | `src/platforms/telegram/index.ts` |
| Iris Discord 适配器 | `src/platforms/discord/index.ts` |
| 飞书 SDK | `@larksuiteoapi/node-sdk` (npm) |
| 飞书 CardKit API 文档 | https://open.feishu.cn/document/cardkit-v1/streaming-updates-openapi-overview |

### 总工时估算

| 平台 | 估时 |
|---|---|
| 飞书适配器 | 17-22h |
| Telegram 适配器重构 | 18-24h |
| **合计** | **35-46h** |
