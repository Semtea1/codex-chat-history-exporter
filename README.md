# Codex Chat History Exporter

[![VS Code Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/semtea1.codex-chat-history-exporter?label=VS%20Code%20Marketplace&color=007ACC)](https://marketplace.visualstudio.com/items?itemName=semtea1.codex-chat-history-exporter)
[![GitHub Release](https://img.shields.io/github/v/release/Semtea1/codex-chat-history-exporter?label=GitHub%20Release)](https://github.com/Semtea1/codex-chat-history-exporter/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-F4C542.svg)](./LICENSE)

一个面向 Codex 用户的聊天记录导出工具，支持从 **Desktop / VS Code / CLI** 会话中提取聊天正文、图片、隐藏上下文和工具执行轨迹，并导出为便于归档和阅读的 Markdown 文档。

> 本项目采用 **pure vibe coding** 开发方式：围绕真实使用反馈快速迭代，优先做出可运行版本，再持续修正交互、导出逻辑、打包和发布链路。

## Highlights

- 导出聊天正文，并在原始位置保留图片
- 区分主会话、子会话、内部会话
- 支持隐藏上下文与工具执行轨迹导出
- 支持时间区间裁剪和时间戳输出
- 同时提供 CLI 和 VS Code extension
- 支持 Windows 标准 `.codex` 目录自动发现
- 支持 Ubuntu / Linux 使用 `$HOME/.codex` 自动发现

## Install

### VS Code Marketplace

在 VS Code 扩展市场搜索：

- `Codex Chat History Exporter`

或直接打开：

- `https://marketplace.visualstudio.com/items?itemName=semtea1.codex-chat-history-exporter`

### Manual VSIX

如果你想手动安装：

1. 从 GitHub Releases 下载 `.vsix`
2. 在 VS Code 中执行 `Extensions: Install from VSIX...`

GitHub Releases：

- `https://github.com/Semtea1/codex-chat-history-exporter/releases`

## What It Exports

- 聊天正文与图片
- 会话基础元信息
- 系统运行上下文
- Memory 上下文
- 工作区规则上下文
- 协作控制上下文
- 工具执行轨迹

## Development

```powershell
npm install
npm test
npm run build
```

### VS Code Extension Debug

1. 运行 `npm install`
2. 运行 `npm run build`
3. 在 VS Code 中按 `F5`
4. 在新的 `Extension Development Host` 中执行：
   - `Codex Chat Exporter: Open Chat Export Wizard`

### VSIX Package

```powershell
npm run vscode:package
```

输出文件：

- `codex-chat-history-exporter.vsix`

## Privacy

README 中不再包含任何本机用户名、绝对路径或个人环境目录示例。示例命令统一使用占位符：

- `<CODEX_ROOT>`
- `<OUTPUT_DIR>`
- `<SESSION_ID>`

## Repository

- Source: `https://github.com/Semtea1/codex-chat-history-exporter`
- Issues: `https://github.com/Semtea1/codex-chat-history-exporter/issues`
- Releases: `https://github.com/Semtea1/codex-chat-history-exporter/releases`

## License

MIT
