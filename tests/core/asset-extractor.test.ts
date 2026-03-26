import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { AssetExtractor } from "../../src/core/asset-extractor";

const ONE_PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jk6cAAAAASUVORK5CYII=";

const tempRoots: string[] = [];

describe("asset-extractor", () => {
  afterEach(async () => {
    const { rm } = await import("node:fs/promises");
    await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it("writes data-url images and deduplicates by content", async () => {
    const root = await mkdtemp(join(tmpdir(), "asset-extractor-"));
    tempRoots.push(root);
    const extractor = new AssetExtractor(root);
    const dataUrl = `data:image/png;base64,${ONE_PIXEL_PNG_BASE64}`;

    const first = await extractor.writeDataUrl(dataUrl, "turn1-user-image");
    const second = await extractor.writeDataUrl(dataUrl, "turn1-user-image");

    expect(first).toBe(second);
    const { access } = await import("node:fs/promises");
    await expect(access(join(root, first))).resolves.toBeUndefined();
  });

  it("copies local files into assets", async () => {
    const root = await mkdtemp(join(tmpdir(), "asset-extractor-"));
    tempRoots.push(root);
    const sourceFile = join(root, "source.txt");
    await writeFile(sourceFile, "hello", "utf8");
    const extractor = new AssetExtractor(root);

    const copied = await extractor.copyLocalFile(sourceFile, "local-file");

    const { readFile } = await import("node:fs/promises");
    await expect(readFile(join(root, copied), "utf8")).resolves.toBe("hello");
  });
});
