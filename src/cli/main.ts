import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

import { exportSession } from "../core/exporter";
import { getBuiltinProfiles } from "../core/profile";
import { buildChildSessionMap, scanSessions } from "../core/session-index";

interface CliOptions {
  command: "list" | "export" | "profiles-list";
  root: string;
  kind: "all" | "desktop" | "vscode" | "cli" | "unknown";
  latest?: number;
  sessionIds: string[];
  profile: string;
  outputDir: string;
  start?: string;
  end?: string;
  includeMessageTimestamps?: boolean;
}

export function parseArgs(argv: string[]): CliOptions {
  const args = [...argv];
  const command = args.shift();

  let normalizedCommand: CliOptions["command"];
  if (command === "list") {
    normalizedCommand = "list";
  } else if (command === "export") {
    normalizedCommand = "export";
  } else if (command === "profiles" && args[0] === "list") {
    args.shift();
    normalizedCommand = "profiles-list";
  } else {
    throw new Error('Supported commands are: "list", "export", "profiles list"');
  }

  let root = resolve(process.env.USERPROFILE ?? process.cwd(), ".codex");
  let kind: CliOptions["kind"] = "all";
  let latest: number | undefined;
  const sessionIds: string[] = [];
  let profile = "reading";
  let outputDir = resolve(process.cwd(), "outputs", "export");
  let start: string | undefined;
  let end: string | undefined;
  let includeMessageTimestamps: boolean | undefined;

  while (args.length > 0) {
    const token = args.shift();
    if (token === "--root") {
      root = resolve(args.shift() ?? "");
      continue;
    }
    if (token === "--kind") {
      const next = args.shift() as CliOptions["kind"] | undefined;
      if (!next || !["all", "desktop", "vscode", "cli", "unknown"].includes(next)) {
        throw new Error("Invalid value for --kind");
      }
      kind = next;
      continue;
    }
    if (token === "--latest") {
      const next = Number(args.shift());
      if (!Number.isFinite(next) || next <= 0) {
        throw new Error("Invalid value for --latest");
      }
      latest = next;
      continue;
    }
    if (token === "--session-id") {
      const next = args.shift();
      if (!next) {
        throw new Error("Missing value for --session-id");
      }
      sessionIds.push(next);
      continue;
    }
    if (token === "--profile") {
      profile = args.shift() ?? profile;
      continue;
    }
    if (token === "--output-dir") {
      outputDir = resolve(args.shift() ?? "");
      continue;
    }
    if (token === "--start") {
      start = args.shift();
      continue;
    }
    if (token === "--end") {
      end = args.shift();
      continue;
    }
    if (token === "--include-message-timestamps") {
      includeMessageTimestamps = true;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  return {
    command: normalizedCommand,
    root,
    kind,
    latest,
    sessionIds,
    profile,
    outputDir,
    start,
    end,
    includeMessageTimestamps
  };
}

function printUsage(): void {
  console.log("Usage:");
  console.log("  node dist/cli/main.js list [--root <path>] [--kind <all|desktop|vscode|cli|unknown>] [--latest <n>]");
  console.log(
    "  node dist/cli/main.js export [--root <path>] [--kind <all|desktop|vscode|cli|unknown>] [--latest <n>] [--session-id <id>]... [--profile <reading|audit|forensics>] [--output-dir <path>] [--start <iso>] [--end <iso>] [--include-message-timestamps]"
  );
  console.log("  node dist/cli/main.js profiles list");
}

function filterSessions(
  options: Pick<CliOptions, "kind" | "latest" | "sessionIds">,
  sessions: Awaited<ReturnType<typeof scanSessions>>
) {
  return sessions
    .filter((session) => options.kind === "all" || session.kind === options.kind)
    .filter((session) => options.sessionIds.length === 0 || options.sessionIds.includes(session.sessionId))
    .slice(0, options.latest ?? Number.MAX_SAFE_INTEGER);
}

async function writeIndex(outputDir: string, rows: Array<{ title: string; sessionDir: string }>): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  const lines = ["# Export Index", ""];
  for (const row of rows) {
    const relativeTranscript = `${row.sessionDir.split(/[\\/]/).pop()}/transcript.md`;
    lines.push(`- [${row.title}](${relativeTranscript})`);
  }
  await writeFile(resolve(outputDir, "index.md"), `${lines.join("\n")}\n`, "utf8");
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  try {
    const options = parseArgs(argv);
    if (options.command === "profiles-list") {
      for (const profile of getBuiltinProfiles()) {
        console.log([profile.id, profile.name, profile.includedSections.join(",")].join("\t"));
      }
      return;
    }

    const sessions = await scanSessions(options.root);
    const filtered = filterSessions(options, sessions);

    if (options.command === "list") {
      for (const session of filtered) {
        console.log(
          [session.updatedAt || session.timestamp, session.kind, session.sessionId, session.title, session.cwd].join(
            "\t"
          )
        );
      }
      return;
    }

    const profile = getBuiltinProfiles().find((item) => item.id === options.profile);
    if (!profile) {
      throw new Error(`Unknown profile: ${options.profile}`);
    }
    const effectiveProfile = {
      ...profile,
      includeMessageTimestamps: options.includeMessageTimestamps ?? profile.includeMessageTimestamps,
      transcriptTimeFilter:
        options.start || options.end
          ? {
              enabled: true,
              start: options.start,
              end: options.end
            }
          : profile.transcriptTimeFilter
    };

    const childSessionMap = buildChildSessionMap(sessions);
    const indexRows: Array<{ title: string; sessionDir: string }> = [];
    for (const session of filtered) {
      const result = await exportSession(session, effectiveProfile, options.outputDir, {
        childSessions: effectiveProfile.includeChildSessionsAsAppendix ? childSessionMap.get(session.sessionId) ?? [] : []
      });
      console.log(`Exported ${session.sessionId}\t${result.outputDir}`);
      indexRows.push({ title: session.title, sessionDir: result.outputDir });
    }
    await writeIndex(options.outputDir, indexRows);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    printUsage();
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}
