import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
export function classifyInspectResponse(statusCode, body, name) {
  let value;
  try { value = JSON.parse(body); } catch { throw new Error("cleanup_readback_unknown"); }
  if (statusCode === 404 && value?.message === "No such container: " + name) return { status: "absent" };
  if (statusCode === 200 && /^[a-f0-9]{64}$/.test(value?.Id) && /^sha256:[a-f0-9]{64}$/.test(value?.Image) &&
      value.Config && typeof value.State?.Running === "boolean") return { status: "present", container: value };
  throw new Error("cleanup_readback_unknown");
}
export function inspectContainer(name) {
  if (!/^([a-f0-9]{64}|aipdm-dev122-[a-f0-9-]{36}-\d+)$/.test(name)) throw new Error("container_name_invalid");
  return new Promise((resolve, reject) => {
    const request = http.request({ socketPath: "\\\\.\\pipe\\dockerDesktopLinuxEngine",
      path: "/v1.43/containers/" + encodeURIComponent(name) + "/json", method: "GET" }, response => {
      let bytes = 0; const chunks = [];
      response.on("data", chunk => {
        bytes += chunk.length;
        if (bytes > 2 * 1024 * 1024) request.destroy(new Error("cleanup_readback_unknown"));
        else chunks.push(chunk);
      });
      response.on("error", () => reject(new Error("cleanup_readback_unknown")));
      response.on("end", () => {
        clearTimeout(timer);
        try { resolve(classifyInspectResponse(response.statusCode, new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)), name)); }
        catch { reject(new Error("cleanup_readback_unknown")); }
      });
    });
    const timer = setTimeout(() => request.destroy(new Error("cleanup_readback_unknown")), 10000);
    request.on("error", () => { clearTimeout(timer); reject(new Error("cleanup_readback_unknown")); });
    request.end();
  });
}
export function containsPath(parent, child, platform = process.platform) {
  const api = platform === "win32" ? path.win32 : path.posix;
  if (platform === "win32") { parent = parent.toLowerCase(); child = child.toLowerCase(); }
  const relative = api.relative(parent, child);
  return relative === "" || (!relative.startsWith(".." + api.sep) && relative !== ".." && !api.isAbsolute(relative));
}
async function checkedDirectory(value) {
  const absolute = path.resolve(value);
  let current = absolute;
  while (true) {
    const stat = await fs.lstat(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("directory_alias_or_non_directory");
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return fs.realpath(absolute);
}
export const checkedInputRoot = checkedDirectory;
export async function checkedOutputRoot(value, inputRoot) {
  const output = await checkedDirectory(value); // Must exist; no input mutation before overlap proof.
  const input = await checkedDirectory(inputRoot);
  if (containsPath(input, output) || containsPath(output, input)) throw new Error("output_overlaps_input");
  return output;
}
export async function verifyInputRoot(inputRoot, names) {
  await checkedDirectory(inputRoot);
  const entries = await fs.readdir(inputRoot, { withFileTypes: true });
  if (entries.length !== names.size || entries.some(entry => !entry.isFile() || entry.isSymbolicLink() || !names.has(entry.name)))
    throw new Error("input_directory_not_exact_manifest");
}

export function parseFlags(args) {
  const accepted = new Set(["--image", "--input-root", "--manifest", "--output-dir"]);
  if (args.length !== 8) throw new Error("exact_arguments_required");
  const flags = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!accepted.has(args[i]) || Object.hasOwn(flags, args[i]) || !args[i + 1]) throw new Error("exact_arguments_required");
    flags[args[i]] = args[i + 1];
  }
  return flags;
}
