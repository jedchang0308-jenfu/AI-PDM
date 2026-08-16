import fs from "node:fs";
import path from "node:path";

export function projectPath(root, relativePath) {
  return path.join(root, ...relativePath.split("/"));
}

export function readProjectFile(root, relativePath) {
  return fs.readFileSync(projectPath(root, relativePath), "utf8");
}

export function projectFileExists(root, relativePath) {
  return fs.existsSync(projectPath(root, relativePath));
}

export function readProjectFileIfExists(root, relativePath, fallback = "") {
  return projectFileExists(root, relativePath) ? readProjectFile(root, relativePath) : fallback;
}

export function readProjectJson(root, relativePath) {
  return JSON.parse(readProjectFile(root, relativePath));
}
