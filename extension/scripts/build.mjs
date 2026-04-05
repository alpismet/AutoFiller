import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const publicDir = path.join(rootDir, "public");

const entryPoints = {
  background: path.join(rootDir, "src/background/index.js"),
  content: path.join(rootDir, "src/content/index.js"),
  offscreen: path.join(rootDir, "src/offscreen/index.js"),
  options: path.join(rootDir, "src/options/index.js")
};

async function main() {
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });
  await cp(publicDir, distDir, { recursive: true });

  await build({
    entryPoints,
    outdir: distDir,
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "chrome120",
    charset: "utf8",
    logLevel: "info"
  });

  console.log(`Extension build ready: ${distDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
