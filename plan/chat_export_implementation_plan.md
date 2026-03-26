# 聊天记录导出器实现计划

> **面向 AI 代理的工作说明：** 后续实现本计划时，建议使用 `superpowers:subagent-driven-development` 或 `superpowers:executing-plans` 逐任务推进。所有任务步骤使用复选框跟踪，先测试、后实现、再验证。
>
> **目标：** 交付“共享导出核心 + VS Code 插件优先 + Codex 插件二期”的聊天记录导出产品，满足：
> - 每会话固定一个导出文件夹
> - 正文分组 + 6 类上下文分组全可勾选
> - 默认 3 种导出模式 + 自定义模式
> - 单文档 / 多文档 / 附录 / 拆分
> - 正文时间戳与时间区间裁切
> - 用户自选导出根目录
>
> **架构：** 首期把当前 Python 原型冻结为“参考实现（oracle）”，并重构出一个 TypeScript 共享核心供 VS Code 插件调用；二期 Codex 插件复用同一核心，不重复造轮子。
>
> **技术栈：**
> - Shared Core: TypeScript + Node.js
> - VS Code Frontend: VS Code Extension API + Webview
> - Tests: Vitest
> - Packaging: `npm`（首期尽量减少工具前置依赖）

---

## 0. 设计前提

### 当前已有资产
- 现有参考脚本：`E:\temp\codex-chat-history-exporter\scripts\export_codex_chat_history.py`
- 现有参考测试：`E:\temp\codex-chat-history-exporter\tests\test_export_codex_chat_history.py`
- 产品规格：`E:\temp\codex-chat-history-exporter\docs\chat_export_product_spec.md`

### 首期非目标
- 不做 exe 打包
- 不做在线分享
- 不做云同步 profile
- 不在首期做 Codex 插件前端

### 核心策略
- **不直接在插件里堆逻辑**
- 插件只负责：
  - 列表展示
  - 配置收集
  - 调用核心
  - 打开结果
- 导出、分类、图片抽取、排版都在 shared core 内完成

---

## 1. 目标目录结构

首期建议把仓库整理为如下结构：

```text
E:\temp\codex-chat-history-exporter\
  docs\
    chat_export_product_spec.md
  plan\
    chat_export_implementation_plan.md
  legacy\
    python_oracle\
      export_codex_chat_history.py
      test_export_codex_chat_history.py
  package.json
  tsconfig.json
  vitest.config.ts
  src\
    core\
      types.ts
      session-index.ts
      session-loader.ts
      timeline.ts
      section-groups.ts
      profile.ts
      layout.ts
      time-filter.ts
      asset-extractor.ts
      markdown-renderer.ts
      export-writer.ts
      exporter.ts
    cli\
      main.ts
    vscode\
      extension.ts
      commands\
        openExportWizard.ts
        exportSelectedSessions.ts
      state\
        profileStore.ts
        uiStateStore.ts
      views\
        sessionTreeProvider.ts
      webview\
        exportWizard.html
        exportWizard.ts
        exportWizard.css
  tests\
    fixtures\
      sessions\
      expected\
    core\
      session-loader.test.ts
      timeline.test.ts
      time-filter.test.ts
      asset-extractor.test.ts
      markdown-renderer.test.ts
      exporter.test.ts
    vscode\
      profileStore.test.ts
  outputs\
    .gitkeep
```

### 文件职责说明

#### `legacy/python_oracle/`
- 保留当前 Python 脚本和测试，作为迁移期间的行为参考
- 只有在 TypeScript 核心行为稳定且替代完成后，才考虑移除

#### `src/core/`
- 所有真实业务逻辑都放这里

#### `src/cli/`
- 提供命令行入口，方便不通过插件也能调用核心

#### `src/vscode/`
- 提供 VS Code 插件入口与 UI

#### `tests/fixtures/`
- 存放脱敏后的最小会话样本
- 存放期望导出结果的 snapshot / golden files

---

## 2. 核心数据模型

### 2.1 会话级模型

```ts
type SessionKind = "desktop" | "vscode" | "cli" | "unknown";

interface SessionSummary {
  sessionId: string;
  title: string;
  kind: SessionKind;
  originator: string;
  source: string;
  cwd: string;
  startedAt: string;
  updatedAt: string;
  rawPath: string;
}
```

### 2.2 导出内容分组

```ts
type ExportSectionId =
  | "transcript"
  | "session_meta"
  | "system_context"
  | "memory_context"
  | "workspace_context"
  | "collaboration_context"
  | "tool_trace";
```

