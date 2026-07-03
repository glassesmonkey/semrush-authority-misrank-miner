import fs from "node:fs";
import path from "node:path";

const DEFAULT_FILTER = {
  search: "",
  volume: "10000-",
  positions: "-5",
  positionsType: "all",
  serpFeatures: null,
  intent: ["informational", "commercial", "transactional"],
  kd: "0-40",
  advanced: {},
};

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

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(minMs, maxMs) {
  const min = Math.min(minMs, maxMs);
  const max = Math.max(minMs, maxMs);
  return Math.floor(min + Math.random() * (max - min + 1));
}

function parseNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const text = String(value).replace(/,/g, "").trim();
  const match = text.match(/^(-?\d+(?:\.\d+)?)([kmb])?$/i);
  if (!match) {
    const number = Number(text);
    return Number.isFinite(number) ? number : 0;
  }
  const base = Number(match[1]);
  const suffix = (match[2] || "").toLowerCase();
  const multiplier = suffix === "k" ? 1e3 : suffix === "m" ? 1e6 : suffix === "b" ? 1e9 : 1;
  return base * multiplier;
}

function safeUrlForLog(urlText) {
  try {
    const url = new URL(urlText);
    for (const key of [...url.searchParams.keys()]) {
      if (/key|token|auth|cookie|session|secret|api/i.test(key)) {
        url.searchParams.set(key, "[redacted]");
      }
    }
    return url.toString();
  } catch {
    return String(urlText || "").replace(/([?&](?:key|token|auth|cookie|session|secret|api)[^=]*=)[^&]+/gi, "$1[redacted]");
  }
}

function normalizeCdpBase(input) {
  const raw = String(input || "http://127.0.0.1:9222").trim().replace(/\/$/, "");
  if (raw.startsWith("ws://")) return raw.replace(/^ws:\/\//, "http://").replace(/\/devtools\/.*/, "");
  if (raw.startsWith("wss://")) return raw.replace(/^wss:\/\//, "https://").replace(/\/devtools\/.*/, "");
  return raw;
}

function domainSlug(domain) {
  return String(domain).trim().replace(/[^a-z0-9.-]+/gi, "_") || "domain";
}

function buildDefaultUrl(domain, args) {
  const url = new URL("https://sem.3ue.co/analytics/organic/positions/");
  url.searchParams.set("sortField", "traffic");
  url.searchParams.set("filter", JSON.stringify(DEFAULT_FILTER));
  url.searchParams.set("db", args.db || "us");
  url.searchParams.set("q", domain);
  url.searchParams.set("searchType", "domain");
  if (args.date) url.searchParams.set("date", args.date);
  return url.toString();
}

function inheritUrl(inputUrl, domain, args) {
  const url = inputUrl ? new URL(inputUrl) : new URL(buildDefaultUrl(domain, args));
  if (!url.searchParams.has("filter")) {
    url.searchParams.set("filter", JSON.stringify(DEFAULT_FILTER));
  }
  if (!url.searchParams.has("sortField")) url.searchParams.set("sortField", "traffic");
  url.searchParams.set("q", domain);
  url.searchParams.set("searchType", "domain");
  if (args.db) url.searchParams.set("db", args.db);
  if (!url.searchParams.has("db")) url.searchParams.set("db", "us");
  if (args.date) url.searchParams.set("date", args.date);
  return url.toString();
}

async function fetchJson(url, options = {}) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    throw new Error(`Could not reach Chrome CDP at ${url}. Start Chrome with --remote-debugging-port=9222. ${error.message}`);
  }
  if (!response.ok) {
    throw new Error(`Chrome CDP request failed: ${response.status} ${response.statusText} ${url}`);
  }
  return response.json();
}

async function openChromeTab(cdpBase, targetUrl) {
  const encoded = encodeURIComponent(targetUrl);
  const endpoint = `${cdpBase}/json/new?${encoded}`;
  let response = await fetch(endpoint, { method: "PUT" }).catch(() => null);
  if (!response || !response.ok) {
    response = await fetch(endpoint).catch(() => null);
  }
  if (!response || !response.ok) {
    throw new Error(`Could not open a Chrome CDP tab. Open ${targetUrl} manually in the 9222 browser and rerun.`);
  }
  return response.json();
}

