# Task Plan: Codex 聊天记录导出工具

## Goal
产出一个可执行的本地工具，把 `C:\Users\20312\.codex\sessions` 中的 Codex Desktop 与 VS Code 插件会话导出为 Markdown，并在原位落盘图片资源。

## Phases
- [x] Phase 1: Verify data sources
- [x] Phase 2: Write failing tests
- [x] Phase 3: Implement exporter
- [x] Phase 4: Validate and document

## Key Questions
1. Codex Desktop 与 VS Code 插件是否共享 `.codex/sessions` 作为真相源？
2. 图片在会话日志中是 `data:image/...` 还是独立文件引用？
3. 如何在 Markdown 中既保留完整性，又保持可整理性？

## Decisions Made
- 使用 `.codex/sessions` 作为主数据源，而不是反向解析 VS Code 内部 `chatSessions` 增量日志。
- 用 `session_meta.payload.originator` 区分 `desktop` 与 `vscode`。
- 默认导出“用户可见内容 + 工具调用/输出 + 图片”，不导出加密 reasoning 原文。

## Errors Encountered
- `session_meta.payload.source` 在真实数据里不总是字符串，曾出现 `{"subagent": "memory_consolidation"}`；已改为统一字符串化。
- 同一条用户输入在部分会话里会先写 `response_item(role=user)`，再写 `event_msg(user_message)`，导致图片与正文双写；已改为延迟 flush，优先采用 `event_msg`。

## Status
**Completed** - 导出脚本、文档、测试均已落地，并完成真实 `.codex` 数据的 `list/export` 验证。
