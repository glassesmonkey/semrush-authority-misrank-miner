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

const args = parseArgs(process.argv);
if (!args["run-dir"]) {
  console.error("Usage: node validate-run.mjs --run-dir semrush-authority-runs/YYYYMMDD-HHMMSS");
  process.exit(1);
}

const runDir = path.resolve(args["run-dir"]);
const domains = fs.readdirSync(runDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort((a, b) => a.localeCompare(b));
const requiredRecommendationFields = ["priority", "cluster", "keyword", "type", "volume", "kd", "cpc", "page", "recommended_shape", "monetization", "risk", "reason"];
const requiredFiles = [
  "raw-rows.jsonl",
  "unique-keywords.jsonl",
  "first-pass-candidates.jsonl",
  "final-reviewed-candidates.jsonl",
  "serp-review-recommendations.md",
  "serp-review-recommendation-keywords.jsonl",
  "serp-review-recommendation-clusters.json",
];

const results = [];
const errors = [];

for (const domain of domains) {
  const dir = path.join(runDir, domain);
  for (const file of requiredFiles) {
    if (!fs.existsSync(path.join(dir, file))) errors.push(`${domain} missing ${file}`);
  }

  const rawRows = readJsonl(path.join(dir, "raw-rows.jsonl"));
  const uniqueRows = readJsonl(path.join(dir, "unique-keywords.jsonl"));
  const firstPassRows = readJsonl(path.join(dir, "first-pass-candidates.jsonl"));
  const finalRows = readJsonl(path.join(dir, "final-reviewed-candidates.jsonl"));
  const recommendationRows = readJsonl(path.join(dir, "serp-review-recommendation-keywords.jsonl"));

  const keywordSet = new Set();
  for (const row of recommendationRows) {
    const key = String(row.keyword || "").trim().toLowerCase();
    if (!key) errors.push(`${domain} recommendation missing keyword`);
    if (keywordSet.has(key)) errors.push(`${domain} duplicate recommendation keyword: ${row.keyword}`);
    keywordSet.add(key);
    for (const field of requiredRecommendationFields) {
      if (row[field] === undefined) errors.push(`${domain} ${row.keyword || "(missing keyword)"} missing ${field}`);
    }
    if (!["P0", "P1", "P2"].includes(row.priority)) errors.push(`${domain} ${row.keyword} invalid priority ${row.priority}`);
  }

  const byPriority = { P0: 0, P1: 0, P2: 0 };
  for (const row of recommendationRows) {
    if (byPriority[row.priority] !== undefined) byPriority[row.priority] += 1;
  }

  results.push({
    domain,
    rawRows: rawRows.length,
    uniqueKeywords: uniqueRows.length,
    firstPassCandidates: firstPassRows.length,
    finalReviewedCandidates: finalRows.length,
    recommendationRows: recommendationRows.length,
    byPriority,
  });
}

const output = {
  runDir,
  domains: results,
  errors,
};

console.log(JSON.stringify(output, null, 2));
if (errors.length) process.exit(1);
