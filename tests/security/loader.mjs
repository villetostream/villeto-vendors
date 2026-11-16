import fs from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function resolveFileCandidate(basePath) {
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    `${basePath}.mjs`,
    path.join(basePath, "index.ts"),
    path.join(basePath, "index.tsx"),
    path.join(basePath, "index.js"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return pathToFileURL(candidate).href;
    }
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "next/server") {
    const nextServerPath = path.join(REPO_ROOT, "node_modules", "next", "server.js");
    if (fs.existsSync(nextServerPath)) {
      return nextResolve(pathToFileURL(nextServerPath).href, context);
    }
  }

  if (specifier.startsWith("@/")) {
    const target = path.join(REPO_ROOT, specifier.slice(2));
    const resolved = resolveFileCandidate(target);
    if (resolved) {
      return nextResolve(resolved, context);
    }
  }

  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    context.parentURL?.startsWith("file://")
  ) {
    const parentDir = path.dirname(fileURLToPath(context.parentURL));
    const target = path.resolve(parentDir, specifier);
    const resolved = resolveFileCandidate(target);
    if (resolved) {
      return nextResolve(resolved, context);
    }
  }

  return nextResolve(specifier, context);
}
