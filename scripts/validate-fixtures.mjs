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
const siteDirV2 = path.join(tmpRoot, "v2.example");
const legacyCatchallDir = path.join(tmpRoot, "legacy-catchall.example");
const hiddenMetricFields = ["volume", "traffic", "kd", "cpc", "position", "pos", "page", "url", "redditUrl", "landingPage", "landing_page"];

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

function assertNoHiddenMetrics(rows, label) {
  for (const row of rows) {
    for (const field of hiddenMetricFields) {
      assert(row[field] === undefined, `${label} should not contain hidden SEMrush field ${field}`);
    }
  }
}

function assertEnum(row, field, allowed) {
  assert(allowed.includes(row[field]), `${row.keyword} invalid ${field}: ${row[field]}`);
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

const markdownReport = fs.readFileSync(path.join(siteDir, "serp-review-recommendations.md"), "utf8");
assert(markdownReport.includes("# SERP 复核推荐词簇"), "markdown report should use Chinese title");
assert(markdownReport.includes("优先级说明"), "markdown report should use Chinese priority explanation");
assert(markdownReport.includes("页面形态"), "markdown report should use Chinese explanatory labels");
assert(!markdownReport.includes("Priority meanings:"), "markdown report should not use English priority heading");

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

fs.mkdirSync(siteDirV2, { recursive: true });
run("prepare-keyword-chunks.mjs", [
  "--input", path.join(fixturesDir, "sample-raw-v2.jsonl"),
  "--out-dir", siteDirV2,
  "--chunk-size", "3",
]);
const v2ScreeningChunk = readJsonl(path.join(siteDirV2, "chunks-3", "chunk-00.jsonl"));
assert(v2ScreeningChunk.every((row) => Object.keys(row).length === 1 && row.keyword), "v2 screening chunks must remain keyword-only");

const v2SubagentRows = readJsonl(path.join(fixturesDir, "sample-final-reviewed-v2.jsonl"));
assertNoHiddenMetrics(v2SubagentRows, "v2 subagent fixture");
for (const row of v2SubagentRows) {
  assert(row.schema_version === 2, `${row.keyword} missing schema_version 2`);
  assertEnum(row, "intent_shape", ["calculator", "converter", "checker", "lookup", "tracker", "generator", "workflow", "planner", "library", "comparison", "data_page", "training", "unknown"]);
  assertEnum(row, "answer_source_model", ["deterministic_logic", "user_input_transform", "stable_public_data", "periodic_public_data", "live_external_data", "licensed_or_proprietary_data", "official_or_marketplace_inventory", "subjective_or_ugc", "unknown"]);
  assertEnum(row, "supply_control", ["strong", "medium", "weak", "unknown"]);
  assert(row.canonical_key_components, `${row.keyword} missing canonical key components`);
}

fs.copyFileSync(path.join(fixturesDir, "sample-final-reviewed-v2.jsonl"), path.join(siteDirV2, "final-reviewed-candidates.jsonl"));
run("cluster-recommendations.mjs", [
  "--input", path.join(siteDirV2, "final-reviewed-candidates.jsonl"),
  "--out-dir", siteDirV2,
]);
const v2Recommendations = readJsonl(path.join(siteDirV2, "serp-review-recommendation-keywords.jsonl"));
assertRequiredRecommendationFields(v2Recommendations);
assert(v2Recommendations.every((row) => row.schema_version === 2), "v2 recommendations should keep schema_version 2");
const hex = v2Recommendations.find((row) => row.keyword === "hex to decimal");
assert(hex?.priority === "P0", "deterministic converter should remain P0 eligible");
assert(hex?.volume === 18100, "v2 final output should rehydrate metrics from metadata");
const printer = v2Recommendations.find((row) => row.keyword === "printer offline");
assert(printer, "route_hint=reject alone should not remove a valid troubleshooting workflow");
assert(printer.derived_route !== "reject", "route_hint=reject alone must not force final reject");
const sportsRows = v2Recommendations.filter((row) => row.canonical_opportunity_key === "lookup/entity_pair/event_player_stats/sortable_data_page");
assert(sportsRows.length === 2, "entity-pair sports permutations should collapse under one canonical key");
assert(sportsRows.every((row) => row.priority === "P2" && row.derived_cap === "cap_P2"), "weak live sports data permutations must be capped to P2");
assert(!sportsRows[0].canonical_opportunity_key.includes("live_external_data"), "canonical key must exclude answer source risk fields");
assert(!sportsRows[0].canonical_opportunity_key.includes("weak"), "canonical key must exclude supply fields");
const flight = v2Recommendations.find((row) => row.keyword === "ua123 flight status");
assert(flight?.priority === "P2", "official-source flight status should not become P0");
const mystery = v2Recommendations.find((row) => row.keyword === "mystery live price checker");
assert(mystery?.priority === "P2" && mystery.derived_cap === "cap_P2", "unknown critical fields cannot support P0");
assert(v2Recommendations.every((row) => !(row.priority === "P0" && row.answer_source_model === "live_external_data" && ["weak", "unknown"].includes(row.supply_control))), "weak live/external supply cannot become P0");
assert(v2Recommendations.every((row) => !(row.priority === "P0" && row.permutation_inflation === "high" && ["weak", "unknown"].includes(row.supply_control))), "high permutation weak supply cannot become P0");
assert(v2Recommendations.every((row) => row.priority !== "P0" || row.derived_cap === "none"), "rehydrated metrics must not promote capped rows above their cap");
const opportunityClusters = readJson(path.join(siteDirV2, "opportunity-clusters.json"));
assert(opportunityClusters.summary.recommendedKeywords === v2Recommendations.length, "opportunity cluster summary should match v2 keyword output");

fs.mkdirSync(legacyCatchallDir, { recursive: true });
fs.writeFileSync(path.join(legacyCatchallDir, "unique-keywords.jsonl"), "{\"keyword\":\"bespoke odd output task\",\"volume\":50000,\"kd\":20,\"cpc\":5,\"page\":1}\n");
fs.writeFileSync(path.join(legacyCatchallDir, "final-reviewed-candidates.jsonl"), "{\"keyword\":\"bespoke odd output task\",\"reason\":\"Legacy row with no narrow regex cluster.\",\"recommended_shape\":\"odd output workflow\"}\n");
run("cluster-recommendations.mjs", [
  "--input", path.join(legacyCatchallDir, "final-reviewed-candidates.jsonl"),
  "--out-dir", legacyCatchallDir,
]);
const legacyCatchallRows = readJsonl(path.join(legacyCatchallDir, "serp-review-recommendation-keywords.jsonl"));
assert(legacyCatchallRows[0]?.priority === "P2", "legacy catch-all must not default to P1");

console.log(JSON.stringify({
  status: "ok",
  tmpRoot,
  uniqueKeywords: uniqueRows.length,
  recommendationRows: recommendationRows.length,
  v2RecommendationRows: v2Recommendations.length,
  priorities: clusterJson.summary.byPriority,
  v2Priorities: opportunityClusters.summary.byPriority,
}, null, 2));
