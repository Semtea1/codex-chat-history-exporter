import type { ExportSectionDefinition, ExportSectionId } from "./types";

const SECTION_DEFINITIONS: ExportSectionDefinition[] = [
  {
    id: "transcript",
    label: "聊天正文与图片",
    rawFieldNames: ["user_message", "response_item.message", "input_image"],
    shortDescription: "客户端可见的用户消息、助手回复以及插入在原位的图片。",
    longDescription:
      "用于导出客户端能直接看到的聊天正文、用户图片与助手回复。可以选择附带消息时间戳，也可以按时间区间裁剪正文内容。",
    visibility: "visible"
  },
  {
    id: "session_meta",
    label: "会话基础信息",
    rawFieldNames: ["session_meta"],
    shortDescription: "会话来源、时间、工作目录、原始文件路径等基础元数据。",
    longDescription: "用于标识这条会话从哪里来、何时创建、原始日志位于哪个文件中，便于归档、检索和回溯。",
    visibility: "hidden"
  },
  {
    id: "system_context",
    label: "系统运行上下文",
    rawFieldNames: ["permissions instructions", "app-context"],
    shortDescription: "模型运行时的权限、沙箱、客户端能力和系统级限制。",
    longDescription:
      "解释当时模型具备哪些权限、受到哪些沙箱和客户端能力约束。这部分通常不会直接出现在客户端聊天正文里。",
    visibility: "hidden"
  },
  {
    id: "memory_context",
    label: "Memory 上下文",
    rawFieldNames: ["memory", "oai-mem-citation"],
    shortDescription: "长期偏好、历史任务摘要以及 memory 引用信息。",
    longDescription: "解释模型为何沿用某些历史偏好、习惯与经验，是后台注入的历史上下文。",
    visibility: "hidden"
  },
  {
    id: "workspace_context",
    label: "工作区规则上下文",
    rawFieldNames: ["AGENTS.md", "INSTRUCTIONS", "environment_context"],
    shortDescription: "项目规则、技能清单、环境上下文与当前工作边界。",
    longDescription: "解释模型为什么会遵循某些项目内规则、技能约束或环境边界。",
    visibility: "hidden"
  },
  {
    id: "collaboration_context",
    label: "协作控制上下文",
    rawFieldNames: ["collaboration_mode", "request_user_input availability"],
    shortDescription: "当前协作模式、交互边界以及可用输入/工具约束。",
    longDescription: "解释模型当前处于哪种协作模式，以及哪些交互工具或输入方式可用。",
    visibility: "hidden"
  },
  {
    id: "tool_trace",
    label: "工具执行轨迹",
    rawFieldNames: ["function_call", "function_call_output", "custom_tool_call", "web_search_call"],
    shortDescription: "模型调用过哪些工具，以及工具参数和输出结果。",
    longDescription: "用于完整复盘模型的执行过程，可按摘要或完整模式导出。",
    visibility: "partially_hidden"
  }
];

const SECTION_IDS = new Set<ExportSectionId>(SECTION_DEFINITIONS.map((item) => item.id));

export function getAllSectionDefinitions(): ExportSectionDefinition[] {
  return [...SECTION_DEFINITIONS];
}

export function getSectionDefinition(id: ExportSectionId): ExportSectionDefinition {
  const definition = SECTION_DEFINITIONS.find((item) => item.id === id);
  if (!definition) {
    throw new Error(`Unknown section id: ${id}`);
  }
  return definition;
}

export function isExportSectionId(value: string): value is ExportSectionId {
  return SECTION_IDS.has(value as ExportSectionId);
}

export function classifyContextText(
  text: string
): Exclude<ExportSectionId, "transcript" | "session_meta" | "tool_trace"> {
  const normalized = text.toLowerCase();

  if (
    normalized.includes("<permissions instructions>") ||
    normalized.includes("<app-context>") ||
    normalized.includes("# codex desktop context")
  ) {
    return "system_context";
  }

  if (normalized.includes("## memory") || normalized.includes("<oai-mem-citation>") || normalized.includes("memory_summary")) {
    return "memory_context";
  }

  if (
    normalized.includes("# agents.md instructions") ||
    normalized.includes("<instructions>") ||
    normalized.includes("<environment_context>")
  ) {
    return "workspace_context";
  }

  if (normalized.includes("<collaboration_mode>") || normalized.includes("request_user_input availability")) {
    return "collaboration_context";
  }

  return "system_context";
}
