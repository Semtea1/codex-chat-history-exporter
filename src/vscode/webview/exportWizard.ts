import type { ExportProfile, ExportSectionDefinition, SessionSummary } from "../../core/types";
import type { UiState } from "../state/uiStateStore";

interface ChildSessionPreview {
  sessionId: string;
  title: string;
  updatedAt: string;
  agentNickname?: string;
  agentRole?: string;
  parentSessionId?: string;
  previewText: string;
}

type SessionTypeFilter = "all" | "main" | "child" | "internal";

export interface ExportWizardRenderInput {
  profiles: ExportProfile[];
  sections: ExportSectionDefinition[];
  sessions: SessionSummary[];
  childPreviewMap: Record<string, ChildSessionPreview[]>;
  uiState: UiState;
  maxSessionsInWizard?: number;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function getSessionType(session: SessionSummary): Exclude<SessionTypeFilter, "all"> {
  if (session.isInternal) {
    return "internal";
  }
  if (session.parentSessionId) {
    return "child";
  }
  return "main";
}

function getSessionTypeLabel(session: SessionSummary): string {
  const sessionType = getSessionType(session);
  if (sessionType === "internal") {
    return "内部会话";
  }
  if (sessionType === "child") {
    return "子会话";
  }
  return "主会话";
}

function renderProfileOptions(profiles: ExportProfile[], selectedProfileId: string): string {
  return profiles
    .map(
      (profile) =>
        `<option value="${escapeHtml(profile.id)}" ${profile.id === selectedProfileId ? "selected" : ""}>${escapeHtml(profile.name)}</option>`
    )
    .join("");
}

function renderSectionItems(sections: ExportSectionDefinition[]): string {
  return sections
    .map(
      (section) => `
        <label class="section-row">
          <input class="section-checkbox" type="checkbox" data-section-id="${escapeHtml(section.id)}" />
          <div class="section-main">
            <div class="section-title">${escapeHtml(section.label)}</div>
            <div class="section-raw">${escapeHtml(section.rawFieldNames.join(", "))}</div>
            <div class="section-desc">${escapeHtml(section.shortDescription)}</div>
          </div>
        </label>
      `
    )
    .join("");
}

function renderChildPreviewItems(children: ChildSessionPreview[]): string {
  return children
    .map(
      (child) => `
        <article class="child-card">
          <div class="child-header">
            <div>
              <div class="child-title">${escapeHtml(child.title)}</div>
              <div class="child-meta">${escapeHtml(child.agentNickname || "Subagent")} · ${escapeHtml(child.agentRole || "default")} · ${escapeHtml(child.updatedAt)}</div>
            </div>
            <code>${escapeHtml(child.sessionId)}</code>
          </div>
          <div class="child-preview">${escapeHtml(child.previewText)}</div>
        </article>
      `
    )
    .join("");
}

function renderRelationshipBox(session: SessionSummary, childPreviews: ChildSessionPreview[]): string {
  const sessionType = getSessionType(session);
  if (sessionType === "internal") {
    return `
      <div class="relationship-box relationship-box--internal">
        <div>
          <div class="relationship-title">内部维护会话</div>
          <div class="relationship-text">当前没有可靠父链，因此导出时按独立会话文件夹处理。</div>
        </div>
        <span class="relationship-pill">${escapeHtml(session.internalCategory || "internal")}</span>
      </div>
    `;
  }

  if (sessionType === "child") {
    return `
      <div class="relationship-box relationship-box--child">
        <div>
          <div class="relationship-title">子会话父链</div>
          <div class="relationship-text">父会话 Session ID：${escapeHtml(session.parentSessionId || "unknown")}</div>
        </div>
        <span class="relationship-pill">subagent</span>
      </div>
    `;
  }

  if (childPreviews.length === 0) {
    return "";
  }

  return `
    <div class="relationship-box relationship-box--main">
      <div>
        <div class="relationship-title">子会话附录</div>
        <div class="relationship-text">当前主会话挂了 ${escapeHtml(String(childPreviews.length))} 个可验证子会话，可随主会话一起导出。</div>
      </div>
      <button type="button" class="toggle-button" data-child-toggle="${escapeHtml(session.sessionId)}">展开查看子会话</button>
    </div>
  `;
}

function renderSessionItems(
  sessions: SessionSummary[],
  selectedSessionIds: string[],
  childPreviewMap: Record<string, ChildSessionPreview[]>
): string {
  const selected = new Set(selectedSessionIds);

  return sessions
    .map((session) => {
      const childPreviews = childPreviewMap[session.sessionId] ?? [];
      const sessionType = getSessionType(session);
      const searchText = [
        session.title,
        session.sessionId,
        session.cwd,
        session.kind,
        session.parentSessionId,
        session.internalCategory,
        getSessionTypeLabel(session)
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return `
        <article class="session-card" data-session-card data-session-id="${escapeHtml(session.sessionId)}" data-session-type="${escapeHtml(sessionType)}" data-first-message-at="${escapeHtml(session.firstMessageAt || session.timestamp || "")}" data-last-message-at="${escapeHtml(session.lastMessageAt || session.updatedAt || session.timestamp || "")}" data-search-text="${escapeHtml(searchText)}">
          <div class="session-select">
            <input class="session-checkbox" type="checkbox" data-session-id="${escapeHtml(session.sessionId)}" ${selected.has(session.sessionId) ? "checked" : ""} />
          </div>
          <div class="session-main">
            <div class="session-top">
              <div class="session-heading">
                <div class="session-title">${escapeHtml(session.title || "Untitled Session")}</div>
                <div class="session-subtitle">首句：${escapeHtml(session.firstMessageAt || session.timestamp || "unknown")} · 末句：${escapeHtml(session.lastMessageAt || session.updatedAt || session.timestamp || "unknown")}</div>
              </div>
              <div class="session-time">更新于 ${escapeHtml(session.updatedAt || session.timestamp)}</div>
            </div>
            <div class="session-tags">
              <span class="tag type-tag type-tag--${escapeHtml(sessionType)}">${escapeHtml(getSessionTypeLabel(session))}</span>
              <span class="tag platform-tag">${escapeHtml(session.kind)}</span>
              ${childPreviews.length > 0 ? `<span class="tag child-tag">附 ${escapeHtml(String(childPreviews.length))} 个子会话</span>` : ""}
            </div>
            ${renderRelationshipBox(session, childPreviews)}
            <div class="session-meta"><code>${escapeHtml(session.sessionId)}</code><span class="session-cwd">${escapeHtml(session.cwd || "Unknown CWD")}</span></div>
            ${childPreviews.length > 0 ? `<div class="child-panel" data-child-panel="${escapeHtml(session.sessionId)}" hidden>${renderChildPreviewItems(childPreviews)}</div>` : ""}
          </div>
        </article>
      `;
    })
    .join("");
}

function countSessionsByType(sessions: SessionSummary[]): Record<Exclude<SessionTypeFilter, "all"> | "total", number> {
  return sessions.reduce<Record<Exclude<SessionTypeFilter, "all"> | "total", number>>(
    (stats, session) => {
      stats.total += 1;
      stats[getSessionType(session)] += 1;
      return stats;
    },
    { total: 0, internal: 0, child: 0, main: 0 }
  );
}

export function renderExportWizardHtml(input: ExportWizardRenderInput): string {
  const initialData = JSON.stringify(input).replace(/</g, "\\u003c");
  const maxSessions = input.maxSessionsInWizard ?? 1000;
  const renderedSessions = input.sessions.slice(0, maxSessions);
  const selectedCount = input.uiState.selectedSessionIds.length;
  const stats = countSessionsByType(input.sessions);
  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Codex Chat Exporter</title>
    <style>
      :root{color-scheme:light;--bg1:#f8fbff;--bg2:#f4f7fd;--card:rgba(255,255,255,.82);--card-strong:rgba(255,255,255,.92);--line:rgba(183,196,219,.34);--line-soft:rgba(183,196,219,.22);--text:#22324d;--muted:#6f819d;--shadow:0 14px 30px rgba(76,97,136,.1);--scroll:rgba(155,170,196,.28)}
      *{box-sizing:border-box;scrollbar-width:thin;scrollbar-color:var(--scroll) transparent}
      html,body{margin:0;min-height:100%;font-family:"Inter","Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;color:var(--text);background:radial-gradient(circle at 8% 12%,rgba(194,223,255,.92),transparent 22%),radial-gradient(circle at 92% 10%,rgba(255,227,236,.88),transparent 20%),linear-gradient(180deg,var(--bg1) 0%,var(--bg2) 100%)}
      body{overflow:auto}
      .page{width:min(1500px,calc(100vw - 40px));min-height:calc(100vh - 40px);margin:20px auto;padding:22px;border-radius:30px;border:1px solid rgba(255,255,255,.78);background:linear-gradient(180deg,rgba(255,255,255,.58),rgba(255,255,255,.34));backdrop-filter:blur(24px) saturate(124%);box-shadow:0 28px 64px rgba(76,97,136,.14);display:grid;gap:18px}
      .topbar,.toolbar-left,.session-tags,.actions-row,.session-meta{display:flex;gap:8px;flex-wrap:wrap}.topbar{align-items:center}.dot{width:11px;height:11px;border-radius:999px;background:rgba(148,163,184,.34)}.brand{display:inline-flex;align-items:center;gap:10px;margin-left:8px;font-size:13px;font-weight:600;color:#4e6687}.brand-mark{width:18px;height:18px;border-radius:7px;display:grid;place-items:center;font-size:11px;background:rgba(91,146,247,.16);color:#5b92f7}
      .hero,.settings-header,.session-heading,.section-main,.session-main,.config-stack,.settings,.field-group,.section-list,.session-list,.action-summary,.export-cta{display:grid;gap:8px}.hero h1,.settings-header h2{margin:0;font-size:24px;line-height:1.18}.hero p,.settings-header p,.muted,.field-help,.helper,.status-line,.footer-meta,.session-subtitle,.session-cwd,.relationship-text,.child-meta,.child-preview,.section-desc,.section-raw,.session-time,.action-caption,.action-eyebrow{margin:0;color:var(--muted);line-height:1.55;font-size:12px}.section-raw{color:#9a772a}
      .stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.stat-card,.settings-card,.sessions-card,.action-card{border-radius:24px;border:1px solid rgba(255,255,255,.82);background:var(--card);box-shadow:var(--shadow)}.stat-card,.settings-card,.action-card,.sessions-card{padding:16px}.stat-value{font-size:24px;font-weight:700}.stat-label{font-size:12px;color:var(--muted)}
      .settings-grid{display:grid;grid-template-columns:1.1fr .9fr;gap:16px}.search-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:10px}.filter-grid,.date-grid,.split{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.split{grid-template-columns:repeat(2,minmax(0,1fr))}.toolbar,.footer-meta,.session-top,.relationship-box,.toggle-row,.child-header,.action-metrics{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}
      .section-row{display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:start;padding:12px 0;border-top:1px solid var(--line-soft)}.section-row:first-child{border-top:none}
      .section-checkbox,.session-checkbox{appearance:none;-webkit-appearance:none;width:22px;height:22px;border-radius:999px;border:1.5px solid rgba(151,166,194,.72);background:rgba(255,255,255,.88);position:relative;cursor:pointer;flex:0 0 auto}.section-checkbox:checked,.session-checkbox:checked{border-color:rgba(91,146,247,.94);background:linear-gradient(135deg,#7fb6ff,#5b92f7);box-shadow:0 10px 22px rgba(91,146,247,.2)}.section-checkbox:checked::after,.session-checkbox:checked::after{content:"";position:absolute;inset:5px;border-radius:999px;background:#fff}
      .input,.select,.datetime,.button,.primary-button,.toggle-button,.action-chip{border-radius:16px;border:1px solid var(--line);font:inherit}.input,.select,.datetime{width:100%;padding:12px 14px;background:rgba(255,255,255,.8);color:var(--text);outline:none}.button,.primary-button,.toggle-button{padding:12px 16px;cursor:pointer}.button,.toggle-button{background:rgba(255,255,255,.74);color:#547099}.primary-button{background:linear-gradient(135deg,#1f2937,#111827);color:#fff;border-color:transparent}.primary-button--export{min-width:220px;min-height:56px;padding:14px 22px;font-size:15px;font-weight:700;box-shadow:0 18px 36px rgba(17,24,39,.18)}.input:focus,.select:focus,.datetime:focus{border-color:rgba(91,146,247,.52);box-shadow:0 0 0 4px rgba(91,146,247,.12)}
      .toggle-row{padding:14px 16px;border-radius:18px;border:1px solid var(--line-soft);background:rgba(255,255,255,.56)}.switch{position:relative;width:48px;height:28px;flex:0 0 auto}.switch input{opacity:0;width:0;height:0}.slider{position:absolute;inset:0;border-radius:999px;background:rgba(148,163,184,.28)}.slider::before{content:"";position:absolute;width:20px;height:20px;left:4px;top:4px;border-radius:50%;background:#fff;box-shadow:0 8px 20px rgba(76,97,136,.18)}.switch input:checked + .slider{background:rgba(91,146,247,.94)}.switch input:checked + .slider::before{transform:translateX(20px)}
      .sessions-card{display:grid;grid-template-rows:auto auto auto auto minmax(360px,440px);gap:12px}.pill,.tag,.relationship-pill{display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;font-size:11px;font-weight:700}.pill{border:1px solid rgba(193,204,224,.54);background:rgba(255,255,255,.62);color:#647b98}.type-tag--main{background:rgba(91,146,247,.12);color:#4b78be}.type-tag--child{background:rgba(116,184,22,.14);color:#567d18}.type-tag--internal{background:rgba(239,124,155,.14);color:#b04a6a}.platform-tag{background:rgba(148,163,184,.14);color:#64748b;text-transform:uppercase}.child-tag{background:rgba(195,141,32,.14);color:#8b6312}.relationship-pill{background:rgba(255,255,255,.68);color:#5f6f88}
      .session-scroll{min-height:360px;max-height:440px;overflow:auto;padding-right:4px;border-top:1px solid var(--line-soft);padding-top:12px}.session-card{display:grid;grid-template-columns:auto minmax(0,1fr);gap:14px;align-items:start;padding:16px;border-radius:20px;border:1px solid var(--line-soft);background:var(--card-strong)}.session-card[hidden]{display:none !important}.session-title{font-size:16px;font-weight:700;word-break:break-word}.session-meta{font-size:12px}.relationship-box{padding:12px 14px;border-radius:16px;border:1px solid rgba(91,146,247,.18)}.relationship-box--main{background:rgba(91,146,247,.1)}.relationship-box--child{background:rgba(116,184,22,.08);border-color:rgba(116,184,22,.18)}.relationship-box--internal{background:rgba(239,124,155,.08);border-color:rgba(239,124,155,.18)}
      .child-panel{display:grid;gap:10px}.child-panel[hidden]{display:none !important}.child-card{border-radius:16px;border:1px solid rgba(91,146,247,.18);background:rgba(255,255,255,.74);padding:12px 14px;display:grid;gap:8px}.child-preview{white-space:pre-wrap}.empty-state{text-align:center;padding:24px;border-radius:18px;border:1px dashed rgba(183,196,219,.55);background:rgba(255,255,255,.4);color:var(--muted)}
      .action-card{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:18px;padding:18px 20px;background:linear-gradient(135deg,rgba(255,255,255,.84),rgba(244,248,255,.92));border:1px solid rgba(196,207,227,.48)}
      .action-summary{min-width:0}
      .action-title{margin:0;font-size:18px;font-weight:700;color:var(--text)}
      .action-chip{display:inline-flex;align-items:center;padding:7px 12px;border-radius:999px;background:rgba(255,255,255,.78);border-color:rgba(193,204,224,.54);color:#5f7495;font-size:12px;font-weight:600}
      .status-line{min-height:18px}
      code{background:rgba(91,146,247,.1);padding:2px 6px;border-radius:8px;color:#7a5a17}::-webkit-scrollbar{width:8px;height:8px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--scroll);border-radius:999px;border:1px solid rgba(255,255,255,.32)}
      @media (max-width:1180px){.stats,.settings-grid,.filter-grid,.date-grid,.split,.action-card{grid-template-columns:1fr}.search-row{grid-template-columns:1fr}.toolbar,.footer-meta,.session-top,.relationship-box,.toggle-row,.child-header,.action-metrics{flex-direction:column;align-items:stretch}.primary-button--export{width:100%;min-width:0}}
    </style>
  </head>
  <body>
    <div class="page">
      <div class="topbar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><div class="brand"><span class="brand-mark">CE</span><span>Codex Chat Exporter</span></div></div>
      <div class="hero"><h1>会话选择</h1><p>上半区负责找会话和勾选会话；内部会话切到对应类型筛选后可直接导出。</p></div>
      <div class="stats">
        <div class="stat-card"><div class="stat-value">${stats.total}</div><div class="stat-label">总会话</div></div>
        <div class="stat-card"><div class="stat-value">${stats.internal}</div><div class="stat-label">内部会话</div></div>
        <div class="stat-card"><div class="stat-value">${stats.child}</div><div class="stat-label">子会话</div></div>
        <div class="stat-card"><div class="stat-value">${stats.main}</div><div class="stat-label">主会话</div></div>
      </div>
      <section class="sessions-card">
        <div class="search-row"><input class="input" id="session-search" type="text" placeholder="搜索标题、路径或 Session ID" /><button class="button" id="select-all-sessions">全选当前列表</button><button class="button" id="clear-all-sessions">清空选择</button></div>
        <div class="filter-grid"><select class="select" id="session-type-filter"><option value="main">主会话</option><option value="all">全部会话</option><option value="child">子会话</option><option value="internal">内部会话</option></select><select class="select" id="sort-field"><option value="last">按末句日期排序</option><option value="first">按首句日期排序</option></select><select class="select" id="sort-direction"><option value="desc">新到旧</option><option value="asc">旧到新</option></select></div>
        <div class="date-grid"><select class="select" id="filter-field"><option value="last">按末句日期筛选</option><option value="first">按首句日期筛选</option></select><input class="datetime" id="filter-start" type="datetime-local" /><input class="datetime" id="filter-end" type="datetime-local" /></div>
        <div class="toolbar"><div class="toolbar-left"><span class="pill" id="selected-count">已选 ${selectedCount} 条</span><span class="pill" id="visible-count">显示 0 / ${renderedSessions.length}</span></div><p class="muted">子会话默认折叠在主会话里；内部会话不做强行归并，因为本地日志没有可靠父链。</p></div>
        <div class="session-scroll"><div class="session-list" id="session-list">${renderSessionItems(renderedSessions, input.uiState.selectedSessionIds, input.childPreviewMap)}</div><div class="empty-state" id="empty-state" hidden>当前筛选条件下没有会话。</div></div>
      </section>
      <section class="settings">
        <div class="settings-header"><h2>导出设置</h2><p>这里只控制导出内容、模式和输出目录。</p></div>
        <div class="settings-grid">
          <section class="settings-card"><h3>导出内容</h3><p class="field-help">6 类内容独立勾选，标签同时展示原始字段名。</p><div class="section-list" id="section-list">${renderSectionItems(input.sections)}</div></section>
          <section class="settings-card">
            <div class="config-stack">
              <div class="field-group"><label class="field-label" for="profile-select">导出模式</label><select class="select" id="profile-select">${renderProfileOptions(input.profiles, input.uiState.selectedProfileId)}</select></div>
              <div class="field-group"><label class="field-label" for="custom-profile-name">自定义模式名称</label><input class="input" id="custom-profile-name" type="text" placeholder="例如：研究审计版" /><div class="actions-row"><button class="button" id="save-profile-button">新建模式</button><button class="button" id="update-profile-button">覆盖当前</button><button class="button" id="delete-profile-button">删除当前</button></div></div>
              <div class="field-group"><label class="field-label" for="output-dir">导出目录</label><div class="search-row"><input class="input" id="output-dir" type="text" value="${escapeHtml(input.uiState.outputDir ?? "")}" placeholder="选择导出目录" /><button class="button" id="pick-output-dir">浏览</button><span></span></div></div>
              <div class="field-group"><label class="field-label">文档拆分</label><div class="split"><select class="select" id="document-mode"><option value="single">单文档</option><option value="multi">按会话文件夹拆分</option></select><select class="select" id="hidden-content-mode"><option value="inline">隐藏内容内联</option><option value="appendix">隐藏内容附录</option><option value="split">隐藏内容独立文档</option></select></div></div>
              <div class="field-group"><label class="field-label" for="tool-trace-level">工具轨迹粒度</label><select class="select" id="tool-trace-level"><option value="summary">摘要</option><option value="full">完整</option></select></div>
              <div class="toggle-row"><div><div class="field-label">正文附带时间戳</div><p class="helper">把消息时间写进正文，方便核对特定日期和时间段。</p></div><label class="switch"><input id="include-message-timestamps" type="checkbox" ${input.uiState.includeMessageTimestamps ? "checked" : ""} /><span class="slider"></span></label></div>
              <div class="toggle-row"><div><div class="field-label">附带子会话附录</div><p class="helper">主会话可把已识别的子会话导出到附录；内部维护会话仍按独立会话处理。</p></div><label class="switch"><input id="include-child-sessions" type="checkbox" /><span class="slider"></span></label></div>
              <div class="field-group"><label class="field-label">正文时间区间</label><div class="split"><input class="datetime" id="start-time" type="datetime-local" /><input class="datetime" id="end-time" type="datetime-local" /></div><p class="field-help">只裁剪正文和关联轨迹，不会改写原始会话文件。</p></div>
            </div>
          </section>
        </div>
        <div class="action-card">
          <div class="action-summary">
            <div class="status-line" id="status-line"></div>
            <p class="action-eyebrow">准备导出</p>
            <h3 class="action-title">确认当前选择后再生成导出文件</h3>
            <div class="action-metrics">
              <span class="action-chip" id="selection-summary">已选 ${selectedCount} 条会话</span>
              <span class="action-chip">当前渲染 ${renderedSessions.length} / ${input.sessions.length}</span>
            </div>
            <p class="action-caption">按钮固定放在右侧主操作位，避免落在整条底栏左下角。</p>
          </div>
          <div class="export-cta">
            <button class="primary-button primary-button--export" id="export-button">生成导出文件</button>
            <p class="action-caption">导出结果会写入当前选择的导出目录。</p>
          </div>
        </div>
      </section>
    </div>
    <script id="initial-data" type="application/json">${initialData}</script>
    <script>
      const vscode = acquireVsCodeApi();
      const initialData = JSON.parse(document.getElementById("initial-data").textContent);
      const maxSessions = Number(initialData.maxSessionsInWizard || 1000);
      const state = { profiles: initialData.profiles, sessions: Array.isArray(initialData.sessions) ? initialData.sessions.slice(0, maxSessions) : [], selectedProfileId: initialData.uiState.selectedProfileId || "reading", selectedSessionIds: new Set(initialData.uiState.selectedSessionIds || []), outputDir: initialData.uiState.outputDir || "", includeMessageTimestamps: Boolean(initialData.uiState.includeMessageTimestamps), includeChildSessionsAsAppendix: Boolean(initialData.uiState.includeChildSessionsAsAppendix), start: initialData.uiState.start || "", end: initialData.uiState.end || "" };
      const profileSelect = document.getElementById("profile-select");
      const outputDirInput = document.getElementById("output-dir");
      const documentModeSelect = document.getElementById("document-mode");
      const hiddenContentModeSelect = document.getElementById("hidden-content-mode");
      const toolTraceLevelSelect = document.getElementById("tool-trace-level");
      const includeMessageTimestampsCheckbox = document.getElementById("include-message-timestamps");
      const includeChildSessionsCheckbox = document.getElementById("include-child-sessions");
      const startTimeInput = document.getElementById("start-time");
      const endTimeInput = document.getElementById("end-time");
      const sessionTypeFilterSelect = document.getElementById("session-type-filter");
      const sortFieldSelect = document.getElementById("sort-field");
      const sortDirectionSelect = document.getElementById("sort-direction");
      const filterFieldSelect = document.getElementById("filter-field");
      const filterStartInput = document.getElementById("filter-start");
      const filterEndInput = document.getElementById("filter-end");
      const selectedCountChip = document.getElementById("selected-count");
      const visibleCountChip = document.getElementById("visible-count");
      const selectionSummary = document.getElementById("selection-summary");
      const statusLine = document.getElementById("status-line");
      const customProfileNameInput = document.getElementById("custom-profile-name");
      const sessionSearchInput = document.getElementById("session-search");
      const sessionList = document.getElementById("session-list");
      const emptyState = document.getElementById("empty-state");
      function isoToDatetimeLocal(value){if(!value)return ""; const date=new Date(value); if(Number.isNaN(date.getTime()))return ""; const pad=(num)=>String(num).padStart(2,"0"); return [date.getFullYear(),"-",pad(date.getMonth()+1),"-",pad(date.getDate()),"T",pad(date.getHours()),":",pad(date.getMinutes())].join("");}
      function datetimeLocalToIso(value){if(!value)return undefined; const date=new Date(value); return Number.isNaN(date.getTime()) ? undefined : date.toISOString();}
      function datetimeLocalToMillis(value){if(!value)return undefined; const date=new Date(value); return Number.isNaN(date.getTime()) ? undefined : date.getTime();}
      function getProfile(profileId){return state.profiles.find((profile)=>profile.id===profileId) || state.profiles[0];}
      function setStatus(text){statusLine.textContent=text || "";}
      function updateSelectionText(){const countText="已选 " + state.selectedSessionIds.size + " 条"; selectedCountChip.textContent=countText; selectionSummary.textContent=countText + "会话";}
      function getSessionTime(session,field){const value=field==="first" ? session.firstMessageAt || session.timestamp || session.updatedAt : session.lastMessageAt || session.updatedAt || session.timestamp; const parsed=Date.parse(value || ""); return Number.isNaN(parsed) ? 0 : parsed;}
      function matchesType(card){const filter=sessionTypeFilterSelect.value; return filter==="all" ? true : card.getAttribute("data-session-type")===filter;}
      function matchesDateRange(card){const field=filterFieldSelect.value==="first" ? "data-first-message-at" : "data-last-message-at"; const value=Date.parse(card.getAttribute(field) || ""); const millis=Number.isNaN(value) ? 0 : value; const start=datetimeLocalToMillis(filterStartInput.value); const end=datetimeLocalToMillis(filterEndInput.value); if(start!==undefined && millis<start)return false; if(end!==undefined && millis>end)return false; return true;}
      function applySessionView(){const query=(sessionSearchInput.value || "").trim().toLowerCase(); const sortField=sortFieldSelect.value; const direction=sortDirectionSelect.value; const ordered=[...state.sessions].sort((left,right)=>{const delta=getSessionTime(left,sortField)-getSessionTime(right,sortField); return direction==="asc" ? delta : -delta;}); const cards=new Map(Array.from(document.querySelectorAll("[data-session-card]")).map((card)=>[card.getAttribute("data-session-id"),card])); const visible=[]; ordered.forEach((session)=>{const card=cards.get(session.sessionId); if(!card)return; const haystack=(card.getAttribute("data-search-text") || "").toLowerCase(); if((!query || haystack.includes(query)) && matchesType(card) && matchesDateRange(card)){visible.push(card);}}); cards.forEach((card)=>card.setAttribute("hidden","")); visible.forEach((card)=>{card.removeAttribute("hidden"); sessionList.appendChild(card);}); emptyState.hidden=visible.length>0; visibleCountChip.textContent="显示 " + visible.length + " / " + state.sessions.length;}
      function applyProfile(profileId){const profile=getProfile(profileId); if(!profile)return; state.selectedProfileId=profile.id; profileSelect.value=profile.id; documentModeSelect.value=profile.documentMode; hiddenContentModeSelect.value=profile.hiddenContentMode; toolTraceLevelSelect.value=profile.toolTraceLevel; includeMessageTimestampsCheckbox.checked=profile.includeMessageTimestamps; includeChildSessionsCheckbox.checked=profile.includeChildSessionsAsAppendix; startTimeInput.value=isoToDatetimeLocal(profile.transcriptTimeFilter && profile.transcriptTimeFilter.start); endTimeInput.value=isoToDatetimeLocal(profile.transcriptTimeFilter && profile.transcriptTimeFilter.end); document.querySelectorAll("[data-section-id]").forEach((checkbox)=>{checkbox.checked=profile.includedSections.includes(checkbox.getAttribute("data-section-id"));});}
      function collectIncludedSections(){return Array.from(document.querySelectorAll("[data-section-id]")).filter((checkbox)=>checkbox.checked).map((checkbox)=>checkbox.getAttribute("data-section-id"));}
      function buildPayload(includeProfileName,customProfileName){return {selectedProfileId:state.selectedProfileId,selectedSessionIds:Array.from(state.selectedSessionIds),outputDir:outputDirInput.value.trim(),documentMode:documentModeSelect.value,hiddenContentMode:hiddenContentModeSelect.value,toolTraceLevel:toolTraceLevelSelect.value,includeMessageTimestamps:includeMessageTimestampsCheckbox.checked,includeChildSessionsAsAppendix:includeChildSessionsCheckbox.checked,includedSections:collectIncludedSections(),start:datetimeLocalToIso(startTimeInput.value),end:datetimeLocalToIso(endTimeInput.value),customProfileName:includeProfileName ? customProfileName : undefined};}
      profileSelect.addEventListener("change",()=>applyProfile(profileSelect.value));
      document.getElementById("pick-output-dir").addEventListener("click",()=>{vscode.postMessage({type:"pickOutputDir"});});
      document.getElementById("select-all-sessions").addEventListener("click",()=>{document.querySelectorAll("[data-session-card]").forEach((card)=>{if(card.hasAttribute("hidden"))return; const checkbox=card.querySelector(".session-checkbox"); if(!checkbox)return; checkbox.checked=true; state.selectedSessionIds.add(checkbox.getAttribute("data-session-id"));}); updateSelectionText();});
      document.getElementById("clear-all-sessions").addEventListener("click",()=>{state.selectedSessionIds.clear(); document.querySelectorAll(".session-checkbox").forEach((checkbox)=>{checkbox.checked=false;}); updateSelectionText();});
      sessionList.addEventListener("change",(event)=>{const target=event.target; if(!(target instanceof HTMLInputElement) || !target.classList.contains("session-checkbox"))return; const sessionId=target.getAttribute("data-session-id"); if(!sessionId)return; if(target.checked){state.selectedSessionIds.add(sessionId);}else{state.selectedSessionIds.delete(sessionId);} updateSelectionText();});
      sessionList.addEventListener("click",(event)=>{const target=event.target; if(!(target instanceof HTMLElement))return; const button=target.closest("[data-child-toggle]"); if(!button)return; const sessionId=button.getAttribute("data-child-toggle"); const panel=document.querySelector('[data-child-panel="' + sessionId + '"]'); if(!panel)return; const hidden=panel.hasAttribute("hidden"); if(hidden){panel.removeAttribute("hidden"); button.textContent="收起子会话";}else{panel.setAttribute("hidden",""); button.textContent="展开查看子会话";}});
      sessionSearchInput.addEventListener("input",applySessionView); sessionTypeFilterSelect.addEventListener("change",applySessionView); sortFieldSelect.addEventListener("change",applySessionView); sortDirectionSelect.addEventListener("change",applySessionView); filterFieldSelect.addEventListener("change",applySessionView); filterStartInput.addEventListener("change",applySessionView); filterEndInput.addEventListener("change",applySessionView);
      document.getElementById("save-profile-button").addEventListener("click",()=>{vscode.postMessage({type:"saveProfile",payload:buildPayload(true,customProfileNameInput.value.trim())});});
      document.getElementById("update-profile-button").addEventListener("click",()=>{const fallbackName=profileSelect.options[profileSelect.selectedIndex] && profileSelect.options[profileSelect.selectedIndex].textContent ? profileSelect.options[profileSelect.selectedIndex].textContent : ""; vscode.postMessage({type:"updateProfile",payload:buildPayload(true,customProfileNameInput.value.trim() || fallbackName)});});
      document.getElementById("delete-profile-button").addEventListener("click",()=>{vscode.postMessage({type:"deleteProfile",payload:buildPayload(false)});});
      document.getElementById("export-button").addEventListener("click",()=>{vscode.postMessage({type:"export",payload:buildPayload(false)});});
      window.addEventListener("message",(event)=>{const message=event.data; if(message.type==="outputDirSelected"){outputDirInput.value=message.payload.outputDir || ""; setStatus("已选择导出目录。");} if(message.type==="profilesUpdated"){state.profiles=message.payload.profiles; profileSelect.innerHTML=state.profiles.map((profile)=>'<option value="' + profile.id + '">' + profile.name + '</option>').join(""); profileSelect.value=message.payload.selectedProfileId; applyProfile(message.payload.selectedProfileId);} if(message.type==="status"){setStatus(message.payload.text || "");}});
      if(state.start)startTimeInput.value=isoToDatetimeLocal(state.start); if(state.end)endTimeInput.value=isoToDatetimeLocal(state.end); sessionTypeFilterSelect.value="main"; applyProfile(state.selectedProfileId); updateSelectionText(); applySessionView();
    </script>
  </body>
</html>`;
}
