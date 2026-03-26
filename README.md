# Codex Chat History Exporter

Codex 会话导出工具，当前包含：

- TypeScript shared core
- CLI
- VS Code extension skeleton

## 当前能力

- 扫描本地 `C:\Users\20312\.codex\sessions`
- 区分 `desktop / vscode / cli`
- 正文 / 隐藏上下文 / 工具轨迹分组
- 导出 profile
- 每会话固定一个导出文件夹
- 正文时间戳与时间区间
- VS Code 导出向导骨架

## 开发

```powershell
npm install
npm test
npm run build
```

## CLI 示例

```powershell
node .\dist\cli\main.js list --root C:\Users\20312\.codex --kind desktop --latest 5
```

```powershell
node .\dist\cli\main.js profiles list
```

```powershell
node .\dist\cli\main.js export --root C:\Users\20312\.codex --session-id <SESSION_ID> --profile audit --output-dir E:\exports --start 2026-03-24T06:59:00Z --end 2026-03-24T07:02:00Z --include-message-timestamps
```

## VS Code 调试

1. 运行 `npm install`
2. 运行 `npm run build`
3. 在 VS Code 中按 `F5`
4. 在新的 Extension Development Host 中打开命令面板：
   - `Codex Chat Exporter: Open Chat Export Wizard`

## VSIX 打包

```powershell
npm run vscode:package
```

生成文件：

- `E:\temp\codex-chat-history-exporter\codex-chat-history-exporter.vsix`
