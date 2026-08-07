import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

function hasExited(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

function waitForExit(child, timeoutMs) {
  if (hasExited(child)) return Promise.resolve(true);

  return new Promise((resolve) => {
    const onExit = () => {
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      child.off("exit", onExit);
      resolve(hasExited(child));
    }, timeoutMs);
    child.once("exit", onExit);
  });
}

async function sendAndWait(child, signal, timeoutMs) {
  if (hasExited(child)) return true;
  try {
    child.kill(signal);
  } catch (error) {
    if (error?.code === "ESRCH") return true;
    throw error;
  }
  return waitForExit(child, timeoutMs);
}

export async function stopNextProcess(child, options = {}) {
  if (!child || hasExited(child)) return;

  const interruptMs = options.interruptMs ?? 4000;
  const terminateMs = options.terminateMs ?? 3000;
  const killMs = options.killMs ?? 3000;
  const settleMs = options.settleMs ?? 250;

  if (!await sendAndWait(child, "SIGINT", interruptMs) &&
      !await sendAndWait(child, "SIGTERM", terminateMs)) {
    const killed = await sendAndWait(child, "SIGKILL", killMs);
    if (!killed) {
      throw new Error(`NEXT_CHILD_EXIT_TIMEOUT pid=${child.pid ?? "unknown"}`);
    }
  }

  // Next can flush generated TypeScript config immediately before process exit.
  // Restore tracked files only after the exit event and a short I/O quiet period.
  await delay(settleMs);
}

export function restoreTrackedConfigSnapshots(root, snapshots) {
  for (const [file, content] of snapshots) {
    const target = path.join(root, file);
    const temp = path.join(
      path.dirname(target),
      `.${path.basename(target)}.qc-restore-${process.pid}-${crypto.randomUUID()}.tmp`
    );
    try {
      fs.writeFileSync(temp, content, "utf8");
      fs.renameSync(temp, target);
    } finally {
      if (fs.existsSync(temp)) fs.rmSync(temp, { force: true });
    }
    if (fs.readFileSync(target, "utf8") !== content) {
      throw new Error(`TRACKED_CONFIG_RESTORE_MISMATCH file=${file}`);
    }
  }
}
