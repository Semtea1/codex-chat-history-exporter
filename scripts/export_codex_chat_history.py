from __future__ import annotations

import argparse
import base64
import hashlib
import json
import re
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable, Iterator, NamedTuple


DEFAULT_CODEX_ROOT = Path.home() / ".codex"


class SessionSummary(NamedTuple):
    session_id: str
    title: str
    kind: str
    originator: str
    source: str
    cwd: str
    timestamp: str
    updated_at: str
    path: Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Export Codex Desktop / VS Code chat sessions from .codex/sessions to Markdown.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("command", choices=["list", "export"], help="Action to perform")
    parser.add_argument("--root", type=Path, default=DEFAULT_CODEX_ROOT, help="Codex root directory")
    parser.add_argument(
        "--kind",
        choices=["all", "desktop", "vscode", "cli", "unknown"],
        default="all",
        help="Filter sessions by source kind",
    )
    parser.add_argument("--session-id", action="append", default=[], help="Specific session id(s) to export")
    parser.add_argument("--latest", type=int, default=None, help="Only export the latest N matching sessions")
    parser.add_argument(
        "--out",
        type=Path,
        default=Path.cwd() / "exports" / "codex_chat_history",
        help="Output directory for exported Markdown",
    )
    parser.add_argument(
        "--include-reasoning-summaries",
        action="store_true",
        help="Include safe reasoning summaries when present",
    )
    return parser.parse_args()


def iter_jsonl(path: Path) -> Iterator[dict[str, Any]]:
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            stripped = line.strip()
            if not stripped:
                continue
            yield json.loads(stripped)


def load_session_index(root: Path) -> dict[str, dict[str, Any]]:
    path = root / "session_index.jsonl"
    if not path.exists():
        return {}
    index: dict[str, dict[str, Any]] = {}
    for row in iter_jsonl(path):
        session_id = row.get("id")
        if session_id:
            index[session_id] = row
    return index


def load_history_titles(root: Path) -> dict[str, str]:
    path = root / "history.jsonl"
    if not path.exists():
        return {}
    titles: dict[str, str] = {}
    for row in iter_jsonl(path):
        session_id = row.get("session_id")
        text = (row.get("text") or "").strip()
        if session_id and text and session_id not in titles:
            titles[session_id] = first_line(text)
    return titles


def first_line(text: str, max_length: int = 80) -> str:
    line = text.strip().splitlines()[0] if text.strip() else "Untitled Session"
    return line if len(line) <= max_length else f"{line[: max_length - 1]}…"


def stringify_metadata(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, (int, float, bool)):
        return str(value)
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def classify_kind(originator: str, source: str) -> str:
    originator_lower = stringify_metadata(originator).lower()
    source_lower = stringify_metadata(source).lower()
    if originator_lower == "codex_vscode":
        return "vscode"
    if "desktop" in originator_lower:
        return "desktop"
    if originator_lower == "codex_cli_rs" or source_lower == "cli":
        return "cli"
    return "unknown"


def scan_sessions(root: Path) -> list[SessionSummary]:
    index = load_session_index(root)
    history_titles = load_history_titles(root)
    sessions_root = root / "sessions"
    summaries: list[SessionSummary] = []

    for path in sessions_root.rglob("*.jsonl"):
        try:
            first_row = next(iter_jsonl(path))
        except (StopIteration, FileNotFoundError, json.JSONDecodeError):
            continue
        if first_row.get("type") != "session_meta":
            continue

        payload = first_row.get("payload", {})
        session_id = payload.get("id")
        if not session_id:
            continue

        index_row = index.get(session_id, {})
        title = (index_row.get("thread_name") or history_titles.get(session_id) or session_id).strip()
        updated_at = index_row.get("updated_at") or payload.get("timestamp") or first_row.get("timestamp") or ""

        summaries.append(
            SessionSummary(
                session_id=session_id,
                title=title,
                kind=classify_kind(payload.get("originator", ""), payload.get("source", "")),
                originator=stringify_metadata(payload.get("originator", "")),
                source=stringify_metadata(payload.get("source", "")),
                cwd=stringify_metadata(payload.get("cwd", "")),
                timestamp=stringify_metadata(payload.get("timestamp", "") or first_row.get("timestamp", "")),
                updated_at=stringify_metadata(updated_at),
                path=path,
            )
        )

    summaries.sort(key=lambda item: parse_timestamp(item.updated_at), reverse=True)
    return summaries


