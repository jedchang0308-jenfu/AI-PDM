import { spawn } from "node:child_process";

function quoteWindowsShellArg(value) {
  if (!/[\s"&|<>^]/.test(value)) return value;
  return `"${value.replace(/"/g, '\\"')}"`;
}

export function runQcCommand(root, command, args, options = {}) {
  return new Promise((resolve) => {
    const isWindows = process.platform === "win32";
    const child = isWindows
      ? spawn([command, ...args].map(quoteWindowsShellArg).join(" "), {
          cwd: root,
          env: { ...process.env, ...options.env },
          shell: true,
          stdio: ["ignore", "pipe", "pipe"]
        })
      : spawn(command, args, {
          cwd: root,
          env: { ...process.env, ...options.env },
          stdio: ["ignore", "pipe", "pipe"]
        });

    let output = "";
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      if (!options.quiet) process.stdout.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      if (!options.quiet) process.stderr.write(text);
    });
    child.on("close", (code) => {
      resolve({ code, output });
    });
  });
}
