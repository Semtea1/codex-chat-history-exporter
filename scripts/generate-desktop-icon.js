const fs = require("node:fs/promises");
const path = require("node:path");
const pngToIco = require("png-to-ico").default;

async function main() {
  const source = path.resolve(__dirname, "..", "media", "marketplace-icon.png");
  const target = path.resolve(__dirname, "..", "media", "desktop-app.ico");
  const buffer = await pngToIco(source);
  await fs.writeFile(target, buffer);
  process.stdout.write(`generated:${target}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
