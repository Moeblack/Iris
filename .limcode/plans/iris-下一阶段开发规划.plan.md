## TODO LIST

<!-- LIMCODE_TODO_LIST_START -->
- [ ] WXWork 分支 rebase 到 upstream/main + 清理调研文件 + 压缩 commit  `#s0-1`
- [ ] 提 WXWork PR #5（企微 Channel 适配器）  `#s0-2`
- [ ] 桥接：wxwork /stop 调用 backend.abortChat(sessionId)  `#s0-3`
- [ ] 定义 UserContext 类型 + UserResolver 接口  `#s1-1`
- [ ] WXWork UserResolver 实现  `#s1-2`
- [ ] PlatformAdapter + Backend.chat() 接受 UserContext  `#s1-3`
- [ ] Backend 按 UserContext 过滤工具 + 注入提示词  `#s2-1`
- [ ] tools.yaml 扩展 allowedRoles 配置  `#s2-2`
- [ ] 审计日志  `#s2-3`
- [ ] 企微文档 MCP Server  `#s3-1`
- [ ] 审批流 MCP Server  `#s3-2`
- [ ] 日程/会议 MCP Server  `#s3-3`
<!-- LIMCODE_TODO_LIST_END -->


# Iris 下一阶段开发规划

## 当前状态

| 项目 | 状态 |
|------|------|
| PR #4（abort + 测试） | 已推送，等 maintainer review |
| `feature/wxwork-channel` 分支 | 本地有 13 个 commit，未 rebase 到上游 main，未提 PR |
| 上游 main | 已切 Bun 运行时、加了 OpenTUI、加了工具审批、已有基础 abort |

## 阶段 0：收尾当前工作（立即可做）

### 0-1. WXWork 分支 rebase + PR

`feature/wxwork-channel` 基于旧 main（`ec9942e`），上游已大幅变化。需要：

1. **rebase 到 upstream/main**：预计冲突集中在 `package.json`、`src/index.ts`、`src/config/`
2. **清理调研文档和临时文件**：`docs/_tmp_write2.js`、`docs/smartsheet-*.md`、调研参考仓库的源码（5 万多行），这些不应进入 PR
3. **压缩 commit**：13 个 → 2~3 个（feat: wxwork adapter、feat: wxwork slash 指令 + 并发控制）
4. **提 PR #5**：`feat: 企业微信 Channel 适配器`

### 0-2. 桥接 abort → wxwork

PR #4 合入后，`WXWorkPlatform` 的 `/stop` 和 `/flush` 指令需要调用 `backend.abortChat(sessionId)`。这是一个小改动，直接在 wxwork PR 里做或单独 commit。

## 阶段 1：用户身份映射（auth 层）

**目标**：让系统知道"谁在说话"。

### 1-1. 定义 UserContext 类型

```typescript
// src/auth/types.ts
interface UserContext {
  platformUserId: string;   // 平台原始 ID（企微 userid / Discord snowflake）
  internalUserId: string;   // 系统内部 ID
  displayName: string;
  role: 'admin' | 'user' | 'viewer';
  groups?: string[];        // 部门/群组
}
```

### 1-2. UserResolver 接口 + WXWork 实现

```typescript
// src/auth/resolver.ts
interface UserResolver {
  resolve(platformType: string, platformUserId: string): Promise<UserContext>;
}
```

WXWork 实现通过企微通讯录 API 获取用户信息，映射到内部角色。

### 1-3. PlatformAdapter 接口扩展

`chat()` 方法签名加 `userContext?: UserContext`，透传到 Backend。

**产出**：PR #6，约 3 个文件新增 + 2 个文件修改。

## 阶段 2：权限管理

**目标**：不同角色看到不同的工具、不同的系统提示词。

### 2-1. Backend.chat() 接受 UserContext

根据 role/groups 动态：
- 过滤 toolPolicies（viewer 不能用写入类工具）
- 注入角色相关的系统提示词片段（通过 `extraParts`）

### 2-2. 工具权限配置

在 `tools.yaml` 中扩展：

```yaml
permissions:
  read_file:
    autoApprove: true
    allowedRoles: [admin, user]
  execute_command:
    autoApprove: false
    allowedRoles: [admin]
```

### 2-3. 审计日志

记录谁用了什么工具、什么参数、什么结果。

**产出**：PR #7，约 5 个文件修改。

## 阶段 3：MCP 集成企业工具

**目标**：通过 MCP 接入企微文档、审批流、日程等 OA 能力。

### 3-1. 企微文档 MCP Server

- 读取/搜索企微文档
- 创建/编辑文档

### 3-2. 审批流 MCP Server

- 查询审批模板
- 发起审批
- 查询审批状态

### 3-3. 日程/会议 MCP Server

这些作为独立的 MCP server 仓库开发，Iris 通过 `mcp.yaml` 配置连接。

**产出**：独立仓库 + Iris 侧的配置示例 PR。

## 依赖关系

```
PR #4 (abort)  ───┐
                  ├──→  阶段 1 (auth)  ──→  阶段 2 (permissions)  ──→  阶段 3 (MCP)
PR #5 (wxwork) ───┘
```

PR #4 和 PR #5 可以并行 review。阶段 1 依赖两者都合入。
