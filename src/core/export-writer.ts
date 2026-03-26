import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function prepareSessionOutputDir(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true });
  await mkdir(path, { recursive: true });
}

export async function writeDocument(outputDir: string, fileName: string, content: string): Promise<string> {
  const path = join(outputDir, fileName);
  await writeFile(path, content, "utf8");
  return path;
}
