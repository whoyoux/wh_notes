import { readFile, writeFile } from "node:fs/promises";

const [version] = process.argv.slice(2);

if (!/^\d+\.\d+\.\d+-nightly\d+$/.test(version ?? "")) {
  console.error("Expected a nightly SemVer version such as 0.1.0-nightly42.");
  process.exit(1);
}

const packagePath = new URL("../package.json", import.meta.url);
const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
packageJson.version = version;
await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
