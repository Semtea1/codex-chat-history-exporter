import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";

function decodeDataUrl(dataUrl: string): { mime: string; data: Buffer } {
  const [header, encoded] = dataUrl.split(",", 2);
  if (!header || !encoded) {
    throw new Error("Invalid data URL");
  }
  const mime = header.split(";", 1)[0]?.split(":", 2)[1] ?? "application/octet-stream";
  return { mime, data: Buffer.from(encoded, "base64") };
}

function extensionFromMime(mime: string): string {
  switch (mime.toLowerCase()) {
    case "image/png":
      return ".png";
    case "image/jpeg":
    case "image/jpg":
      return ".jpg";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    case "image/bmp":
      return ".bmp";
    case "image/svg+xml":
      return ".svg";
    default:
      return ".bin";
  }
}

function hashBytes(data: Buffer): string {
  return createHash("sha1").update(data).digest("hex");
}

export class AssetExtractor {
  private readonly assetDir: string;

  private readonly digestToRelativePath = new Map<string, string>();

  private counter = 0;

  public constructor(private readonly sessionDir: string) {
    this.assetDir = join(sessionDir, "assets");
  }

  public async writeDataUrl(dataUrl: string, prefix: string): Promise<string> {
    const { mime, data } = decodeDataUrl(dataUrl);
    const extension = extensionFromMime(mime);
    return this.writeBytes(data, extension, prefix);
  }

  public async copyLocalFile(path: string, prefix: string): Promise<string> {
    const data = await readFile(path);
    const extension = path.includes(".") ? path.slice(path.lastIndexOf(".")) : ".bin";
    const relativePath = await this.writeBytes(data, extension || ".bin", prefix);
    await copyFile(path, join(this.sessionDir, relativePath));
    return relativePath;
  }

  private async writeBytes(data: Buffer, extension: string, prefix: string): Promise<string> {
    await mkdir(this.assetDir, { recursive: true });
    const digest = hashBytes(data);
    const existing = this.digestToRelativePath.get(digest);
    if (existing) {
      return existing;
    }

    this.counter += 1;
    const fileName = `${prefix}-${String(this.counter).padStart(3, "0")}-${digest.slice(0, 10)}${extension}`;
    const relativePath = `assets/${fileName}`;
    await writeFile(join(this.sessionDir, relativePath), data);
    this.digestToRelativePath.set(digest, relativePath);
    return relativePath;
  }
}
