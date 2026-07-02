import { execFileSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const port = 3000;
const url = `http://127.0.0.1:${port}/`;
const overrideEnv = "PDM_ALLOW_CLEAN_NEXT_WITH_LOCAL_SERVER";
const nextDir = path.join(process.cwd(), ".next");
const statusFile = path.join(root, "tmp", "local-dev", "ai-pdm-3000.status.json");
const allowRunningLocalServer =
  process.env[overrideEnv] === "1" || process.argv.includes("--allow-running-local-server");

function readWindowsPortOwner() {
  if (process.platform !== "win32") return { listening: false };

  const command = `
$connection = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($null -eq $connection) {
  [ordered]@{ listening = $false } | ConvertTo-Json -Compress
} else {
  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($connection.OwningProcess)" -ErrorAction SilentlyContinue
  [ordered]@{
    listening = $true
    processId = [int]$connection.OwningProcess
    processName = if ($process) { $process.Name } else { "" }
    commandLine = if ($process) { $process.CommandLine } else { "" }
  } | ConvertTo-Json -Compress
}
`;

  try {
    const output = execFileSync("powershell", ["-NoProfile", "-Command", command], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
    return output ? JSON.parse(output) : { listening: false };
  } catch {
    return { listening: false };
  }
}

function isProjectOwnedLocalServer(owner) {
  if (!owner?.listening || !owner.commandLine) return false;

  const commandLine = String(owner.commandLine).toLowerCase();
  const rootLower = root.toLowerCase();
  return (
    commandLine.includes(rootLower) &&
    (commandLine.includes("next") || commandLine.includes("npm"))
  );
}

async function writeBlockedStatus(owner) {
  await mkdir(path.dirname(statusFile), { recursive: true });
  await writeFile(
    statusFile,
    JSON.stringify(
      {
        app: "AI_PDM",
        port,
        url,
        state: "blocked_clean_next_project_server_running",
        launcherProcessId: 0,
        portOwnerProcessId: owner.processId ?? 0,
        portOwnerProcessName: owner.processName ?? "",
        portOwnerCommandLine: owner.commandLine ?? "",
        health: null,
        message: "Refusing to remove .next while the project-owned local server is listening.",
        updatedAt: new Date().toISOString()
      },
      null,
      2
    )
  );
}

const owner = readWindowsPortOwner();
if (isProjectOwnedLocalServer(owner) && !allowRunningLocalServer) {
  await writeBlockedStatus(owner);
  console.error(`Refusing to remove ${nextDir} while AI_PDM is listening on ${url}.`);
  console.error(`Port owner: PID ${owner.processId} (${owner.processName || "unknown"}).`);
  console.error("Use npm run dev:local:restart for stale-server recovery, or stop the server before build/clean.");
  console.error(`Intentional bypass only: set ${overrideEnv}=1 or pass --allow-running-local-server.`);
  process.exit(1);
}

if (isProjectOwnedLocalServer(owner) && allowRunningLocalServer) {
  console.warn(`Warning: ${nextDir} is being removed while AI_PDM is listening on ${url}.`);
}

await rm(nextDir, { recursive: true, force: true });
console.log(`Removed ${nextDir}`);
