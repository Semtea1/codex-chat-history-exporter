# Codex Chat History Exporter

[![VS Code Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/semtea1.codex-chat-history-exporter?label=VS%20Code%20Marketplace&color=007ACC)](https://marketplace.visualstudio.com/items?itemName=semtea1.codex-chat-history-exporter)
[![GitHub Release](https://img.shields.io/github/v/release/Semtea1/codex-chat-history-exporter?label=GitHub%20Release)](https://github.com/Semtea1/codex-chat-history-exporter/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-F4C542.svg)](./LICENSE)

Codex Chat History Exporter 是一个面向 Codex 用户的聊天记录导出工具，用于从 **Desktop / VS Code / CLI** 会话中提取聊天正文、图片、隐藏上下文与工具执行轨迹，并整理为更适合归档、阅读和复盘的 Markdown 文档。

## Overview

这个扩展的核心目标是把 Codex 会话从“原始日志文件”提升为“可阅读、可筛选、可归档”的知识资产。它既支持直接导出对话正文，也支持按需导出隐藏上下文、工具执行链路、子会话附录与时间区间片段，适合个人整理、项目复盘与过程留档。

## Key Features

- 导出聊天正文，并在原始位置保留图片
- 识别主会话、子会话和内部会话
- 支持隐藏上下文与工具执行轨迹导出
- 支持时间区间裁剪与消息时间戳输出
- 提供 VS Code 图形化导出向导
- 提供 CLI 方式，便于批处理或脚本集成
- 支持 Windows 标准 `.codex` 目录自动发现
- 支持 Ubuntu / Linux 使用 `$HOME/.codex` 自动发现

## Install

### VS Code Marketplace

在 VS Code 扩展市场搜索：

- `Codex Chat History Exporter`

或直接打开：

- `https://marketplace.visualstudio.com/items?itemName=semtea1.codex-chat-history-exporter`

### Manual VSIX

如果需要手动安装：

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

## Compatibility

- Windows：默认优先使用 `CODEX_HOME`，否则回退到用户目录下的 `.codex`
- Ubuntu / Linux：默认优先使用 `CODEX_HOME`，否则回退到 `$HOME/.codex`
- VS Code：支持通过图形化向导进行筛选和导出
- CLI：支持脚本化导出与批量处理场景

## Disclaimer

本项目采用 **pure vibe coding** 工作流生成与迭代，属于快速演进中的实验性软件。  
它适合个人使用、研究整理与过程留档，但**不应被视为经过长期生产验证的归档系统**。在以下场景中，请自行复核导出结果：

- 重要留档
- 审计材料
- 对时间戳、隐藏上下文或工具链路有严格要求的场景

本扩展按 MIT License 提供，作者不对因使用、误用或依赖导出结果造成的直接或间接损失承担责任。

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

## Repository

- Source: `https://github.com/Semtea1/codex-chat-history-exporter`
- Issues: `https://github.com/Semtea1/codex-chat-history-exporter/issues`
- Releases: `https://github.com/Semtea1/codex-chat-history-exporter/releases`

## License

MIT
