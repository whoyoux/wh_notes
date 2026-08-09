import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerDeb } from "@electron-forge/maker-deb";
import { MakerRpm } from "@electron-forge/maker-rpm";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { VitePlugin } from "@electron-forge/plugin-vite";
import path from "node:path";

const iconPath = path.join(__dirname, "resources", "wh-notes.ico");
const linuxIconPath = path.join(__dirname, "resources", "wh-notes.png");
const nightlyVersion = process.env.WH_NOTES_NIGHTLY_VERSION;
const [stableVersion, nightlyRevision] = nightlyVersion?.split("-", 2) ?? [];
const linuxNightlyVersion =
  stableVersion && nightlyRevision
    ? { version: stableVersion, revision: nightlyRevision }
    : {};

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    icon: iconPath,
    extraResource: [iconPath],
  },
  makers: [
    new MakerSquirrel({ name: "wh_notes", setupIcon: iconPath }),
    new MakerDeb({
      options: {
        name: "wh-notes",
        productName: "wh_notes",
        bin: "wh_notes",
        genericName: "Private offline notes",
        description: "Private desktop notes that stay on your device.",
        productDescription:
          "A private, fully offline desktop application for writing and managing notes.",
        section: "utils",
        priority: "optional",
        maintainer: "whoyoux <elementalistapp@gmail.com>",
        homepage: "https://whoyoux.com",
        icon: linuxIconPath,
        categories: ["Office", "Utility"],
        ...linuxNightlyVersion,
      },
    }),
    new MakerRpm({
      options: {
        name: "wh-notes",
        productName: "wh_notes",
        bin: "wh_notes",
        genericName: "Private offline notes",
        description: "Private desktop notes that stay on your device.",
        productDescription:
          "A private, fully offline desktop application for writing and managing notes.",
        license: "Proprietary",
        group: "Applications/Office",
        homepage: "https://whoyoux.com",
        icon: linuxIconPath,
        categories: ["Office", "Utility"],
        ...linuxNightlyVersion,
      },
    }),
  ],
  plugins: [
    new VitePlugin({
      build: [
        { entry: "src/main.ts", config: "vite.main.config.mts" },
        { entry: "src/preload.ts", config: "vite.preload.config.mts" },
      ],
      renderer: [
        {
          name: "main_window",
          config: "vite.renderer.config.mts",
        },
      ],
    }),
  ],
};

export default config;
