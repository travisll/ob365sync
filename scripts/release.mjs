import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const rootDir = process.cwd();
const manifestPath = path.join(rootDir, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const releaseName = `${manifest.id}-${manifest.version}`;
const distDir = path.join(rootDir, "dist");
const releaseDir = path.join(distDir, releaseName);

fs.rmSync(releaseDir, { recursive: true, force: true });
fs.mkdirSync(releaseDir, { recursive: true });

const filesToCopy = [
  "manifest.json",
  "main.js",
  "versions.json",
  "README.md",
];

for (const relativePath of filesToCopy) {
  fs.copyFileSync(path.join(rootDir, relativePath), path.join(releaseDir, relativePath));
}

const stylesPath = path.join(rootDir, "styles.css");
if (fs.existsSync(stylesPath)) {
  fs.copyFileSync(stylesPath, path.join(releaseDir, "styles.css"));
}

const zipPath = path.join(distDir, `${releaseName}.zip`);
fs.rmSync(zipPath, { force: true });

const zipResult = spawnSync(
  "zip",
  [
    "-r",
    zipPath,
    releaseName,
  ],
  {
    cwd: distDir,
    stdio: "inherit",
  },
);

if (zipResult.status !== 0) {
  console.error("Release folder created, but zip packaging failed.");
  process.exit(zipResult.status ?? 1);
}

console.log(`Release bundle created at ${zipPath}`);
