import { spawn } from "node:child_process";
export function boundedProcess(command, args, { cwd, env, timeoutMs = 30000, maxBytes = 2 * 1024 * 1024 } = {}) {
  return new Promise(resolve => {
    const child = spawn(command, args, { cwd, env, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let size = 0, stderrSize = 0, reason = null;
    const chunks = [], errors = [];
    const timer = setTimeout(() => { reason = "timeout"; child.kill(); }, timeoutMs);
    child.stdout.on("data", chunk => {
      size += chunk.length;
      if (size > maxBytes) { reason = "output_limit_exceeded"; child.kill(); }
      else chunks.push(chunk);
    });
    child.stderr.on("data", chunk => { if (stderrSize < 8192) errors.push(chunk.subarray(0, 8192 - stderrSize)); stderrSize += chunk.length; });
    child.on("error", error => { reason = error.code === "ENOENT" ? "command_unavailable" : "process_error"; });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      let stdout = "";
      try { stdout = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)); }
      catch { reason = "invalid_utf8"; }
      resolve({ code, signal, reason, stdout, stderr: Buffer.concat(errors).toString("utf8"), stdoutBytes: size, pid: child.pid });
    });
  });
}
