import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "darwin") {
  process.exit(0);
}

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const resourcesDirectory = join(projectRoot, "resources");
const sourceIcon = join(resourcesDirectory, "wh-notes.png");
const iconSetDirectory = join(resourcesDirectory, "wh-notes.iconset");
const macIcon = join(resourcesDirectory, "wh-notes.icns");

if (!existsSync(sourceIcon)) {
  throw new Error(`Missing source icon: ${sourceIcon}`);
}

const iconSizes = [
  ["icon_16x16.png", 16],
  ["icon_16x16@2x.png", 32],
  ["icon_32x32.png", 32],
  ["icon_32x32@2x.png", 64],
  ["icon_128x128.png", 128],
  ["icon_128x128@2x.png", 256],
  ["icon_256x256.png", 256],
  ["icon_256x256@2x.png", 512],
  ["icon_512x512.png", 512],
  ["icon_512x512@2x.png", 1024],
];

rmSync(iconSetDirectory, { force: true, recursive: true });
mkdirSync(iconSetDirectory);

for (const [fileName, size] of iconSizes) {
  execFileSync(
    "sips",
    [
      "-z",
      String(size),
      String(size),
      sourceIcon,
      "--out",
      join(iconSetDirectory, fileName),
    ],
    {
      stdio: "inherit",
    },
  );
}

execFileSync("iconutil", ["-c", "icns", iconSetDirectory, "-o", macIcon], {
  stdio: "inherit",
});
rmSync(iconSetDirectory, { force: true, recursive: true });
