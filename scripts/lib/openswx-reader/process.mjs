import { spawn } from "node:child_process";
export function boundedProcess(command, args, { cwd, env, timeoutMs = 30000, maxBytes = 2 * 1024 * 1024, signal } = {}) {
  return new Promise(resolve => {
    if (signal?.aborted) { resolve({ code: null, reason: "aborted", stdout: "", stderr: "", stdoutBytes: 0, cleanupVerified: true }); return; }
    const group = process.platform === "linux";
    const child = spawn(command, args, { cwd, env, detached: group, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let size = 0, stderrSize = 0, reason = null, killTimer, cleanupTimer, closed = false, resolved = false;
    const chunks = [], errors = [];
    const send = sig => {
      try { if (group && child.pid) process.kill(-child.pid, sig); else child.kill(sig); }
      catch (error) { if (error.code !== "ESRCH") reason = "cleanup_unproven"; }
    };
    const absent = () => {
      if (!child.pid) return true;
      try { process.kill(group ? -child.pid : child.pid, 0); return false; }
      catch (error) { return error.code === "ESRCH"; }
    };
    const finish = (code, exitSignal, verified) => {
      if (resolved) return; resolved = true;
      clearTimeout(timer); clearTimeout(killTimer); clearTimeout(cleanupTimer);
      signal?.removeEventListener("abort", abort);
      let stdout = "";
      try { stdout = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)); }
      catch { reason = "invalid_utf8"; }
      if (!verified) { reason = "cleanup_unproven"; child.stdout.destroy(); child.stderr.destroy(); child.unref(); }
      resolve({ code, signal: exitSignal, reason, stdout, stderr: Buffer.concat(errors).toString("utf8"), stdoutBytes: size, pid: child.pid, cleanupVerified: verified });
    };
    const stop = why => {
      reason ??= why;
      if (cleanupTimer) return;
      send("SIGTERM");
      killTimer = setTimeout(() => send("SIGKILL"), 250);
      cleanupTimer = setTimeout(() => finish(null, null, closed && absent()), 2000);
    };
    const abort = () => stop("aborted"); signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => stop("timeout"), timeoutMs);
    child.stdout.on("data", chunk => {
      size += chunk.length;
      if (size > maxBytes) stop("output_limit_exceeded");
      else chunks.push(chunk);
    });
    child.stderr.on("data", chunk => { if (stderrSize < 8192) errors.push(chunk.subarray(0, 8192 - stderrSize)); stderrSize += chunk.length; });
    child.on("error", error => { reason = error.code === "ENOENT" ? "command_unavailable" : "process_error"; });
    child.on("close", (code, signal) => {
      closed = true;
      if (absent()) { finish(code, signal, true); return; }
      stop("cleanup_unproven");
      const poll = () => { if (resolved) return; if (absent()) finish(code, signal, true); else setTimeout(poll, 20); };
      poll();
    });
  });
}
