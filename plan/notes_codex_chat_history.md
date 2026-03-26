# Notes: Codex 聊天记录导出

## Evidence

### `.codex/sessions`
- `session_meta.payload.originator` 已观测到：`Codex Desktop`、`codex_vscode`、`codex_cli_rs`
- `session_meta.payload.source` 已观测到：`vscode`、`exec`、`cli`
- 用户图片可出现在：
  - `event_msg.payload.images[]`，格式为 `data:image/...;base64,...`
  - `response_item.payload.content[]` 中的 `input_image.image_url`

### `session_index.jsonl`
- 可提供 `thread_name`，适合作为导出文件名与列表展示标题。

## Export Strategy
- 一条会话导出到一个目录：
  - `transcript.md`
  - `assets/`（图片资源）
- Markdown 结构：元信息 -> Transcript -> 用户/助手消息 -> tool call/output。
- 对同一条用户输入中的重复图片（`event_msg` 与 `input_image` 双写）做去重。

## Validation
- 单元测试：`python -m unittest .\tests\test_export_codex_chat_history.py` -> 4/4 通过。
- 真实列举：
  - `python .\scripts\export_codex_chat_history.py list --root C:\Users\20312\.codex --kind desktop`
  - `python .\scripts\export_codex_chat_history.py list --root C:\Users\20312\.codex --kind vscode`
- 真实导出：
  - 成功导出 1 条 `vscode` 会话。
  - 成功导出 1 条带图片的 `desktop` 会话，并确认 Markdown 中每张图仅引用 1 次。

## Open Points
- 是否额外导出 reasoning summary：先实现为可选开关。
