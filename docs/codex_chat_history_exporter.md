# Codex 聊天记录导出工具

## 用途
- 从 `C:\Users\20312\.codex\sessions` 导出 Codex 聊天记录到 Markdown。
- 支持区分：`desktop`、`vscode`、`cli`。
- 自动提取会话中的 `data:image/...;base64` 图片，并在 Markdown 原位插图。
- 保留用户可见内容、tool call、tool output，便于后续整理与归档。

## 真实来源判定
- `session_meta.payload.originator == "Codex Desktop"` -> 归类为 `desktop`
- `session_meta.payload.originator == "codex_vscode"` -> 归类为 `vscode`
- `session_meta.payload.originator == "codex_cli_rs"` 或 `source == "cli"` -> 归类为 `cli`

## 命令示例

```powershell
python .\scripts\export_codex_chat_history.py list
```

```powershell
python .\scripts\export_codex_chat_history.py list --kind vscode
```

```powershell
python .\scripts\export_codex_chat_history.py export --kind desktop --latest 5
```

```powershell
python .\scripts\export_codex_chat_history.py export --session-id 019ceab7-7054-7f92-a10e-74e0704e446f
```

## 输出结构

```text
exports/
  codex_chat_history/
    index.md
    20260324-150130_desktop_<session-id>_<title>/
      transcript.md
      assets/
        turn1-user-image-001-xxxxxxxxxx.png
```

## 当前默认策略
- 默认导出“用户可见内容”。
- 默认不导出加密的 reasoning 原文。
- 如需导出安全的 reasoning summary，可增加：

```powershell
python .\scripts\export_codex_chat_history.py export --latest 1 --include-reasoning-summaries
```
