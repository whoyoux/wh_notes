const majorVersion = Number(process.versions.node.split(".", 1)[0]);

if (majorVersion < 24 || majorVersion >= 25) {
  console.error(`wh_notes packaging requires Node.js 24. Detected ${process.version}.`);
  console.error("Install the version declared in .nvmrc before running npm run package or npm run make.");
  process.exit(1);
}