### 2.3 导出 profile

```ts
interface ExportProfile {
  id: string;
  name: string;
  description: string;
  includedSections: ExportSectionId[];
  documentMode: "single" | "multi";
  hiddenContentMode: "inline" | "appendix" | "split";
  toolTraceLevel: "summary" | "full";
  includeMessageTimestamps: boolean;
  transcriptTimeFilter?: {
    enabled: boolean;
    start?: string;
    end?: string;
  };
  linkedTraceTimeBehavior: "none" | "related_only";
  defaultOutputDir?: string;
  builtin: boolean;
}
```

### 2.4 会话导出结果

```ts
interface ExportResult {
  sessionId: string;
  outputDir: string;
  documents: string[];
  assetFiles: string[];
  warnings: string[];
}
```

---

## 3. 实现阶段总览

### Milestone A：冻结参考实现
- 保住现有 Python 能力
- 生成可比对 fixtures

### Milestone B：重构共享核心
- 完成会话读取、分类、时间过滤、排版、输出写入

### Milestone C：补 CLI
- 让核心脱离插件也能调用

### Milestone D：做 VS Code 插件
- 实现会话选择、profile 选择、输出目录选择、导出执行

### Milestone E：预留 Codex 插件接入面
- 不实现 UI，但把核心调用接口收敛稳定

---

## 4. 任务拆分

### 任务 1：冻结参考实现与夹具

**文件：**
- 创建：`legacy/python_oracle/export_codex_chat_history.py`
- 创建：`legacy/python_oracle/test_export_codex_chat_history.py`
- 创建：`tests/fixtures/sessions/*.jsonl`
- 创建：`tests/fixtures/expected/*`
- 修改：`scripts/export_codex_chat_history.py`（仅做迁移说明或重定向）

- [x] **步骤 1：复制当前 Python 原型为 legacy oracle**
  - 把当前脚本与测试复制到 `legacy/python_oracle/`
  - 在根目录保留轻量说明，避免后续误改 oracle

- [ ] **步骤 2：构造脱敏 fixtures**
  - 从现有真实会话中提取最小样本
  - 覆盖场景：
    - 仅正文
    - 正文 + 图片
    - tool trace
    - system/memory/workspace context
    - `response_item(user)` 与 `event_msg(user_message)` 先后顺序不同
    - `source` 为字符串 / 对象

- [ ] **步骤 3：生成 golden outputs**
  - 用 Python 参考实现对 fixtures 导出
  - 保存预期目录结构与 Markdown 输出

- [ ] **步骤 4：验证 oracle 可重复运行**
  - 运行：
    - `python -m unittest .\legacy\python_oracle\test_export_codex_chat_history.py`
  - 预期：
    - 全部通过

---

### 任务 2：初始化 TypeScript 工程

**文件：**
- 创建：`package.json`
- 创建：`tsconfig.json`
- 创建：`vitest.config.ts`
- 创建：`src/core/`
- 创建：`src/cli/`
- 创建：`src/vscode/`

- [x] **步骤 1：初始化 Node 工程**
  - 使用 `npm init -y`
  - 加入 scripts：
    - `build`
    - `test`
    - `test:core`
    - `smoke`
    - `vscode:package`

- [x] **步骤 2：安装依赖**
  - 运行：
    - `npm install -D typescript vitest @types/node @types/vscode esbuild`
    - `npm install vscode`

- [x] **步骤 3：建立最小编译与测试骨架**
  - 确保空工程可：
    - `npm run build`
    - `npm run test`

---

### 任务 3：实现会话扫描与载入

**文件：**
- 创建：`src/core/types.ts`
- 创建：`src/core/session-index.ts`
- 创建：`src/core/session-loader.ts`
- 测试：`tests/core/session-loader.test.ts`

- [x] **步骤 1：实现 `SessionSummary` 扫描**
  - 读取 `.codex/session_index.jsonl`
  - 扫描 `.codex/sessions/**/*.jsonl`
  - 归类 `desktop / vscode / cli / unknown`

- [x] **步骤 2：实现原始事件载入**
  - 把 jsonl 读成稳定的原始 event 序列
  - 保留原始时间戳与行序

- [x] **步骤 3：测试扫描和分类**
  - 运行：
    - `npm run test:core -- session-loader`
  - 预期：
    - 正确扫描 session summary
    - 正确处理 `source` 为对象的情况

---

### 任务 4：实现时间线归一化

**文件：**
- 创建：`src/core/timeline.ts`
- 测试：`tests/core/timeline.test.ts`

