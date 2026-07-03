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

function metadataKey(row) {
  return String(row.keyword || "").trim().toLowerCase();
}

function includesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function inferType(definition) {
  const text = `${definition.name} ${definition.pageShape}`.toLowerCase();
  if (/calculator|converter|checker|lookup|estimator|diagnostic|solver|generator|tracker|status|utility|translator|pronunciation/.test(text)) return "A";
  if (/template|planner|checklist|workflow|document|message|letter/.test(text)) return "B";
  if (/playable|simulator|quiz|practice|sound|audio|metronome/.test(text)) return "C";
  if (/training|practice|drill|course|workout|plan/.test(text)) return "D";
  if (/library|visual|creative|gallery|font|palette/.test(text)) return "E";
  if (/selector|comparison|configurator|kit|compatibility|buying|marketplace|saaS|platform/i.test(text)) return "F";
  return "B";
}

const clusterDefinitions = [
  {
    name: "B2B SaaS and platform selectors",
    priority: "P0",
    pageShape: "Requirements-based comparison database and recommendation flow",
    monetization: "SaaS affiliate, lead-gen, sponsored profiles",
    why: "Clear buyer intent, structured public data, and Reddit/forum rankings often indicate users distrust vendor roundups.",
    match: (text) => includesAny(text, [/software|saas|platform|competitor|competitors|alternative|alternatives|crm|data catalog|knowledge base|sales intelligence|digital asset management|autocad|ci tool|continuous integration/i]),
  },
  {
    name: "B2B pricing and alternatives estimators",
    priority: "P0",
    pageShape: "Configurable pricing estimator plus alternatives matrix",
    monetization: "SaaS affiliate, B2B lead-gen, vendor sponsorship",
    why: "Pricing intent is explicit and changes by package, seat, add-on, region, or use case.",
    match: (text) => includesAny(text, [/pricing|price estimate|pricing calculator|pricing estimator/i]) && includesAny(text, [/business|wire|platform|pitchbook|software|saas|vendor|distribution/i]),
  },
  {
    name: "Career salary and certification lead-gen",
    priority: "P0",
    pageShape: "Salary estimator by location, credential, setting, shift, and experience",
    monetization: "Course lead-gen, job leads, ads",
    why: "The result shape is a lookup/estimator, and monetization is stronger than generic informational articles.",
    match: (text) => includesAny(text, [/salary|wages?|pay rate|how much do .* make|how much .* make/i]),
  },
  {
    name: "Auto repair quote estimators",
    priority: "P0",
    pageShape: "Vehicle-aware parts and labor cost estimator",
    monetization: "Repair lead-gen, affiliate, ads",
    why: "Users are validating a quote; vehicle, parts, labor, and region materially change the answer.",
    match: (text) => includesAny(text, [/car |vehicle|brake|transmission|gearbox|oil change|timing|battery|spark plug|wheel|head gasket|catalytic|o2 sensor|cv axle|fuel pump|windshield|serpentine|valve cover|wrap/i]) && includesAny(text, [/cost|replacement|replace|change|price|estimator/i]),
  },
  {
    name: "OBD and warning-light diagnostics",
    priority: "P0",
    pageShape: "Diagnostic lookup with symptom branching, urgency, and repair-cost ranges",
    monetization: "Repair lead-gen, parts affiliate, ads",
    why: "Fault-code and warning-light searches are action-oriented and naturally map to a checker.",
    match: (text) => includesAny(text, [/\bp0[0-9]{3}\b|obd|warning light|service stabilitrak|tire pressure|traction control|abs light|battery light|check engine|car won't start|white smoke|blown head gasket/i]),
  },
  {
    name: "Home and local-service cost estimators",
    priority: "P0",
    pageShape: "Scope-based cost estimator and quote checklist",
    monetization: "Service lead-gen, affiliate, ads",
    why: "The query has cost intent, many variables, and a clear service or quote path.",
    match: (text) => includesAny(text, [/water softener|water heater|septic|storage unit|generator|environmental site assessment|inspection checklist|propane|tattoo cost|bridal gown budget/i]),
  },
  {
    name: "PC, hardware, and equipment configurators",
    priority: "P0",
    pageShape: "Compatibility checker, build configurator, or kit selector",
    monetization: "Affiliate, sponsored listings, ads",
    why: "Users need a compatibility or configuration output, not a generic article.",
    match: (text) => includesAny(text, [/pc build|workstation build|can my pc|run on my computer|psu tier|ups runtime|satellite internet kit|solar generator|podcast equipment|3d printer|ebike/i]),
  },
  {
    name: "Fantasy and sports data tools",
    priority: "P0",
    pageShape: "Data-backed calculator, trade analyzer, or matchup lookup",
    monetization: "Ads, subscription, affiliate",
    why: "The expected result is interactive and recurring.",
    match: (text) => includesAny(text, [/fantasy|trade analyzer|trade calculator|dynasty|batter vs pitcher|playoff predictor/i]),
  },
  {
    name: "Work calendar and pay calculators",
    priority: "P1",
    pageShape: "Calendar/pay calculator with assumptions and variants",
    monetization: "Ads, HR SaaS lead-gen",
    why: "The query is deterministic but assumption-sensitive.",
    match: (text) => includesAny(text, [/working days|working hours|an hour is how much|a year is how much an hour|hourly-to|salary-to-hourly/i]),
  },
  {
    name: "Travel, baggage, and document checkers",
    priority: "P1",
    pageShape: "Rule checker, visual sizer, or checklist calculator",
    monetization: "Affiliate, ads, lead-gen",
    why: "The user has a concrete constraint to satisfy.",
    match: (text) => includesAny(text, [/carry.?on|personal item|tsa|route 66|national parks|passport|identification|document checklist|airport|cruise/i]),
  },
  {
    name: "Device and network troubleshooting workflows",
    priority: "P1",
    pageShape: "Symptom-branching troubleshooter with tests and next actions",
    monetization: "Repair lead-gen, affiliate, ads",
    why: "Diagnostic flows beat scattered forum anecdotes.",
    match: (text) => includesAny(text, [/printer offline|tv to wifi|remote not working|computer.*slow|slow internet|ping|dns|message blocking|apple pencil|bluetooth|do not disturb|carplay|not charging|wifi health|autoplay|share wifi/i]),
  },
  {
    name: "Display and laptop symptom diagnostics",
    priority: "P1",
    pageShape: "Visual symptom checker with model, external-monitor, driver, and repair branches",
    monetization: "Repair lead-gen, affiliate, ads",
    why: "A structured diagnostic workflow can satisfy the task better than forum fragments.",
    match: (text) => includesAny(text, [/screen|display|flicker|backlight|horizontal line|white spot|black line|pink tint|no bootable|no screen|monitor|ipad streak|chromebook glitch|laptop/i]),
  },
  {
    name: "Compatibility and replacement-part lookups",
    priority: "P1",
    pageShape: "Model-aware compatibility lookup or adapter selector",
    monetization: "Affiliate, ads",
    why: "The user needs a correct fit/output.",
    match: (text) => includesAny(text, [/displayport|hdmi|usb|adapter|cable|filter|battery equivalent|battery lookup|key fob|license plate|replacement ring|compatible|compatibility|towing capacity|tire size|vin decoder|thermostat wiring|cookware|tank mate/i]),
  },
  {
    name: "Templates, planners, and life-admin generators",
    priority: "P1",
    pageShape: "Planner, checklist generator, or document/template builder",
    monetization: "Templates, ads, affiliate",
    why: "Users want a finished artifact or plan.",
    match: (text) => includesAny(text, [/wedding|budget|letter|message|email|resume|template|checklist|chore|grocery|planner|outline|interview|cheque|check-filling|out of office|thank you/i]),
  },
  {
    name: "Education, math, and chemistry solvers",
    priority: "P1",
    pageShape: "Step-by-step calculator, formula builder, or practice mode",
    monetization: "Ads, courses, tutoring lead-gen",
    why: "The expected output is computed or guided.",
    match: (text) => includesAny(text, [/asymptote|intercept|chemical|surface area|percent difference|solve|fraction|integral|derivative|moles|lewis|square root|weighted grade|excel|xlookup|formula|equation|conjugation/i]),
  },
  {
    name: "Music practice and instrument tools",
    priority: "P1",
    pageShape: "Interactive tuner, chord lookup, fingering trainer, or practice plan",
    monetization: "Ads, courses, affiliate",
    why: "Audio, diagrams, and practice loops beat static articles.",
    match: (text) => includesAny(text, [/guitar|chord|ukulele|tuner|tuning|circle of fifths|piano|scale|finger speed|dexterity/i]),
  },
  {
    name: "Training plans and interactive practice",
    priority: "P1",
    pageShape: "Personalized plan, drill tool, or simulator",
    monetization: "Ads, course, affiliate",
    why: "Users need something followable or interactive.",
    match: (text) => includesAny(text, [/marathon|couch to 5k|training plan|practice|trainer|drill|parallel park|teas|tape measure|enneagram|typing trainer|keyboard practice/i]),
  },
  {
    name: "Food and kitchen calculators",
    priority: "P1",
    pageShape: "Time, ratio, serving, substitution, and ingredient-density calculators",
    monetization: "Ads, affiliate",
    why: "The answer changes with ingredients, quantities, equipment, and preference.",
    match: (text) => includesAny(text, [/egg|boil|cook|ribs|turkey|rice|coffee|steak|substitute|cornstarch|keg|cup|grams|spoon|butter|garlic|tbsp|tsp|calorie|recipe|caffeine/i]),
  },
  {
    name: "Creative generators and visual libraries",
    priority: "P1",
    pageShape: "Filterable library, previewer, generator, or visualizer",
    monetization: "Ads, affiliate, templates",
    why: "Supply can be scaled with CC0/commercial assets, generated previews, and structured filters.",
    match: (text) => includesAny(text, [/drawing reference|palette|stain color|font|gradient|flag|cursive|fantasy name|surname|elf name|sewing pattern|3d printer files|banner size|text color|visualizer|generator/i]),
  },
  {
    name: "File, media, and image utilities",
    priority: "P1",
    pageShape: "Browser tool with upload, preview, conversion, and export",
    monetization: "Ads, paid batch processing, affiliate",
    why: "The result is a transformed file or image.",
    match: (text) => includesAny(text, [/heic|jpg|mkv|mp4|wav|ogg|pdf|epub|screenshot|grainy|overexposed|pixelated|reverse video/i]),
  },
  {
    name: "Marketplace and resale decision tools",
    priority: "P1",
    pageShape: "Value lookup, payout calculator, or marketplace selector",
    monetization: "Affiliate, lead-gen, ads",
    why: "The user wants to choose where to sell or estimate value.",
    match: (text) => includesAny(text, [/sell|shipping calculator|card value|coin value|penny|grading|copper price|marketplace|gift card/i]),
  },
  {
    name: "Consumer buying and comparison selectors",
    priority: "P1",
    pageShape: "Comparison matrix, weighted selector, or fit checker",
    monetization: "Affiliate, ads",
    why: "The searcher is deciding between options.",
    match: (text) => includesAny(text, [/\bvs\b|comparison|compare|king|iphone|android|pellet grill|snorkel|kamado|impact driver|drill|snowboard|what to wear|map of|equipment|selector/i]),
  },
  {
    name: "Simple but scalable converters",
    priority: "P2",
    pageShape: "Fast calculator/converter pages with batch and context variants",
    monetization: "Ads",
    why: "The intent is clear, but SERPs are often saturated.",
    match: (text) => includesAny(text, [/to miles|to feet|to lbs|to pounds|to mph|to f|fahrenheit|celsius|yard|meter|metre|kg|oz|inches|temperature|joule|kilowatt|horsepower|hours to minutes|converter|conversion/i]),
  },
  {
    name: "Symbols, timestamps, word finders, and tiny utilities",
    priority: "P2",
    pageShape: "Copy tool, generator, lookup, or picker",
    monetization: "Ads",
    why: "These are valid non-content utilities but lower commercial value and often crowded.",
    match: (text) => includesAny(text, [/symbol|timestamp|discord time|accent|word.*j|pick a number|roll d20|20 questions|controller test|printer test|stamps|shoe size|scam text|face identification|saturn return|dishwasher safe/i]),
  },
  {
    name: "Translation, transliteration, and pronunciation tools",
    priority: "P2",
    pageShape: "Input-output translator, transliterator, or audio pronunciation trainer",
    monetization: "Ads, language courses",
    why: "Intent is tool-shaped, but generic translator SERPs can be strong.",
    match: (text) => includesAny(text, [/translator|translation|translate|traduction|traduire|kreyol|créole|creole|korean|somali|bosnian|tamil|pronounce|pronunciation|language is this|old english|saxon/i]),
  },
  {
    name: "Real-time trackers and status pages",
    priority: "P2",
    pageShape: "Tracker with historical pattern and freshness indicator",
    monetization: "Ads, affiliate",
    why: "The product shape is clear, but data freshness and source access must be verified.",
    match: (text) => includesAny(text, [/wait times|crowd calendar|down right now|status checker|live reports/i]),
  },
  {
    name: "Other valid SERP-review opportunities",
    priority: "P1",
    pageShape: "Non-pure-content page matching the provided recommended_shape",
    monetization: "Ads, affiliate, lead-gen, templates, or SaaS",
    why: "The candidate passed second-pass review but did not match a narrower built-in cluster.",
    match: () => true,
  },
];

const args = parseArgs(process.argv);
if (!args.input || !args["out-dir"]) {
  console.error("Usage: node cluster-recommendations.mjs --input final-reviewed-candidates.jsonl --out-dir site-dir [--metadata unique-keywords.jsonl]");
  process.exit(1);
}

const inputPath = path.resolve(args.input);
const outDir = path.resolve(args["out-dir"]);
const metadataPath = path.resolve(args.metadata || path.join(outDir, "unique-keywords.jsonl"));
const metadataRows = fs.existsSync(metadataPath) ? readJsonl(metadataPath) : [];
const metadataByKeyword = new Map(metadataRows.filter((row) => metadataKey(row)).map((row) => [metadataKey(row), row]));
const rows = readJsonl(inputPath).filter((row) => String(row.keyword || "").trim());
const seen = new Set();
const deduped = [];

for (const row of rows) {
  const key = metadataKey(row);
  if (seen.has(key)) continue;
  seen.add(key);
  deduped.push({ ...row, keyword: String(row.keyword).trim() });
}

const clusterMap = new Map();
const keywordRows = [];

for (const row of deduped) {
  const text = `${row.keyword} ${row.type || ""} ${row.reason || ""} ${row.recommended_shape || ""}`.toLowerCase();
  const definition = clusterDefinitions.find((cluster) => cluster.match(text));
  if (!clusterMap.has(definition.name)) {
    clusterMap.set(definition.name, {
      priority: definition.priority,
      name: definition.name,
      pageShape: definition.pageShape,
      monetization: definition.monetization,
      why: definition.why,
      keywordRows: [],
    });
  }

  const outputRow = {
    priority: definition.priority,
    cluster: definition.name,
    keyword: row.keyword,
    type: row.type || inferType(definition),
    volume: Number(row.volume || metadataByKeyword.get(metadataKey(row))?.volume || 0),
    kd: Number(row.kd || metadataByKeyword.get(metadataKey(row))?.kd || 0),
    cpc: Number(row.cpc || metadataByKeyword.get(metadataKey(row))?.cpc || 0),
    page: Number(row.page || metadataByKeyword.get(metadataKey(row))?.page || 0),
    recommended_shape: row.recommended_shape || definition.pageShape,
    monetization: row.monetization || definition.monetization,
    risk: row.risk || "medium",
    reason: row.reason || definition.why,
  };
  clusterMap.get(definition.name).keywordRows.push(outputRow);
  keywordRows.push(outputRow);
}

const priorityOrder = { P0: 0, P1: 1, P2: 2 };
const clusters = [...clusterMap.values()].map((cluster) => {
  cluster.keywordRows.sort((a, b) => Number(b.cpc || 0) - Number(a.cpc || 0) || Number(b.volume || 0) - Number(a.volume || 0));
  return {
    ...cluster,
    totalVolume: cluster.keywordRows.reduce((sum, row) => sum + Number(row.volume || 0), 0),
    maxCpc: cluster.keywordRows.reduce((max, row) => Math.max(max, Number(row.cpc || 0)), 0),
    minKd: cluster.keywordRows.reduce((min, row) => Math.min(min, Number(row.kd || 0)), Infinity),
  };
}).sort((a, b) => {
  const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
  if (priorityDiff) return priorityDiff;
  return b.maxCpc - a.maxCpc || b.totalVolume - a.totalVolume || a.name.localeCompare(b.name);
});

keywordRows.sort((a, b) => {
  const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
  if (priorityDiff) return priorityDiff;
  return Number(b.cpc || 0) - Number(a.cpc || 0) || Number(b.volume || 0) - Number(a.volume || 0);
});

const summary = {
  sourceCandidates: rows.length,
  recommendedClusters: clusters.length,
  recommendedKeywords: keywordRows.length,
  byPriority: Object.fromEntries(
    ["P0", "P1", "P2"].map((priority) => [
      priority,
      {
        clusters: clusters.filter((cluster) => cluster.priority === priority).length,
        keywords: keywordRows.filter((row) => row.priority === priority).length,
      },
    ]),
  ),
};

fs.mkdirSync(outDir, { recursive: true });

const jsonPath = path.join(outDir, "serp-review-recommendation-clusters.json");
const jsonlPath = path.join(outDir, "serp-review-recommendation-keywords.jsonl");
const mdPath = path.join(outDir, "serp-review-recommendations.md");

fs.writeFileSync(jsonPath, JSON.stringify({ summary, clusters }, null, 2) + "\n");
fs.writeFileSync(jsonlPath, keywordRows.map((row) => JSON.stringify(row)).join("\n") + (keywordRows.length ? "\n" : ""));

const md = [];
md.push("# SERP Review Recommendation Clusters");
md.push("");
md.push(`Source second-pass candidates: ${summary.sourceCandidates}`);
md.push(`Recommended clusters: ${summary.recommendedClusters}`);
md.push(`Recommended keyword entries: ${summary.recommendedKeywords}`);
md.push("");
md.push("| Priority | Clusters | Keyword entries |");
md.push("| --- | ---: | ---: |");
for (const priority of ["P0", "P1", "P2"]) {
  md.push(`| ${priority} | ${summary.byPriority[priority].clusters} | ${summary.byPriority[priority].keywords} |`);
}
md.push("");
md.push("Priority meanings:");
md.push("- P0: verify first; strong non-content shape and monetization.");
md.push("- P1: verify after P0 or when the SERP looks weak; still a valid opportunity.");
md.push("- P2: keep as lower-priority long-tail or cluster-expansion checks, not rejected.");
md.push("");

for (const cluster of clusters) {
  md.push(`## ${cluster.priority} - ${cluster.name}`);
  md.push("");
  md.push(`- Page shape: ${cluster.pageShape}`);
  md.push(`- Monetization: ${cluster.monetization}`);
  md.push(`- Why: ${cluster.why}`);
  md.push(`- Keyword entries: ${cluster.keywordRows.length}; total volume: ${cluster.totalVolume}; max CPC: ${cluster.maxCpc}`);
  md.push("");
  md.push("| Keyword | Vol | KD | CPC | Shape |");
  md.push("| --- | ---: | ---: | ---: | --- |");
  for (const row of cluster.keywordRows) {
    md.push(`| ${row.keyword} | ${row.volume} | ${row.kd} | ${row.cpc} | ${String(row.recommended_shape).replaceAll("|", "/")} |`);
  }
  md.push("");
}

fs.writeFileSync(mdPath, md.join("\n"));

console.log(JSON.stringify({ summary, jsonPath, jsonlPath, mdPath }, null, 2));
