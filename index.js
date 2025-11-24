#!/usr/bin/env node

const { spawnSync } = require("child_process");
const os = require("os");
const path = require("path");

function resolveBinary() {
  const platform = os.platform();
  const arch = os.arch();

  if (platform === "darwin" && arch === "arm64") return "plaud-tm-darwin-arm64";
  if (platform === "darwin" && arch === "x64") return "plaud-tm-darwin-x64";
  if (platform === "linux" && arch === "x64") return "plaud-tm-linux-x64";
  if (platform === "linux" && arch === "arm64") return "plaud-tm-linux-arm64";
  if (platform === "win32" && arch === "x64") return "plaud-tm-win32-x64.exe";

  return null;
}

const binaryName = resolveBinary();

if (!binaryName) {
  console.error(`plaud-tm: unsupported platform/architecture: ${os.platform()} ${os.arch()}`);
  process.exit(1);
}

const binaryPath = path.join(__dirname, "bin", binaryName);
const result = spawnSync(binaryPath, process.argv.slice(2), { stdio: "inherit" });

if (result.error) {
  console.error(`plaud-tm: failed to start binary at ${binaryPath}`);
  console.error(String(result.error));
  process.exit(1);
}

if (result.status !== null) {
  process.exit(result.status);
}

// If the process was terminated by a signal, mimic Node's default behaviour.
if (result.signal) {
  process.kill(process.pid, result.signal);
} else {
  process.exit(1);
}
