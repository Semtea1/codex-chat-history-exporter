# Codex Chat History Exporter

一个用于导出 Codex 聊天记录的工具集，包含：

- TypeScript shared core
- CLI
- VS Code extension

> 本项目强调 **pure vibe coding** 开发方式：围绕真实使用反馈快速迭代，先做可运行版本，再持续修正交互、导出逻辑与打包流程。

## 当前能力

- 扫描本地 Codex 会话目录
- 区分 `desktop / vscode / cli`
- 识别主会话、子会话、内部会话
- 导出聊天正文、隐藏上下文、工具执行轨迹
- 支持导出 profile
- 每个会话固定导出到单独文件夹
- 支持正文时间戳与时间区间裁剪
- 提供 VS Code 导出向导

## 快速开始

```powershell
npm install
npm test
npm run build
```

## CLI 示例

列出最近会话：

```powershell
node .\dist\cli\main.js list --root <CODEX_ROOT> --kind desktop --latest 5
```

查看导出 profile：

```powershell
node .\dist\cli\main.js profiles list
```

导出单个会话：

```powershell
node .\dist\cli\main.js export --root <CODEX_ROOT> --session-id <SESSION_ID> --profile audit --output-dir <OUTPUT_DIR> --start 2026-03-24T06:59:00Z --end 2026-03-24T07:02:00Z --include-message-timestamps
```

## VS Code 调试

1. 运行 `npm install`
2. 运行 `npm run build`
3. 在 VS Code 中按 `F5`
4. 在新开的 `Extension Development Host` 中打开命令面板
5. 执行：
   - `Codex Chat Exporter: Open Chat Export Wizard`

## VSIX 打包

```powershell
npm run vscode:package
```

默认会在仓库根目录生成：

- `codex-chat-history-exporter.vsix`

## 发布说明

- GitHub Release 下载：见仓库 Releases 页面
- VS Code Marketplace 发布需要单独配置 publisher 与 `vsce`

## 隐私说明

本 README 不再包含任何本机用户名、绝对路径或个人环境目录示例。命令中的路径均使用占位符表示，例如：

- `<CODEX_ROOT>`
- `<OUTPUT_DIR>`
- `<SESSION_ID>`

## License

MIT