- [x] **步骤 1：把原始事件映射成逻辑消息**
  - 消息类型：
    - user transcript item
    - assistant transcript item
    - developer/system context item
    - tool call item
    - tool output item
    - section-level hidden context item

- [x] **步骤 2：处理用户镜像去重**
  - 若同 turn 同时出现：
    - `response_item(role=user)`
    - `event_msg(user_message)`
  - 以 `event_msg(user_message)` 为主

- [x] **步骤 3：为正文消息附加时间戳**
  - 正文项带 `timestamp`
  - 为后续时间裁切提供依据

- [x] **步骤 4：测试时间线稳定性**
  - 运行：
    - `npm run test:core -- timeline`

---

### 任务 5：实现分组与说明元数据

**文件：**
- 创建：`src/core/section-groups.ts`
- 测试：`tests/core/markdown-renderer.test.ts`

- [x] **步骤 1：定义 7 个导出分组**
  - `transcript`
  - `session_meta`
  - `system_context`
  - `memory_context`
  - `workspace_context`
  - `collaboration_context`
  - `tool_trace`

- [x] **步骤 2：为每组补齐 UI 元数据**
  - 中文标签
  - 原始字段名
  - 简短说明
  - 长说明
  - 默认可见性级别

- [x] **步骤 3：将原始事件映射到分组**
  - 确保每条内容只归入一组或明确的复合组

---

### 任务 6：实现 profile 与布局模型

**文件：**
- 创建：`src/core/profile.ts`
- 创建：`src/core/layout.ts`
- 测试：`tests/core/exporter.test.ts`

- [x] **步骤 1：内置 3 个默认 profile**
  - 阅读版
  - 审计版
  - 取证版

- [x] **步骤 2：实现 profile 校验**
  - section 必须合法
  - `single/multi` 与 `inline/appendix/split` 组合必须合法

- [ ] **步骤 3：定义导出布局规则**
  - 每会话固定一个文件夹
  - `single`：输出一个主文档
  - `multi`：按组拆分多个文档
  - `appendix`：正文主文档 + 附录区
  - `split`：正文 / hidden / tool trace 拆分

---

### 任务 7：实现正文时间过滤

**文件：**
- 创建：`src/core/time-filter.ts`
- 测试：`tests/core/time-filter.test.ts`

- [x] **步骤 1：实现时间区间过滤器**
  - 输入：
    - start
    - end
    - timezone（如需要）
  - 输出：
    - 裁切后的正文消息序列

- [x] **步骤 2：实现 `linkedTraceTimeBehavior`**
  - `none`：只裁切正文
  - `related_only`：正文对应时间段的 tool trace 一并保留

- [x] **步骤 3：测试边界**
  - 边界含起止点
  - 空时间区间
  - 只有开始 / 只有结束

---

### 任务 8：实现图片与资源写入

**文件：**
- 创建：`src/core/asset-extractor.ts`
- 测试：`tests/core/asset-extractor.test.ts`

- [x] **步骤 1：提取 `data:image/...`**
  - 写入 `assets/`
  - 用 hash 去重

- [x] **步骤 2：支持本地图片路径**
  - 复制到当前会话文件夹的 `assets/`

- [x] **步骤 3：测试去重**
  - 同图出现多次，只写一份资源文件

---

### 任务 9：实现 Markdown 渲染器

**文件：**
- 创建：`src/core/markdown-renderer.ts`
- 测试：`tests/core/markdown-renderer.test.ts`

- [x] **步骤 1：渲染主文档**
  - 标题
  - metadata 摘要
  - transcript
  - 可选附录

- [x] **步骤 2：渲染隐藏上下文块**
  - 每块都加：
    - 中文标签
    - 原始字段名
    - “这个部分起什么作用”的说明

- [x] **步骤 3：渲染 tool trace**
  - `summary` 模式
  - `full` 模式
  - 用 `<details>` 控制可折叠性

- [x] **步骤 4：支持可选消息时间戳**
  - 时间戳前缀或侧边样式

- [ ] **步骤 5：和 golden output 对比**
  - 正文结构一致
  - 图片原位合理

---

### 任务 10：实现导出写入器

**文件：**
- 创建：`src/core/export-writer.ts`
- 创建：`src/core/exporter.ts`
- 测试：`tests/core/exporter.test.ts`

- [x] **步骤 1：根据布局创建每会话文件夹**
  - 固定输出目录结构

- [x] **步骤 2：写单文档模式**
  - `transcript.md`