async function findOrOpenTab(cdpBase, targetUrl, domain, forceNew) {
  const targets = await fetchJson(`${cdpBase}/json/list`);
  const organicTargets = targets
    .filter((target) => target.type === "page" && target.webSocketDebuggerUrl)
    .filter((target) => String(target.url || "").includes("/analytics/organic/positions"));

  if (!forceNew) {
    const exact = organicTargets.find((target) => String(target.url || "").includes(`q=${encodeURIComponent(domain)}`) || String(target.url || "").includes(`q=${domain}`));
    if (exact) return { target: exact, opened: false };
    if (organicTargets[0]) return { target: organicTargets[0], opened: false };
  }

  const target = await openChromeTab(cdpBase, targetUrl);
  return { target, opened: true };
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.nextId = 1;
    this.pending = new Map();
    this.handlers = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out connecting to ${this.wsUrl}`)), 15000);
      this.ws.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      this.ws.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error(`WebSocket error connecting to ${this.wsUrl}`));
      }, { once: true });
    });

    this.ws.addEventListener("message", (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message || JSON.stringify(message.error)));
        else resolve(message.result || {});
        return;
      }
      if (message.method && this.handlers.has(message.method)) {
        for (const handler of this.handlers.get(message.method)) {
          handler(message.params || {});
        }
      }
    });
  }

  on(method, handler) {
    if (!this.handlers.has(method)) this.handlers.set(method, new Set());
    this.handlers.get(method).add(handler);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, 30000);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      this.ws.send(payload);
    });
  }

  close() {
    try {
      this.ws?.close();
    } catch {
      // Ignore close errors.
    }
  }
}

function containsOrganicPositions(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.includes("organic.Positions");
  if (typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => containsOrganicPositions(item));
  return Object.values(value).some((item) => containsOrganicPositions(item));
}

function parseRpcBody(postData) {
  if (!postData || !postData.includes("organic.Positions")) return null;
  try {
    const parsed = JSON.parse(postData);
    return containsOrganicPositions(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function safeHeaderSubset(headers = {}) {
  const safe = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (/cookie|authorization|token|secret|api[-_]?key|csrf|session/.test(lower)) continue;
    if (["accept", "content-type", "x-requested-with"].includes(lower) || lower.startsWith("x-semrush-") || lower.startsWith("x-frontend-")) {
      safe[key] = value;
    }
  }
  if (!Object.keys(safe).some((key) => key.toLowerCase() === "content-type")) {
    safe["content-type"] = "application/json";
  }
  return safe;
}

function findRpcObject(payload) {
  if (!payload || typeof payload !== "object") return null;
  if (!Array.isArray(payload) && containsOrganicPositions(payload.method || payload.action || payload.operationName || payload.rpcMethod)) return payload;
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = findRpcObject(item);
      if (found) return found;
    }
    return null;
  }
  for (const value of Object.values(payload)) {
    const found = findRpcObject(value);
    if (found) return found;
  }
  return null;
}

function cloneWithPagination(template, pageIndex, pageSize) {
  const payload = JSON.parse(JSON.stringify(template));
  const offset = pageIndex * pageSize;
  let touchedPagination = false;
  let touchedRequestId = false;

  function walk(value, parentKey = "") {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((item) => walk(item, parentKey));
      return;
    }
    for (const [key, current] of Object.entries(value)) {
      const lower = key.toLowerCase();
      if (lower === "request_id" || lower === "requestid" || lower === "requestid") {
        value[key] = crypto.randomUUID();
        touchedRequestId = true;
        continue;
      }
      if (lower === "id" && parentKey && /(request|rpc|query)/i.test(parentKey) && typeof current === "string") {
        value[key] = crypto.randomUUID();
        touchedRequestId = true;
        continue;
      }
      if (["offset", "display_offset", "displayoffset", "from", "start"].includes(lower) && (typeof current === "number" || /^\d+$/.test(String(current)))) {
        value[key] = typeof current === "string" ? String(offset) : offset;
        touchedPagination = true;
        continue;
      }
      if (["limit", "display_limit", "displaylimit", "pagesize", "page_size", "perpage", "per_page", "size"].includes(lower) && (typeof current === "number" || /^\d+$/.test(String(current)))) {
        value[key] = typeof current === "string" ? String(pageSize) : pageSize;
        touchedPagination = true;
        continue;
      }
      if (["page", "pagenum", "pagenumber", "page_number"].includes(lower) && (typeof current === "number" || /^\d+$/.test(String(current)))) {
        value[key] = typeof current === "string" ? String(pageIndex + 1) : pageIndex + 1;
        touchedPagination = true;
        continue;
      }
      walk(current, key);
    }
  }

  walk(payload, "root");

  const rpcObject = findRpcObject(payload);
  const paginationTarget = rpcObject?.params && typeof rpcObject.params === "object" ? rpcObject.params : rpcObject;
  if (paginationTarget && typeof paginationTarget === "object" && !Array.isArray(paginationTarget)) {
    if (!touchedPagination) {
      paginationTarget.display_offset = offset;
      paginationTarget.display_limit = pageSize;
      paginationTarget.offset = offset;
      paginationTarget.limit = pageSize;
    }
    if (!touchedRequestId) {
      paginationTarget.request_id = crypto.randomUUID();
    }
  }

  return payload;
}

async function evaluateFetch(cdp, endpoint, headers, body) {
  const expression = `
    (async () => {
      const response = await fetch(${JSON.stringify(endpoint)}, {
        method: "POST",
        credentials: "include",
        headers: ${JSON.stringify(headers)},
        body: JSON.stringify(${JSON.stringify(body)})
      });
      const text = await response.text();
      return { ok: response.ok, status: response.status, statusText: response.statusText, url: response.url, text };
    })()
  `;
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    timeout: 60000,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || "Runtime.evaluate failed");
  }
  return result.result?.value;
}

function rowScore(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return 0;
  const keys = new Set(Object.keys(row).map((key) => key.toLowerCase()));
  let score = 0;
  if (["keyword", "phrase", "kw", "query", "ph", "term"].some((key) => keys.has(key))) score += 5;
  if (["position", "pos", "po", "rank"].some((key) => keys.has(key))) score += 2;
  if (["volume", "search_volume", "searchvolume", "nq"].some((key) => keys.has(key))) score += 2;
  if (["kd", "keyword_difficulty", "keyworddifficulty"].some((key) => keys.has(key))) score += 1;
  if (["cpc", "cp"].some((key) => keys.has(key))) score += 1;
  return score;
}

function findRowArrays(value, pathParts = [], out = []) {
  if (!value || typeof value !== "object") return out;
  if (Array.isArray(value)) {
    const sample = value.filter((item) => item && typeof item === "object" && !Array.isArray(item)).slice(0, 10);
    const score = sample.reduce((sum, item) => sum + rowScore(item), 0);
    if (sample.length && score >= Math.max(5, sample.length * 3)) {
      out.push({ path: pathParts.join("."), rows: value, score, length: value.length });
    }
    value.forEach((item, index) => findRowArrays(item, pathParts.concat(String(index)), out));
    return out;
  }
  for (const [key, item] of Object.entries(value)) {
    findRowArrays(item, pathParts.concat(key), out);
  }
  return out;
}

function firstValue(row, names) {
  const lowerMap = new Map(Object.keys(row).map((key) => [key.toLowerCase(), key]));
  for (const name of names) {
    const key = lowerMap.get(name.toLowerCase());
    if (key !== undefined && row[key] !== undefined && row[key] !== null && row[key] !== "") return row[key];
  }
  return undefined;
}

function normalizeRow(row, pageNumber, rowIndex) {
  const keyword = String(firstValue(row, ["keyword", "phrase", "kw", "query", "ph", "term", "searchTerm"]) || "").trim();
  if (!keyword) return null;
  return {
    keyword,
    page: pageNumber,
    rowIndex,
    position: parseNumber(firstValue(row, ["position", "pos", "po", "rank", "current_position"])),
    volume: parseNumber(firstValue(row, ["volume", "search_volume", "searchVolume", "nq"])),
    traffic: parseNumber(firstValue(row, ["traffic", "tr", "traffic_percent", "trafficPercent"])),
    kd: parseNumber(firstValue(row, ["kd", "keyword_difficulty", "keywordDifficulty", "difficulty"])),
    cpc: parseNumber(firstValue(row, ["cpc", "cp"])),
    intents: firstValue(row, ["intents", "intent", "in", "intentions"]) || undefined,
    url: firstValue(row, ["url", "landingPage", "landing_page", "target_url", "ranking_url", "lu", "url_to"]) || undefined,
    rawSource: "semrush-rpc",
  };
}

function extractRows(json, pageNumber) {
  const arrays = findRowArrays(json)
    .filter((candidate) => candidate.rows.length > 0)
    .sort((a, b) => b.score - a.score || b.length - a.length);
  if (!arrays.length) return { rows: [], arrayPath: null, candidateArrays: [] };

  const best = arrays[0];
  const rows = best.rows
    .map((row, index) => normalizeRow(row, pageNumber, index + 1))
    .filter(Boolean);
  return {
    rows,
    arrayPath: best.path,
    candidateArrays: arrays.slice(0, 5).map((item) => ({ path: item.path, length: item.length, score: item.score })),
  };
}

function responseLooksBlocked(status, text) {
  if ([401, 403, 407, 429].includes(Number(status))) return true;
  if (Number(status) >= 400) return /captcha|verify you are human|sign in|log in|login|forbidden|unauthorized/i.test(String(text || "").slice(0, 2000));
  const prefix = String(text || "").slice(0, 2000).trim();
  if (prefix.startsWith("<")) {
    return /captcha|verify you are human|sign in|log in|login|forbidden|unauthorized/i.test(prefix);
  }
  if (/"error"\s*:\s*[{"]/.test(prefix)) {
    return /captcha|verify you are human|sign in|log in|login|forbidden|unauthorized/i.test(prefix);
  }
  return false;
}

function pageSignature(rows) {
  return rows.map((row) => row.keyword.toLowerCase()).join("\n");
}

async function waitForTemplate(getTemplate, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const template = getTemplate();
    if (template) return template;
    await sleep(250);
  }
  return null;
}

function writeJsonl(filePath, rows) {
  fs.writeFileSync(filePath, rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""));
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

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.domain || !args["out-dir"]) {
    console.error("Usage: node cdp-scrape-semrush.mjs --domain reddit.com --out-dir run/reddit.com [--url 'https://sem.3ue.co/...'] [--cdp http://127.0.0.1:9222] [--page-size 100] [--max-pages 10000] [--min-delay-ms 1200] [--max-delay-ms 4800]");
    process.exit(1);
  }

  const domain = String(args.domain).trim();
  const cdpBase = normalizeCdpBase(args.cdp || "http://127.0.0.1:9222");
  const outDir = path.resolve(args["out-dir"] || domainSlug(domain));
  const pageSize = Number(args["page-size"] || 100);
  const maxPages = Number(args["max-pages"] || 10000);
  const startPage = Number(args["start-page"] || 1);
  const append = Boolean(args.append || startPage > 1);
  const minDelayMs = Number(args["min-delay-ms"] || 1200);
  const maxDelayMs = Number(args["max-delay-ms"] || 4800);
  const targetUrl = inheritUrl(args.url, domain, args);
  const startedAt = nowIso();
  const rawRowsPath = path.join(outDir, "raw-rows.jsonl");
  const summaryPath = path.join(outDir, "scrape-summary.json");
  const diagnosticsPath = path.join(outDir, "scrape-diagnostics.json");
  const previousSummaryForAppend = append ? readJson(summaryPath, {}) : {};
  const summary = {
    domain,
    status: "running",
    startedAt,
    completedAt: null,
    cdpBase,
    targetUrl: safeUrlForLog(targetUrl),
    pageSize,
    maxPages,
    startPage,
    append,
    minDelayMs,
    maxDelayMs,
    pagesFetched: 0,
    rawRows: 0,
    stopReason: null,
    error: null,
    arrayPath: null,
    output: { rawRowsPath, summaryPath },
  };

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + "\n");

  let cdp;
  try {
    const { target } = await findOrOpenTab(cdpBase, targetUrl, domain, Boolean(args["open-new"]));
    cdp = new CdpClient(target.webSocketDebuggerUrl);
    await cdp.connect();

    let rpcTemplate = null;
    cdp.on("Network.requestWillBeSent", async (params) => {
      const request = params.request || {};
      if (request.method !== "POST") return;
      const requestUrl = String(request.url || "");
      const initialPostData = String(request.postData || "");
      if (!requestUrl.includes("/dpa/rpc") && !initialPostData.includes("organic.Positions")) return;

      let postData = initialPostData;
      if (!postData && params.requestId) {
        try {
          const postDataResult = await cdp.send("Network.getRequestPostData", { requestId: params.requestId });
          postData = String(postDataResult.postData || "");
        } catch {
          postData = "";
        }
      }

      const body = parseRpcBody(postData);
      if (!body) return;
      rpcTemplate = {
        endpoint: request.url,
        headers: safeHeaderSubset(request.headers || {}),
        body,
      };
    });

    await cdp.send("Network.enable", { maxPostDataSize: 10_000_000 });
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Page.navigate", { url: targetUrl });

    const template = await waitForTemplate(() => rpcTemplate, Number(args["template-timeout-ms"] || 45000));
    if (!template) {
      summary.status = "failed";
      summary.stopReason = "rpc_template_not_found";
      summary.error = "Could not capture the SEMrush organic.Positions RPC template. Make sure the Organic Positions table is visible in the logged-in 9222 browser session.";
      fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + "\n");
      process.exitCode = 2;
      return;
    }

    const allRows = append ? readJsonl(rawRowsPath) : [];
    const pageSignatures = new Set();
    const pageStats = Array.isArray(previousSummaryForAppend.pageStats) ? previousSummaryForAppend.pageStats : [];

    if (append && allRows.length) {
      const rowsByPage = new Map();
      for (const row of allRows) {
        const page = Number(row.page || 0);
        if (!page) continue;
        if (!rowsByPage.has(page)) rowsByPage.set(page, []);
        rowsByPage.get(page).push(row);
      }
      for (const rows of rowsByPage.values()) {
        pageSignatures.add(pageSignature(rows));
      }
      summary.pagesFetched = rowsByPage.size;
      summary.rawRows = allRows.length;
    }

    for (let pageIndex = startPage - 1; pageIndex < maxPages; pageIndex += 1) {
      const pageNumber = pageIndex + 1;
      const body = cloneWithPagination(template.body, pageIndex, pageSize);
      const response = await evaluateFetch(cdp, template.endpoint, template.headers, body);
      if (!response || typeof response.text !== "string") {
        throw new Error("RPC fetch returned no response text.");
      }
      if (responseLooksBlocked(response.status, response.text)) {
        summary.status = "failed";
        summary.stopReason = "blocked_or_logged_out";
        summary.error = `RPC returned status ${response.status}. Fix the logged-in SEMrush browser session, captcha, or permissions, then rerun this domain.`;
        fs.writeFileSync(diagnosticsPath, JSON.stringify({
          status: response.status,
          statusText: response.statusText,
          responseUrl: safeUrlForLog(response.url),
          textPrefix: response.text.slice(0, 500),
        }, null, 2) + "\n");
        break;
      }

      let json;
      try {
        json = JSON.parse(response.text);
      } catch (error) {
        summary.status = "failed";
        summary.stopReason = "non_json_rpc_response";
        summary.error = error.message;
        fs.writeFileSync(diagnosticsPath, JSON.stringify({
          status: response.status,
          statusText: response.statusText,
          responseUrl: safeUrlForLog(response.url),
          textPrefix: response.text.slice(0, 1000),
        }, null, 2) + "\n");
        break;
      }

      const extracted = extractRows(json, pageNumber);
      if (!summary.arrayPath && extracted.arrayPath) summary.arrayPath = extracted.arrayPath;
      if (!extracted.rows.length) {
        summary.stopReason = pageIndex === 0 ? "no_data" : "empty_page";
        pageStats.push({ page: pageNumber, rows: 0, status: "empty", candidateArrays: extracted.candidateArrays });
        break;
      }

      const signature = pageSignature(extracted.rows);
      if (pageSignatures.has(signature)) {
        summary.stopReason = "duplicate_page";
        pageStats.push({ page: pageNumber, rows: extracted.rows.length, status: "duplicate" });
        break;
      }
      pageSignatures.add(signature);

      allRows.push(...extracted.rows);
      summary.pagesFetched = pageNumber;
      summary.rawRows = allRows.length;
      pageStats.push({ page: pageNumber, rows: extracted.rows.length, status: "ok", arrayPath: extracted.arrayPath });
      writeJsonl(rawRowsPath, allRows);
      fs.writeFileSync(summaryPath, JSON.stringify({ ...summary, pageStats }, null, 2) + "\n");
      console.log(JSON.stringify({ domain, page: pageNumber, rows: extracted.rows.length, totalRows: allRows.length }));

      if (extracted.rows.length < pageSize) {
        summary.stopReason = "short_page";
        break;
      }

      const delayMs = randomDelay(minDelayMs, maxDelayMs);
      await sleep(delayMs);
    }

    if (summary.status !== "failed") {
      summary.status = "completed";
      if (!summary.stopReason) summary.stopReason = "max_pages";
    }
    summary.completedAt = nowIso();
    summary.pagesFetched = pageStats.filter((page) => page.status === "ok").length;
    summary.rawRows = allRows.length;
    writeJsonl(rawRowsPath, allRows);
    fs.writeFileSync(summaryPath, JSON.stringify({ ...summary, pageStats }, null, 2) + "\n");
    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    summary.status = "failed";
    summary.completedAt = nowIso();
    summary.stopReason = "exception";
    summary.error = error.message;
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + "\n");
    console.error(error.stack || error.message);
    process.exitCode = 1;
  } finally {
    cdp?.close();
  }
}

main();
