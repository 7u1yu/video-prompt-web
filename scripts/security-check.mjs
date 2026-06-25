import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const ignoredDirs = new Set([
  ".git",
  ".next",
  "node_modules",
  "uploads",
  "data",
  "script_narrative_rag/data",
  "src/generated/prisma",
]);

const checks = [
  { name: "OpenAI secret key", pattern: /sk-[A-Za-z0-9_-]{20,}/ },
  { name: "Google/Stitch-style key", pattern: /AQ\.[A-Za-z0-9_-]{20,}/ },
  { name: "Bearer token", pattern: /Bearer\s+[A-Za-z0-9._-]{20,}/ },
  {
    name: "non-placeholder OPENAI_API_KEY assignment",
    pattern: /^OPENAI_API_KEY\s*=\s*(?!["']?(?:replace|example|placeholder|your-|$))/m,
  },
  { name: "local absolute path", pattern: /\/Users\/lcc/ },
];

const failures = [];

function isIgnored(relativePath) {
  const normalized = relativePath.split(path.sep).join("/");
  for (const dir of ignoredDirs) {
    if (normalized === dir || normalized.startsWith(`${dir}/`)) return true;
  }
  return false;
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(root, fullPath);
    if (isIgnored(relativePath)) continue;

    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }

    if (!entry.isFile()) continue;
    const stat = fs.statSync(fullPath);
    if (stat.size > 5 * 1024 * 1024) continue;

    const text = fs.readFileSync(fullPath, "utf8");
    for (const check of checks) {
      const match = text.match(check.pattern);
      if (match) {
        failures.push(`${relativePath}: matched ${check.name}`);
      }
    }
  }
}

function trackedForbiddenFiles() {
  let tracked = "";
  try {
    tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" });
  } catch {
    return;
  }

  const forbidden = tracked
    .split("\n")
    .filter(Boolean)
    .filter((file) => {
      return (
        file === ".env" ||
        file.startsWith(".env.") ||
        file.endsWith(".db") ||
        file.startsWith("uploads/") ||
        file.startsWith("data/")
      );
    })
    .filter((file) => file !== ".env.example");

  for (const file of forbidden) {
    failures.push(`${file}: forbidden file is tracked by Git`);
  }
}

walk(root);
trackedForbiddenFiles();

if (failures.length > 0) {
  console.error("Security check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Security check passed: no obvious secrets, local paths, tracked env/db/upload files found.");
