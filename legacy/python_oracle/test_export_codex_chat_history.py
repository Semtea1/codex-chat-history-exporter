import base64
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "export_codex_chat_history.py"


def load_module():
    spec = importlib.util.spec_from_file_location("export_codex_chat_history", MODULE_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("Unable to load exporter module")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


ONE_PIXEL_PNG_BASE64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jk6cAAAAASUVORK5CYII="
)


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


class ExportCodexChatHistoryTests(unittest.TestCase):
    def test_scan_sessions_reads_titles_and_kinds(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir) / ".codex"
            write_jsonl(
                root / "session_index.jsonl",
                [
                    {"id": "desktop-1", "thread_name": "Desktop session", "updated_at": "2026-03-24T10:00:00Z"},
                    {"id": "vscode-1", "thread_name": "VS Code session", "updated_at": "2026-03-24T11:00:00Z"},
                ],
            )
            write_jsonl(
                root / "sessions" / "2026" / "03" / "24" / "desktop.jsonl",
                [
                    {
                        "timestamp": "2026-03-24T10:00:00Z",
                        "type": "session_meta",
                        "payload": {
                            "id": "desktop-1",
                            "timestamp": "2026-03-24T10:00:00Z",
                            "cwd": "C:/work",
                            "originator": "Codex Desktop",
                            "source": "exec",
                            "cli_version": "0.1.0",
                        },
                    }
                ],
            )
            write_jsonl(
                root / "sessions" / "2026" / "03" / "24" / "vscode.jsonl",
                [
                    {
                        "timestamp": "2026-03-24T11:00:00Z",
                        "type": "session_meta",
                        "payload": {
                            "id": "vscode-1",
                            "timestamp": "2026-03-24T11:00:00Z",
                            "cwd": "C:/repo",
                            "originator": "codex_vscode",
                            "source": "vscode",
                            "cli_version": "0.2.0",
                        },
                    }
                ],
            )

            module = load_module()
            sessions = module.scan_sessions(root)

            self.assertEqual([session.session_id for session in sessions], ["vscode-1", "desktop-1"])
            self.assertEqual(sessions[0].title, "VS Code session")
            self.assertEqual(sessions[0].kind, "vscode")
            self.assertEqual(sessions[1].kind, "desktop")

    def test_export_session_writes_markdown_assets_and_deduplicates_images(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir) / ".codex"
            session_id = "desktop-2"
            image_url = f"data:image/png;base64,{ONE_PIXEL_PNG_BASE64}"
            write_jsonl(
                root / "session_index.jsonl",
                [{"id": session_id, "thread_name": "Image session", "updated_at": "2026-03-24T12:00:00Z"}],
            )
            write_jsonl(
                root / "sessions" / "2026" / "03" / "24" / "image.jsonl",
                [
                    {
                        "timestamp": "2026-03-24T12:00:00Z",
                        "type": "session_meta",
                        "payload": {
                            "id": session_id,
                            "timestamp": "2026-03-24T12:00:00Z",
                            "cwd": "C:/repo",
                            "originator": "Codex Desktop",
                            "source": "vscode",
                            "cli_version": "0.3.0",
                        },
                    },
                    {
                        "timestamp": "2026-03-24T12:00:01Z",
                        "type": "event_msg",
                        "payload": {
                            "type": "user_message",
                            "message": "请帮我导出这条会话",
                            "images": [image_url],
                            "local_images": [],
                            "text_elements": [],
                        },
                    },
                    {
                        "timestamp": "2026-03-24T12:00:01Z",
                        "type": "response_item",
                        "payload": {
                            "type": "message",
                            "role": "user",
                            "content": [
                                {"type": "input_text", "text": "请帮我导出这条会话"},
                                {"type": "input_image", "image_url": image_url},
                            ],
                        },
                    },
                    {
                        "timestamp": "2026-03-24T12:00:02Z",
                        "type": "response_item",
                        "payload": {
                            "type": "message",
                            "role": "assistant",
                            "content": [{"type": "output_text", "text": "可以，我会导出成 Markdown。"}],
                        },
                    },
                    {
                        "timestamp": "2026-03-24T12:00:03Z",
                        "type": "response_item",
                        "payload": {
                            "type": "function_call",
                            "name": "shell",
                            "arguments": '{"command": ["echo", "hello"]}',
                            "call_id": "call-1",
                        },
                    },
                    {
                        "timestamp": "2026-03-24T12:00:04Z",
                        "type": "response_item",
                        "payload": {
                            "type": "function_call_output",
                            "call_id": "call-1",
                            "output": '{"output":"hello\\n","metadata":{"exit_code":0}}',
                        },
                    },
                ],
            )

            module = load_module()
            summary = module.scan_sessions(root)[0]
            output_root = Path(temp_dir) / "exports"
            export_dir = module.export_session(summary, output_root)

            transcript_path = export_dir / "transcript.md"
            assets_dir = export_dir / "assets"
            markdown = transcript_path.read_text(encoding="utf-8")
            asset_files = list(assets_dir.iterdir())

            self.assertTrue(transcript_path.exists())
            self.assertEqual(len(asset_files), 1)
            self.assertIn("请帮我导出这条会话", markdown)
            self.assertIn("可以，我会导出成 Markdown。", markdown)
            self.assertIn("Tool call: shell", markdown)
            self.assertIn('"output": "hello\\n"', markdown)
            self.assertEqual(markdown.count("assets/"), 1)
            self.assertEqual(asset_files[0].suffix.lower(), ".png")

    def test_scan_sessions_handles_non_string_source_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir) / ".codex"
            write_jsonl(
                root / "sessions" / "2026" / "03" / "24" / "desktop-subagent.jsonl",
                [
                    {
                        "timestamp": "2026-03-24T13:00:00Z",
                        "type": "session_meta",
                        "payload": {
                            "id": "desktop-subagent",
                            "timestamp": "2026-03-24T13:00:00Z",
                            "cwd": "C:/repo",
                            "originator": "Codex Desktop",
                            "source": {"subagent": "memory_consolidation"},
                            "cli_version": "0.3.1",
                        },
                    }
                ],
            )

            module = load_module()
            sessions = module.scan_sessions(root)

            self.assertEqual(len(sessions), 1)
            self.assertEqual(sessions[0].kind, "desktop")
            self.assertIn("memory_consolidation", sessions[0].source)

    def test_user_event_takes_precedence_over_user_response_item_mirror(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir) / ".codex"
            session_id = "desktop-3"
            image_url = f"data:image/png;base64,{ONE_PIXEL_PNG_BASE64}"
            write_jsonl(
                root / "sessions" / "2026" / "03" / "24" / "mirror.jsonl",
                [
                    {
                        "timestamp": "2026-03-24T14:00:00Z",
                        "type": "session_meta",
                        "payload": {
                            "id": session_id,
                            "timestamp": "2026-03-24T14:00:00Z",
                            "cwd": "C:/repo",
                            "originator": "Codex Desktop",
                            "source": "exec",
                            "cli_version": "0.3.2",
                        },
                    },
                    {
                        "timestamp": "2026-03-24T14:00:01Z",
                        "type": "turn_context",
                        "payload": {"turn_id": "turn-1"},
                    },
                    {
                        "timestamp": "2026-03-24T14:00:03Z",
                        "type": "response_item",
                        "payload": {
                            "type": "message",
                            "role": "user",
                            "content": [
                                {"type": "input_text", "text": "镜像层消息"},
                                {"type": "input_image", "image_url": image_url},
                            ],
                        },
                    },
                    {
                        "timestamp": "2026-03-24T14:00:04Z",
                        "type": "event_msg",
                        "payload": {
                            "type": "user_message",
                            "message": "用户原始消息",
                            "images": [image_url],
                            "local_images": [],
                            "text_elements": [],
                        },
                    },
                ],
            )

            module = load_module()
            summary = module.scan_sessions(root)[0]
            export_dir = module.export_session(summary, Path(temp_dir) / "exports")
            markdown = (export_dir / "transcript.md").read_text(encoding="utf-8")

            self.assertIn("用户原始消息", markdown)
            self.assertNotIn("镜像层消息", markdown)
            self.assertEqual(markdown.count("![turn1-user-image]"), 1)


if __name__ == "__main__":
    unittest.main()
