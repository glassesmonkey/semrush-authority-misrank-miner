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

function readJsonl(filePath) {
  const text = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8").trim() : "";
  if (!text) return [];
  return text.split(/\n+/).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`${filePath}:${index + 1} ${error.message}`);
    }
  });
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function compactRow(row) {
  const keyword = String(row.keyword || row.phrase || row.kw || row.query || "").trim();
  const compact = {
    keyword,
    page: numberOrZero(row.page),
    position: numberOrZero(row.position || row.pos),
    volume: numberOrZero(row.volume || row.search_volume || row.searchVolume),
    traffic: numberOrZero(row.traffic),
    kd: numberOrZero(row.kd || row.keyword_difficulty || row.keywordDifficulty),
    cpc: numberOrZero(row.cpc),
  };

  if (row.intents !== undefined) compact.intents = row.intents;
  if (row.redditUrl || row.url || row.landingPage || row.landing_page) {
    compact.redditUrl = row.redditUrl || row.url || row.landingPage || row.landing_page;
  }
  if (row.type) compact.type = row.type;
  if (row.reason) compact.reason = row.reason;
  if (row.recommended_shape) compact.recommended_shape = row.recommended_shape;
  if (row.monetization) compact.monetization = row.monetization;
  if (row.risk) compact.risk = row.risk;
  if (row.supply_advantage) compact.supply_advantage = row.supply_advantage;

  return compact;
}

function chunkRow(row, mode) {
  if (mode === "full") return row;
  return { keyword: row.keyword };
}

const args = parseArgs(process.argv);
if (!args.input || !args["out-dir"]) {
  console.error("Usage: node prepare-keyword-chunks.mjs --input raw.jsonl --out-dir site-dir [--chunk-size 500] [--chunks-dir chunks-500] [--unique-out unique-keywords.jsonl] [--prefix chunk] [--chunk-fields keyword|full]");
  process.exit(1);
}

const inputPath = path.resolve(args.input);
const outDir = path.resolve(args["out-dir"]);
const chunkSize = Number(args["chunk-size"] || 500);
const chunksDirName = args["chunks-dir"] || `chunks-${chunkSize}`;
const chunksDir = path.join(outDir, chunksDirName);
const uniqueOut = path.join(outDir, args["unique-out"] || "unique-keywords.jsonl");
const prefix = args.prefix || "chunk";
const chunkFields = args["chunk-fields"] || "keyword";

if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
  throw new Error(`Invalid --chunk-size: ${args["chunk-size"]}`);
}
if (!["keyword", "full"].includes(chunkFields)) {
  throw new Error(`Invalid --chunk-fields: ${chunkFields}`);
}

fs.mkdirSync(outDir, { recursive: true });
fs.rmSync(chunksDir, { recursive: true, force: true });
fs.mkdirSync(chunksDir, { recursive: true });

const rows = readJsonl(inputPath);
const seen = new Set();
const uniqueRows = [];
const skipped = [];

for (const [index, row] of rows.entries()) {
  const compact = compactRow(row);
  const key = compact.keyword.toLowerCase();
  if (!key) {
    skipped.push({ line: index + 1, reason: "missing keyword" });
    continue;
  }
  if (seen.has(key)) continue;
  seen.add(key);
  uniqueRows.push(compact);
}

fs.writeFileSync(uniqueOut, uniqueRows.map((row) => JSON.stringify(row)).join("\n") + (uniqueRows.length ? "\n" : ""));

const chunks = [];
for (let index = 0; index < uniqueRows.length; index += chunkSize) {
  const chunkRows = uniqueRows.slice(index, index + chunkSize).map((row) => chunkRow(row, chunkFields));
  const name = `${prefix}-${String(chunks.length).padStart(2, "0")}.jsonl`;
  const fullPath = path.join(chunksDir, name);
  fs.writeFileSync(fullPath, chunkRows.map((row) => JSON.stringify(row)).join("\n") + "\n");
  chunks.push({ file: name, rows: chunkRows.length });
}

const summary = {
  inputPath,
  inputRows: rows.length,
  uniqueRows: uniqueRows.length,
  skipped,
  chunkSize,
  chunkFields,
  chunksDir,
  chunks,
  uniqueOut,
};

fs.writeFileSync(path.join(outDir, `${chunksDirName}-summary.json`), JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify(summary, null, 2));
