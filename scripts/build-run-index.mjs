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

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function countJsonl(filePath) {
  if (!fs.existsSync(filePath)) return 0;
  const text = fs.readFileSync(filePath, "utf8").trim();
  return text ? text.split(/\n+/).length : 0;
}

const args = parseArgs(process.argv);
if (!args["run-dir"]) {
  console.error("Usage: node build-run-index.mjs --run-dir semrush-authority-runs/YYYYMMDD-HHMMSS");
  process.exit(1);
}

const runDir = path.resolve(args["run-dir"]);
const entries = fs.existsSync(runDir)
  ? fs.readdirSync(runDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b))
  : [];

const sites = entries.map((domain) => {
  const dir = path.join(runDir, domain);
  const scrapeSummary = readJson(path.join(dir, "scrape-summary.json"), {});
  const firstPassSummary = readJson(path.join(dir, "first-pass-summary.json"), {});
  const finalSummary = readJson(path.join(dir, "final-reviewed-summary.json"), {});
  const clusters = readJson(path.join(dir, "serp-review-recommendation-clusters.json"), {});
  const byPriority = clusters.summary?.byPriority || {};
  const error = scrapeSummary.error || firstPassSummary.error || finalSummary.error || null;

  return {
    domain,
    status: scrapeSummary.status || (error ? "failed" : "unknown"),
    pagesFetched: Number(scrapeSummary.pagesFetched || 0),
    rawRows: countJsonl(path.join(dir, "raw-rows.jsonl")),
    uniqueKeywords: countJsonl(path.join(dir, "unique-keywords.jsonl")),
    firstPassCandidates: countJsonl(path.join(dir, "first-pass-candidates.jsonl")),
    finalReviewedCandidates: countJsonl(path.join(dir, "final-reviewed-candidates.jsonl")),
    p0Keywords: Number(byPriority.P0?.keywords || 0),
    p1Keywords: Number(byPriority.P1?.keywords || 0),
    p2Keywords: Number(byPriority.P2?.keywords || 0),
    outputDir: dir,
    stopReason: scrapeSummary.stopReason || null,
    error,
  };
});

const index = {
  runDir,
  generatedAt: new Date().toISOString(),
  totals: {
    domains: sites.length,
    completed: sites.filter((site) => site.status === "completed").length,
    failed: sites.filter((site) => site.status === "failed").length,
    rawRows: sites.reduce((sum, site) => sum + site.rawRows, 0),
    uniqueKeywords: sites.reduce((sum, site) => sum + site.uniqueKeywords, 0),
    firstPassCandidates: sites.reduce((sum, site) => sum + site.firstPassCandidates, 0),
    finalReviewedCandidates: sites.reduce((sum, site) => sum + site.finalReviewedCandidates, 0),
    p0Keywords: sites.reduce((sum, site) => sum + site.p0Keywords, 0),
    p1Keywords: sites.reduce((sum, site) => sum + site.p1Keywords, 0),
    p2Keywords: sites.reduce((sum, site) => sum + site.p2Keywords, 0),
  },
  sites,
};

const outPath = path.join(runDir, "run-index.json");
fs.writeFileSync(outPath, JSON.stringify(index, null, 2) + "\n");
console.log(JSON.stringify(index, null, 2));
