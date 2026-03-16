# Iris

一个面向多平台的智能代理程序。支持 Console、Web、Discord、Telegram、企业微信等平台，支持工具调用、会话存储、图片输入、OCR 回退、MCP 和记忆能力。

## 特性

- 多平台：Console / Web / Discord / Telegram / 企业微信（WXWork）
- 多模型提供商：Gemini / OpenAI 兼容 / OpenAI Responses / Claude
- 模型池：通过 `llm.models.<modelName>` 管理多个模型，运行时可切换
- 工具系统：内置文件、命令、计划、搜索、记忆、子代理等工具
- MCP：连接外部 MCP 服务器扩展工具能力，支持按 Provider 自动降级 Schema
- 会话存储：JSON 文件或 SQLite
- 图片输入：支持 vision 模型直连，也支持 OCR 回退
- 模式系统：支持自定义模式和系统提示词覆盖
- TUI 界面：基于 [OpenTUI](https://opentui.com/) + React，支持 Markdown 渲染、工具状态展示、撤销/恢复

## 快速开始

### 方式一：交互式引导安装（推荐）

Iris 提供了 `onboard` 交互式配置引导工具，可以通过 TUI 界面引导完成全部配置：

```bash
# Linux / macOS 一键安装（自动下载 + 配置引导 + 服务安装）
curl -fsSL https://raw.githubusercontent.com/Lianues/Iris/main/deploy/linux/install.sh | bash
```

安装脚本会自动：
1. 检测系统环境（Linux / Termux）和架构（x64 / arm64）
2. 安装运行时依赖
3. 从 GitHub Release 下载预编译包
4. 运行 `onboard` 交互式配置引导
5. 安装 systemd 服务（仅 Linux）

支持的环境变量：
- `IRIS_VERSION`：指定版本（默认 latest）
- `IRIS_MIRROR`：下载镜像前缀（如 `https://ghproxy.com/`）
- `IRIS_INSTALL_DIR`：自定义安装目录

#### Onboard 配置引导流程

1. **欢迎页** — 介绍 Iris 和配置流程
2. **选择 LLM 提供商** — Gemini / OpenAI / Claude
3. **输入 API Key** — 带遮罩的密码输入
4. **模型配置** — 模型别名、模型 ID、Base URL（提供默认值）
5. **选择平台** — Console / Web / 企业微信
6. **确认写入** — 预览配置并写入 `data/configs/*.yaml`

### 方式二：手动安装

> Iris 使用 [Bun](https://bun.sh) 作为运行时和包管理器。

```bash
# 安装 Bun（如果尚未安装）
curl -fsSL https://bun.sh/install | bash

# 克隆仓库
git clone https://github.com/Lianues/Iris.git
cd Iris

# 安装项目依赖
bun install

# Web UI 依赖（如需使用 Web 平台）
cd src/platforms/web/web-ui && npm install && cd ../../../..

# 或使用一键命令安装全部依赖
bun run setup
```

复制配置模板：

```bash
# macOS / Linux
cp -r data/configs.example data/configs

# Windows PowerShell
Copy-Item -Recurse data/configs.example data/configs
```

然后编辑以下配置文件：

#### `data/configs/llm.yaml`

填入模型池配置：

```yaml
defaultModel: gemini_flash

models:
  gemini_flash:
    provider: gemini
    apiKey: your-api-key-here
    model: gemini-2.0-flash
    baseUrl: https://generativelanguage.googleapis.com/v1beta
    supportsVision: true
```

说明：

- `defaultModel` 填写模型名称，即 `models` 下的键名
- `model` 填写提供商真实模型 ID
- `/model gemini_flash` 可在运行时切换

`supportsVision` 说明：

- 可选，推荐显式填写
- `true`：支持图片输入，图片直接发给模型
- `false`：不支持图片输入，若配置了 `ocr.yaml` 则先 OCR 再发文本
- 不填写时按模型名启发式判断，自定义模型名或代理网关建议手动声明

`baseUrl` 规则：

- Gemini：以 `/v1beta` 结尾
- OpenAI 兼容、OpenAI Responses、Claude：以 `/v1` 结尾

例如 OpenAI Responses：

```yaml
defaultModel: gpt4o

models:
  gpt4o:
    provider: openai-responses
    apiKey: your-api-key-here
    model: gpt-4o
    baseUrl: https://api.openai.com/v1
    supportsVision: true
```

#### `data/configs/ocr.yaml`（可选）

当模型不支持图片输入时，配置 OCR 模型以支持图片上传：

```yaml
provider: openai-compatible
apiKey: your-api-key-here
baseUrl: https://api.openai.com/v1
model: gpt-4o-mini
```

#### `data/configs/platform.yaml`

选择启动平台：

```yaml
# 单平台
type: console

# 多平台同时启动
type: [console, web]
```

各平台配置：

```yaml
# Web
web:
  port: 8192
  host: 127.0.0.1

# 企业微信
wxwork:
  botId: your-bot-id
  secret: your-bot-secret
  # showToolStatus: false  # 工具状态展示（默认 true）

# Discord / Telegram
discord:
  token: your-discord-bot-token
telegram:
  token: your-telegram-bot-token
```

#### `data/configs/mcp.yaml`（可选）

连接外部 MCP 服务器扩展工具能力：

```yaml
servers:
  # 本地进程（stdio 传输）
  filesystem:
    transport: stdio
    command: npx
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"]

  # 远程服务器（HTTP 传输）
  remote_tools:
    transport: streamable-http
    url: https://mcp.example.com/sse

  # 企微官方文档 MCP（智能表格 + 文档 CRUD）
  wecom-doc:
    transport: streamable-http
    url: "https://qyapi.weixin.qq.com/mcp/robot-doc?apikey=your-mcp-apikey"
```

MCP 工具的 JSON Schema 会按 Provider 自动降级处理，无需手动适配。详见 [docs/llm.md](docs/llm.md#mcp-工具-schema-降级)。

### 启动

```bash
bun run dev
```

## 常用命令

### Console

| 命令 | 说明 |
|------|------|
| `/new` | 新建会话 |
| `/load` | 加载历史会话 |
| `/model` | 查看可用模型 |
| `/model <name>` | 切换当前模型 |
| `/undo` | 撤销上一条消息 |
| `/redo` | 恢复已撤销的消息 |
| `/settings` | 打开设置中心 |
| `/mcp` | 打开 MCP 设置页 |
| `/exit` | 退出程序 |

### 企业微信

| 命令 | 说明 |
|------|------|
| `/stop` | 中止当前 AI 回复 |
| `/flush` | 中止当前回复并立即处理缓冲消息 |
| `/session` | 查看/切换历史会话 |

## 配置说明

详细配置见：

- [docs/config.md](docs/config.md) — 配置文件总览
- [docs/llm.md](docs/llm.md) — LLM 格式适配与 MCP Schema 降级
- [docs/platforms.md](docs/platforms.md) — 各平台适配说明
- [docs/tools.md](docs/tools.md) — 工具注册与调度
- [docs/core.md](docs/core.md) — 核心 Backend 逻辑
- [docs/media.md](docs/media.md) — 文档/图片处理

## 开发

```bash
# 运行
bun run dev

# 构建
bun run build

# 测试
bun run test
```

## Linux 部署

提供一键安装脚本，支持 systemd 服务和 Nginx 反代：

```bash
curl -fsSL https://raw.githubusercontent.com/Lianues/Iris/main/deploy/linux/install.sh | bash
```

支持 Ubuntu、Debian、CentOS、Fedora、Alpine、Arch 以及 Termux (Android)。

详见 [docs/deploy.md](docs/deploy.md)。