def parse_timestamp(value: str) -> datetime:
    if not value:
        return datetime.min
    normalized = value.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(normalized)
    except ValueError:
        return datetime.min


def slugify(value: str) -> str:
    cleaned = []
    for char in value.strip():
        if char.isalnum() or char in {"-", "_"}:
            cleaned.append(char)
        else:
            cleaned.append("-")
    slug = re.sub(r"-+", "-", "".join(cleaned)).strip("-")
    return slug or "session"


def ensure_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False, indent=2)


def try_pretty_json(text: str) -> str:
    candidate = text.strip()
    if not candidate:
        return ""
    try:
        parsed = json.loads(candidate)
    except json.JSONDecodeError:
        return text
    return json.dumps(parsed, ensure_ascii=False, indent=2)


def fenced_block(text: str, language: str = "text") -> str:
    content = text.rstrip("\n")
    max_ticks = max((len(match) for match in re.findall(r"`+", content)), default=0)
    fence = "`" * max(3, max_ticks + 1)
    return f"{fence}{language}\n{content}\n{fence}"


def decode_data_url(data_url: str) -> tuple[str, bytes]:
    header, encoded = data_url.split(",", 1)
    mime = header.split(";", 1)[0].split(":", 1)[1]
    return mime, base64.b64decode(encoded)


def extension_from_mime(mime: str) -> str:
    mapping = {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/webp": ".webp",
        "image/gif": ".gif",
        "image/bmp": ".bmp",
        "image/svg+xml": ".svg",
    }
    return mapping.get(mime.lower(), ".bin")


def extension_from_bytes(data: bytes) -> str:
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if data.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if data.startswith(b"GIF87a") or data.startswith(b"GIF89a"):
        return ".gif"
    if data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return ".webp"
    if data.startswith(b"BM"):
        return ".bmp"
    return ".bin"


class AssetWriter:
    def __init__(self, export_dir: Path) -> None:
        self.assets_dir = export_dir / "assets"
        self.assets_dir.mkdir(parents=True, exist_ok=True)
        self._digest_to_relpath: dict[str, str] = {}
        self._counter = 0

    def write_data_url(self, data_url: str, prefix: str) -> str:
        mime, data = decode_data_url(data_url)
        extension = extension_from_mime(mime)
        return self._write_bytes(data, extension, prefix)

    def write_local_image(self, image_path: str | Path, prefix: str) -> str | None:
        path = Path(image_path)
        if not path.exists() or not path.is_file():
            return None
        data = path.read_bytes()
        extension = path.suffix or extension_from_bytes(data)
        return self._write_bytes(data, extension, prefix)

    def _write_bytes(self, data: bytes, extension: str, prefix: str) -> str:
        digest = hashlib.sha1(data).hexdigest()
        existing = self._digest_to_relpath.get(digest)
        if existing:
            return existing

        self._counter += 1
        filename = f"{prefix}-{self._counter:03d}-{digest[:10]}{extension}"
        path = self.assets_dir / filename
        path.write_bytes(data)
        relpath = Path("assets") / filename
        relpath_text = relpath.as_posix()
        self._digest_to_relpath[digest] = relpath_text
        return relpath_text


def render_content_items(items: Iterable[dict[str, Any]], asset_writer: AssetWriter, prefix: str) -> tuple[str, list[str]]:
    blocks: list[str] = []
    image_refs: list[str] = []
    for item in items:
        item_type = item.get("type")
        if item_type in {"input_text", "output_text"}:
            text = ensure_text(item.get("text")).strip()
            if text:
                blocks.append(text)
        elif item_type == "input_image":
            image_url = item.get("image_url")
            if isinstance(image_url, str) and image_url.startswith("data:image/"):
                relpath = asset_writer.write_data_url(image_url, prefix)
                image_refs.append(relpath)
                blocks.append(f"![{prefix}]({relpath})")
        else:
            fallback = ensure_text(item).strip()
            if fallback:
                blocks.append(fenced_block(fallback, "json"))
    return "\n\n".join(blocks).strip(), image_refs


