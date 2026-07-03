import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

const args = parseArgs(process.argv);
if (!args["input-dir"] || !args.out) {
  console.error("Usage: node merge-jsonl-results.mjs --input-dir results-dir --pattern '^chunk-[0-9]+\\\\.jsonl$' --out merged.jsonl [--summary summary.json]");
  process.exit(1);
}

const inputDir = path.resolve(args["input-dir"]);
const outPath = path.resolve(args.out);
const summaryPath = path.resolve(args.summary || `${outPath}.summary.json`);
const pattern = new RegExp(args.pattern || ".*\\.jsonl$");

const files = fs.existsSync(inputDir)
  ? fs.readdirSync(inputDir).filter((name) => pattern.test(name)).sort((a, b) => a.localeCompare(b, "en", { numeric: true }))
  : [];

const merged = [];
const seen = new Set();
const errors = [];
const fileStats = [];

for (const file of files) {
  const fullPath = path.join(inputDir, file);
  const text = fs.readFileSync(fullPath, "utf8").trim();
  const lines = text ? text.split(/\n+/) : [];
  let accepted = 0;

  for (const [index, line] of lines.entries()) {
    try {
      const item = JSON.parse(line);
      const keyword = String(item.keyword || "").trim();
      const key = keyword.toLowerCase();
      if (!key) {
        errors.push(`${file}:${index + 1} missing keyword`);
        continue;
      }
      if (seen.has(key)) continue;
      seen.add(key);
      accepted += 1;
      merged.push({ ...item, keyword, sourceFile: file });
    } catch (error) {
      errors.push(`${file}:${index + 1} ${error.message}`);
    }
  }

  fileStats.push({ file, lines: lines.length, accepted });
}

merged.sort((a, b) => {
  const cpcDiff = Number(b.cpc || 0) - Number(a.cpc || 0);
  if (cpcDiff) return cpcDiff;
  const volumeDiff = Number(b.volume || 0) - Number(a.volume || 0);
  if (volumeDiff) return volumeDiff;
  return String(a.keyword).localeCompare(String(b.keyword));
});

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, merged.map((item) => JSON.stringify(item)).join("\n") + (merged.length ? "\n" : ""));

const summary = {
  inputDir,
  files: files.length,
  rawLines: fileStats.reduce((sum, stat) => sum + stat.lines, 0),
  mergedCount: merged.length,
  duplicates: fileStats.reduce((sum, stat) => sum + stat.lines, 0) - merged.length - errors.length,
  outPath,
  errors,
  fileStats,
};

fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify(summary, null, 2));
