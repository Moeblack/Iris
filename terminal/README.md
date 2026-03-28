# Iris Terminal

Iris 的终端命令界面集合，使用 [OpenTUI](https://opentui.com/) + React 构建。

当前已实现的命令界面：

- `onboard`：交互式配置引导
- `platforms`：平台配置界面
- `models`：模型配置界面

目录约定：

```txt
terminal/
  src/
    commands/
      onboard/
      platforms/
      models/
    shared/
```

其中：

- `commands/<name>/` 按终端命令名称组织界面代码
- `shared/` 放命令之间复用的运行时与公共部件
- 默认入口仍然是 `onboard`，因此 `iris onboard` 行为保持不变

## 开发

```bash
bun install

# 默认进入 onboard
bun run dev

# 显式指定命令
bun run dev:onboard
bun run dev -- platforms
bun run dev -- models
```

## 构建

```bash
bun run build
```

## 当前命令

### onboard

```bash
iris onboard
./iris-onboard onboard /path/to/iris
```

### platforms

```bash
iris platforms
./iris-onboard platforms /path/to/iris
```

`platforms` 会读取内置平台和当前可用 extension 的 `manifest.json`，根据其中的 `platforms[].panel` 声明生成平台参数输入界面，并只修改 `platform.yaml` 中的平台相关配置。

### models

```bash
iris models
./iris-onboard models /path/to/iris
```

`models` 会先读取 `llm.yaml` 中已配置的模型列表，让用户选择一个模型条目，再复用共享模型面板生成模型 ID / 模型别名输入界面。确认后只更新 `llm.yaml` 中所选模型条目，不修改平台配置。