def add_section(lines: list[str], heading: str, body: str) -> None:
    body = body.strip()
    if not body:
        return
    lines.append(f"### {heading}")
    lines.append("")
    lines.append(body)
    lines.append("")


def render_tool_details(title: str, body: str, language: str) -> str:
    rendered = ["<details>", f"<summary>{title}</summary>", "", fenced_block(body, language), "", "</details>"]
    return "\n".join(rendered)


def message_signature(text: str, image_refs: Iterable[str]) -> tuple[str, tuple[str, ...]]:
    return text.strip(), tuple(sorted(image_refs))


def export_session(
    summary: SessionSummary,
    output_root: Path,
    include_reasoning_summaries: bool = False,
) -> Path:
    timestamp = parse_timestamp(summary.updated_at or summary.timestamp)
    timestamp_label = timestamp.strftime("%Y%m%d-%H%M%S") if timestamp != datetime.min else "unknown-time"
    export_dir = output_root / f"{timestamp_label}_{summary.kind}_{summary.session_id}_{slugify(summary.title)[:60]}"
    if export_dir.exists():
        shutil.rmtree(export_dir)
    export_dir.mkdir(parents=True, exist_ok=True)
    asset_writer = AssetWriter(export_dir)

    lines = [f"# {summary.title}", "", "## Metadata", ""]
    lines.extend(
        [
            f"- Session ID: `{summary.session_id}`",
            f"- Kind: `{summary.kind}`",
            f"- Originator: `{summary.originator or 'unknown'}`",
            f"- Source: `{summary.source or 'unknown'}`",
            f"- Started At: `{summary.timestamp or 'unknown'}`",
            f"- Updated At: `{summary.updated_at or 'unknown'}`",
            f"- CWD: `{summary.cwd or 'unknown'}`",
            f"- Raw File: `{summary.path}`",
            "",
            "## Transcript",
            "",
        ]
    )

    current_turn = 0
    last_user_event_signature: tuple[str, tuple[str, ...]] | None = None
    user_event_seen_in_turn = False
    pending_user_section: str | None = None

    def flush_pending_user_section() -> None:
        nonlocal pending_user_section
        if pending_user_section:
            add_section(lines, f"User {current_turn or 1}", pending_user_section)
            pending_user_section = None

    for row in iter_jsonl(summary.path):
        row_type = row.get("type")

        if row_type == "turn_context":
            flush_pending_user_section()
            current_turn += 1
            last_user_event_signature = None
            user_event_seen_in_turn = False
            continue

        if row_type == "event_msg":
            payload = row.get("payload", {})
            if payload.get("type") != "user_message":
                continue
            blocks: list[str] = []
            message_text = ensure_text(payload.get("message")).strip()
            if message_text:
                blocks.append(message_text)
            image_refs: list[str] = []
            for image_url in payload.get("images", []) or []:
                if isinstance(image_url, str) and image_url.startswith("data:image/"):
                    relpath = asset_writer.write_data_url(image_url, f"turn{current_turn or 1}-user-image")
                    image_refs.append(relpath)
                    blocks.append(f"![turn{current_turn or 1}-user-image]({relpath})")
            for local_image in payload.get("local_images", []) or []:
                relpath = asset_writer.write_local_image(local_image, f"turn{current_turn or 1}-user-image")
                if relpath:
                    image_refs.append(relpath)
                    blocks.append(f"![turn{current_turn or 1}-user-image]({relpath})")
            rendered = "\n\n".join(blocks).strip()
            if rendered:
                pending_user_section = None
                add_section(lines, f"User {current_turn or 1}", rendered)
                last_user_event_signature = message_signature(message_text, image_refs)
                user_event_seen_in_turn = True
            continue

        if row_type != "response_item":
            continue

        payload = row.get("payload", {})
        payload_type = payload.get("type")

        if payload_type == "message":
            role = payload.get("role", "assistant")
            content = payload.get("content", []) or []
            rendered, image_refs = render_content_items(content, asset_writer, f"turn{current_turn or 1}-{role}-image")

            if role == "user":
                if user_event_seen_in_turn:
                    continue
                current_signature = message_signature(
                    "\n\n".join(
                        ensure_text(item.get("text")) for item in content if isinstance(item, dict) and item.get("type") == "input_text"
                    ),
                    image_refs,
                )
                if last_user_event_signature == current_signature:
                    continue
                if rendered:
                    pending_user_section = rendered
                continue

            flush_pending_user_section()
            if rendered:
                add_section(lines, f"{role.title()} {current_turn or 1}", rendered)
            continue

        if payload_type in {"function_call", "custom_tool_call", "web_search_call"}:
            flush_pending_user_section()
            name = payload.get("name") or payload.get("action") or payload_type
            call_id = payload.get("call_id") or payload.get("id") or "unknown"
            body = try_pretty_json(ensure_text(payload.get("arguments") or payload))
            lines.append(render_tool_details(f"Tool call: {name} ({call_id})", body, "json"))
            lines.append("")
            continue

        if payload_type in {"function_call_output", "custom_tool_call_output"}:
            flush_pending_user_section()
            call_id = payload.get("call_id") or payload.get("id") or "unknown"
            output = try_pretty_json(ensure_text(payload.get("output") or payload))
            lines.append(render_tool_details(f"Tool output: {call_id}", output, "json" if output.startswith("{") or output.startswith("[") else "text"))
            lines.append("")
            continue

        if payload_type == "reasoning" and include_reasoning_summaries:
            flush_pending_user_section()
            summaries = [
                ensure_text(item.get("text")).strip()
                for item in payload.get("summary", []) or []
                if isinstance(item, dict)
            ]
            summaries = [item for item in summaries if item]
            if summaries:
                add_section(lines, f"Reasoning Summary {current_turn or 1}", "\n\n".join(summaries))

    flush_pending_user_section()

    transcript_path = export_dir / "transcript.md"
    transcript_path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    return export_dir


