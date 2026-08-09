import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerDeb } from "@electron-forge/maker-deb";
import { MakerRpm } from "@electron-forge/maker-rpm";
import { MakerWix } from "@electron-forge/maker-wix";
import { VitePlugin } from "@electron-forge/plugin-vite";
import type { MSICreator } from "electron-wix-msi/lib/creator";
import path from "node:path";

const iconPath = path.join(__dirname, "resources", "wh-notes.ico");
const windowsIconPath = path.join(__dirname, "resources", "wh-notes");
const linuxIconPath = path.join(__dirname, "resources", "wh-notes.png");
const nightlyVersion = process.env.WH_NOTES_NIGHTLY_VERSION;
const [stableVersion, nightlyRevision] = nightlyVersion?.split("-", 2) ?? [];
const linuxNightlyVersion =
  stableVersion && nightlyRevision
    ? { version: stableVersion, revision: nightlyRevision }
    : {};

const wixProgramFilesRoot = '<Directory Id="{{ProgramFilesFolder}}">';
const wixPerUserRoot = '<Directory Id="LocalAppDataFolder">';

function configurePerUserWixInstaller(creator: MSICreator) {
  // electron-wix-msi marks the package as per-user, but its stock WiX template
  // still roots application files in Program Files. That directory requires
  // elevation, so use the current user's Local AppData directory instead.
  if (!creator.wixTemplate.includes(wixProgramFilesRoot)) {
    throw new Error(
      "The WiX template no longer has the expected install root.",
    );
  }

  creator.wixTemplate = creator.wixTemplate
    .replace(wixProgramFilesRoot, wixPerUserRoot)
    .replace(
      'Name = "{{ApplicationName}} (Machine - MSI)"',
      'Name = "{{ApplicationName}}"',
    );
}

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    icon: windowsIconPath,
    extraResource: [iconPath],
    win32metadata: {
      CompanyName: "whoyoux",
      FileDescription: "Private, fully offline desktop notes.",
      InternalName: "wh_notes",
      OriginalFilename: "wh_notes.exe",
      ProductName: "wh_notes",
    },
  },
  makers: [
    new MakerWix({
      arch: "x64",
      appUserModelId: "com.whoyoux.wh_notes",
      beforeCreate: configurePerUserWixInstaller,
      defaultInstallMode: "perUser",
      description: "Private, fully offline desktop notes.",
      exe: "wh_notes.exe",
      features: { autoLaunch: false, autoUpdate: false },
      icon: iconPath,
      // The upstream generator assigns a file as every component's key path.
      // WiX's ICE38 validator only accepts an HKCU registry key in per-user
      // folders; the generated package remains valid for our non-advertised app.
      lightSwitches: ["-sice:ICE38"],
      manufacturer: "whoyoux",
      name: "wh_notes",
      programFilesFolderName: "wh_notes",
      shortcutFolderName: "whoyoux",
      shortcutName: "wh_notes",
      shortName: "wh_notes",
      upgradeCode: "5A6EBFEC-C682-4FA4-A079-554D9BEBDA5B",
    }),
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