- [x] **步骤 3：写多文档模式**
  - 例如：
    - `transcript.md`
    - `hidden-context.md`
    - `tool-trace.md`
    - 或按组选拆

- [x] **步骤 4：多会话导出写总索引**
  - `index.md`

---

### 任务 11：实现 CLI 入口

**文件：**
- 创建：`src/cli/main.ts`

- [x] **步骤 1：实现命令**
  - `list`
  - `export`
  - `profiles list`

- [x] **步骤 2：支持参数**
  - `--root`
  - `--session-id`
  - `--kind`
  - `--latest`
  - `--profile`
  - `--output-dir`
  - `--start`
  - `--end`
  - `--include-message-timestamps`

- [x] **步骤 3：做 smoke 命令**
  - 运行：
    - `node .\dist\cli\main.js export --root C:\Users\20312\.codex --kind desktop --latest 1 --profile reading --output-dir .\outputs\smoke`

---

### 任务 12：实现 VS Code 插件 UI

**文件：**
- 创建：`src/vscode/extension.ts`
- 创建：`src/vscode/views/sessionTreeProvider.ts`
- 创建：`src/vscode/state/profileStore.ts`
- 创建：`src/vscode/state/uiStateStore.ts`
- 创建：`src/vscode/commands/openExportWizard.ts`
- 创建：`src/vscode/commands/exportSelectedSessions.ts`
- 创建：`src/vscode/webview/exportWizard.html`
- 创建：`src/vscode/webview/exportWizard.ts`
- 创建：`src/vscode/webview/exportWizard.css`
- 测试：`tests/vscode/profileStore.test.ts`

- [x] **步骤 1：实现会话列表**
  - 标题
  - 时间
  - kind
  - cwd
  - 多选

- [x] **步骤 2：实现导出向导**
  - profile 选择
  - 分组选项勾选
  - 时间戳开关
  - 时间区间设置
  - 输出目录选择
  - 文档组织方式选择

- [x] **步骤 3：实现 profile 管理**
  - 创建
  - 复制
  - 编辑
  - 删除

- [x] **步骤 4：导出完成后打开结果**
  - 打开输出目录
  - 打开 `index.md` 或会话文件夹

---

### 任务 13：预留 Codex 插件接入面（二期）

**文件：**
- 创建：`docs/codex_plugin_phase2_notes.md`
- 可选创建：`src/core/public-api.ts`

- [ ] **步骤 1：明确共享核心的调用 API**
  - `listSessions`
  - `listProfiles`
  - `exportSessions`

- [ ] **步骤 2：收敛插件前端所需最小输入**
  - sessions
  - profile
  - outputDir
  - timeFilter
  - layout options

- [ ] **步骤 3：写清二期接入边界**
  - Codex 插件只做入口和参数收集

---

## 5. 验证策略

### 单元测试
- `npm run test:core`
- `npm run test`

### 构建验证
- `npm run build`

### 真实 smoke test
- `npm run smoke -- --root C:\Users\20312\.codex --kind desktop --latest 1 --output-dir .\outputs\smoke`

### 手工 UI 验证（VS Code）
- 单会话导出
- 多会话导出
- 阅读版 / 审计版 / 取证版
- 自定义 profile
- 时间区间裁切
- 自选输出目录
- 单文档 / 多文档模式

---

## 6. 实施顺序建议

### 最小闭环顺序
1. 冻结 oracle
2. 建 TypeScript 核心骨架
3. 做扫描器 + 时间线 + 分组
4. 做图片提取 + Markdown 渲染
5. 做导出写入器
6. 做 CLI smoke
7. 做 VS Code UI

### 不建议顺序
- 不要先做 VS Code UI 再补核心
- 不要先做 Codex 插件前端
- 不要先做 exe 打包

---

## 7. 交付物清单

完成本计划后，首期应交付：

- 可复用的 TypeScript 导出核心
- 可运行的 CLI
- 可运行的 VS Code 插件
- 3 个默认导出模式
- 自定义模式持久化
- 每会话固定文件夹导出
- 正文时间戳与时间区间裁切
- 自选导出目录
- 完整测试与 smoke 验证

---

## 8. 实施交接建议

如果下一会话开始实现，建议先从 **任务 1 ~ 4** 开始，不要直接写插件 UI。

优先级：

1. `legacy/python_oracle/*`
2. `src/core/session-*`
3. `src/core/timeline.ts`
4. `src/core/section-groups.ts`
5. `src/core/profile.ts`
6. `src/core/layout.ts`