def filter_sessions(
    sessions: Iterable[SessionSummary],
    kind: str = "all",
    session_ids: Iterable[str] | None = None,
    latest: int | None = None,
) -> list[SessionSummary]:
    session_id_set = set(session_ids or [])
    filtered = []
    for session in sessions:
        if kind != "all" and session.kind != kind:
            continue
        if session_id_set and session.session_id not in session_id_set:
            continue
        filtered.append(session)
    if latest is not None:
        filtered = filtered[:latest]
    return filtered


def write_index(exported_dirs: list[tuple[SessionSummary, Path]], output_root: Path) -> None:
    lines = ["# Codex Chat Export Index", ""]
    for summary, export_dir in exported_dirs:
        transcript_path = export_dir / "transcript.md"
        lines.append(f"- [{summary.title}]({transcript_path.relative_to(output_root).as_posix()}) - `{summary.kind}` - `{summary.session_id}`")
    (output_root / "index.md").write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def print_sessions(sessions: Iterable[SessionSummary]) -> None:
    for session in sessions:
        print(
            f"{session.updated_at or session.timestamp}\t{session.kind}\t{session.session_id}\t{session.title}\t{session.cwd}"
        )


def main() -> int:
    args = parse_args()
    sessions = scan_sessions(args.root)
    selected = filter_sessions(sessions, kind=args.kind, session_ids=args.session_id, latest=args.latest)

    if args.command == "list":
        print_sessions(selected)
        return 0

    args.out.mkdir(parents=True, exist_ok=True)
    exported: list[tuple[SessionSummary, Path]] = []
    for summary in selected:
        export_dir = export_session(
            summary,
            args.out,
            include_reasoning_summaries=args.include_reasoning_summaries,
        )
        exported.append((summary, export_dir))
        print(f"Exported {summary.session_id} -> {export_dir}")

    write_index(exported, args.out)
    print(f"Wrote index -> {args.out / 'index.md'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
