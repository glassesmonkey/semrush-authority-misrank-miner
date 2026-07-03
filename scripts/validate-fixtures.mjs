import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptsDir = path.join(skillDir, "scripts");
const fixturesDir = path.join(skillDir, "fixtures");
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "semrush-authority-fixture-"));
const siteDir = path.join(tmpRoot, "reddit.com");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run(scriptName, args) {
  const result = spawnSync(process.execPath, [path.join(scriptsDir, scriptName), ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error([
      `${scriptName} failed with status ${result.status}`,
      result.stdout,
      result.stderr,
    ].filter(Boolean).join("\n"));
  }
  return result.stdout;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
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

function countJsonl(filePath) {
  return readJsonl(filePath).length;
}

function assertRequiredRecommendationFields(rows) {
  const required = ["priority", "cluster", "keyword", "type", "volume", "kd", "cpc", "page", "recommended_shape", "monetization", "risk", "reason"];
  for (const [index, row] of rows.entries()) {
    for (const field of required) {
      assert(row[field] !== undefined, `recommendation row ${index + 1} missing ${field}`);
    }
    assert(["P0", "P1", "P2"].includes(row.priority), `invalid priority for ${row.keyword}`);
  }
}

fs.mkdirSync(siteDir, { recursive: true });

run("prepare-keyword-chunks.mjs", [
  "--input", path.join(fixturesDir, "sample-raw-reddit.jsonl"),
  "--out-dir", siteDir,
  "--chunk-size", "2",
]);

const uniqueRows = readJsonl(path.join(siteDir, "unique-keywords.jsonl"));
assert(uniqueRows.length === 5, `expected 5 unique keywords, got ${uniqueRows.length}`);
assert(new Set(uniqueRows.map((row) => row.keyword.toLowerCase())).size === uniqueRows.length, "unique-keywords.jsonl has duplicate keywords");
assert(countJsonl(path.join(siteDir, "chunks-2", "chunk-00.jsonl")) === 2, "chunk-00 should contain 2 rows");
assert(countJsonl(path.join(siteDir, "chunks-2", "chunk-02.jsonl")) === 1, "chunk-02 should contain 1 row");
const firstChunkRows = readJsonl(path.join(siteDir, "chunks-2", "chunk-00.jsonl"));
assert(firstChunkRows.every((row) => Object.keys(row).length === 1 && row.keyword), "screening chunks must be keyword-only by default");

const firstPassDir = path.join(siteDir, "first-pass-results");
fs.mkdirSync(firstPassDir, { recursive: true });
const sampleFinal = fs.readFileSync(path.join(fixturesDir, "sample-final-reviewed.jsonl"), "utf8").trim().split(/\n+/);
fs.writeFileSync(path.join(firstPassDir, "chunk-00.jsonl"), `${sampleFinal.slice(0, 4).join("\n")}\n`);
fs.writeFileSync(path.join(firstPassDir, "chunk-01.jsonl"), `${sampleFinal.slice(3).join("\n")}\n`);

run("merge-jsonl-results.mjs", [
  "--input-dir", firstPassDir,
  "--pattern", "^chunk-[0-9]+\\.jsonl$",
  "--out", path.join(siteDir, "first-pass-candidates.jsonl"),
  "--summary", path.join(siteDir, "first-pass-summary.json"),
]);

assert(countJsonl(path.join(siteDir, "first-pass-candidates.jsonl")) === 6, "first-pass merge should dedupe to 6 rows");

run("prepare-keyword-chunks.mjs", [
  "--input", path.join(siteDir, "first-pass-candidates.jsonl"),
  "--out-dir", siteDir,
  "--chunk-size", "3",
  "--chunks-dir", "final-review-chunks",
  "--unique-out", "final-review-source.jsonl",
  "--prefix", "review",
]);
assert(countJsonl(path.join(siteDir, "final-review-chunks", "review-01.jsonl")) === 3, "review-01 should contain 3 rows");
const reviewChunkRows = readJsonl(path.join(siteDir, "final-review-chunks", "review-00.jsonl"));
assert(reviewChunkRows.every((row) => Object.keys(row).length === 1 && row.keyword), "review chunks must be keyword-only by default");

const finalReviewDir = path.join(siteDir, "final-review-results");
fs.mkdirSync(finalReviewDir, { recursive: true });
fs.copyFileSync(path.join(siteDir, "final-review-chunks", "review-00.jsonl"), path.join(finalReviewDir, "review-00.jsonl"));
fs.copyFileSync(path.join(siteDir, "final-review-chunks", "review-01.jsonl"), path.join(finalReviewDir, "review-01.jsonl"));

run("merge-jsonl-results.mjs", [
  "--input-dir", finalReviewDir,
  "--pattern", "^review-[0-9]+\\.jsonl$",
  "--out", path.join(siteDir, "final-reviewed-candidates.jsonl"),
  "--summary", path.join(siteDir, "final-reviewed-summary.json"),
]);

run("cluster-recommendations.mjs", [
  "--input", path.join(siteDir, "final-reviewed-candidates.jsonl"),
  "--out-dir", siteDir,
]);

const recommendationRows = readJsonl(path.join(siteDir, "serp-review-recommendation-keywords.jsonl"));
assert(recommendationRows.length === 6, `expected 6 recommendation rows, got ${recommendationRows.length}`);
assert(new Set(recommendationRows.map((row) => row.keyword.toLowerCase())).size === recommendationRows.length, "recommendation JSONL has duplicate keywords");
assertRequiredRecommendationFields(recommendationRows);
const hydratedKnowledgeBase = recommendationRows.find((row) => row.keyword === "knowledge base software");
assert(hydratedKnowledgeBase?.volume === 2240000, "cluster step should rehydrate volume from unique-keywords.jsonl");
assert(hydratedKnowledgeBase?.cpc === 41.5, "cluster step should rehydrate cpc from unique-keywords.jsonl");

const clusterJson = readJson(path.join(siteDir, "serp-review-recommendation-clusters.json"));
assert(clusterJson.summary.recommendedKeywords === 6, "cluster summary keyword count mismatch");
assert(clusterJson.summary.byPriority.P0.keywords >= 1, "fixture should produce at least one P0 keyword");
assert(clusterJson.summary.byPriority.P1.keywords >= 1, "fixture should produce at least one P1 keyword");
assert(clusterJson.summary.byPriority.P2.keywords >= 1, "fixture should produce at least one P2 keyword");

fs.copyFileSync(path.join(fixturesDir, "sample-raw-reddit.jsonl"), path.join(siteDir, "raw-rows.jsonl"));
fs.writeFileSync(path.join(siteDir, "scrape-summary.json"), JSON.stringify({
  domain: "reddit.com",
  status: "completed",
  pagesFetched: 1,
  rawRows: countJsonl(path.join(siteDir, "raw-rows.jsonl")),
  stopReason: "fixture",
}, null, 2) + "\n");

run("build-run-index.mjs", ["--run-dir", tmpRoot]);
const runIndex = readJson(path.join(tmpRoot, "run-index.json"));
assert(runIndex.sites.length === 1, "run index should contain one site");
assert(runIndex.sites[0].p0Keywords >= 1, "run index should count P0 keywords");

console.log(JSON.stringify({
  status: "ok",
  tmpRoot,
  uniqueKeywords: uniqueRows.length,
  recommendationRows: recommendationRows.length,
  priorities: clusterJson.summary.byPriority,
}, null, 2));
