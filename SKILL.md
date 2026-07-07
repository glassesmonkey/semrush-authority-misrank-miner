---
name: semrush-authority-misrank-miner
description: Mine high-authority misrank keyword opportunities from SEMrush Organic Positions for domains and subdomains like reddit.com, youtube.com, facebook.com, wikipedia.org, fandom.com, spotify.com, or gamefaqs.gamespot.com. Use this skill whenever the user mentions 高权重站误排挖词法, SEMrush 反查大站关键词, Reddit/Facebook/YouTube/Wiki/Fandom/Spotify keyword mining, provides an authority domain or subdomain to mine, or asks to find non-pure-content site opportunities from authority domains. It connects to the user's logged-in Chrome CDP 9222 session, opens a dedicated login browser if CDP is unavailable, scrapes one target at a time with random delay, chunks keywords for subagent screening, and outputs per-target P0/P1/P2 SERP-review clusters.
---

# SEMrush Authority Misrank Miner

Use this skill to run the user's "high-authority misrank keyword" workflow:

1. Scrape SEMrush Organic Positions for one or more authority domains or subdomains.
2. Deduplicate keywords.
3. Split into 500-row keyword-only first-pass chunks.
4. Use subagents for strict non-pure-content opportunity screening.
5. Split first-pass candidates into 100-row keyword-only second-pass chunks.
6. Use subagents for stricter review.
7. Derive canonical opportunity clusters, caps, and P0/P1/P2 SERP-review reports.

This skill does not automatically scrape Google SERPs. It outputs a prioritized SERP-review pool.

## Quality Floor

Do not reduce screening quality to save tokens, time, or agent work. Token spend is acceptable; false confidence and rework are more expensive.

- Use subagents for first-pass and second-pass screening whenever the workflow reaches those stages.
- Do not replace semantic screening with scripts, regex, keyword lists, or local shortcuts because the keyword set is large.
- Use scripts only for deterministic work: scraping, dedupe, chunking, merging, canonical key generation, metric rehydration, priority derivation, validation, and report writing.
- Deterministic scripts may flag or cap risk inferred from keyword patterns, but must not hard-delete a candidate solely from regex or keyword text. Hard deletion belongs to agent judgment, explicit policy/rights violations, invalid rows, or derived no-supply/no-differentiation findings.
- If the run is too large, slow, expensive, or operationally blocked, pause with a clear status and ask for a scope decision instead of silently degrading the method.
- Do not summarize or sample a chunk when the workflow requires full chunk screening. Every chunk must be processed or explicitly marked failed/skipped in the run index.

## Subagent Model Contract

Screening subagents must inherit the current Codex model and reasoning configuration.

- Do not launch first-pass or second-pass workers on a smaller, cheaper, faster, or lower-reasoning model.
- Do not set model or reasoning overrides unless the subagent tool requires explicit pass-through of the exact current model and reasoning values.
- If the available subagent launcher cannot guarantee current-model/current-reasoning inheritance, pause and ask for a tooling or scope decision instead of running degraded workers.

## Default Inputs

Ask for only what is missing:

- Required: target domains or subdomains, such as `reddit.com, facebook.com, youtube.com, gamefaqs.gamespot.com`.
- Optional: a SEMrush Organic Positions URL whose filters should be inherited.
- Optional: date, database, device, delay range, page limit, and subagent concurrency.

Defaults:

- Chrome CDP: `http://127.0.0.1:9222`
- Login browser profile: `$HOME/.codex/semrush-authority-chrome`
- Login browser fallback CDP: `http://127.0.0.1:9333` if `9222` is occupied but not a healthy Chrome DevTools endpoint.
- SEMrush database: `us`
- Search type: auto-detect from the target or SEMrush URL. Use `domain` for root domains such as `reddit.com`; use `subdomain` when the user provides a subdomain such as `gamefaqs.gamespot.com`.
- Device: desktop
- Sort: traffic
- Position: top 5
- Volume: `10000+`
- KD: `0-40`
- Intent: informational, commercial, transactional
- Random page delay: `1200-4800ms`
- First-pass chunk size: `500`
- Second-pass chunk size: `100`
- Report shape: per-domain reports only, no cross-domain merge unless the user asks.
- Report language: Chinese explanatory prose by default.

## Output Contract

Create a run directory in the current workspace:

```text
semrush-authority-runs/YYYYMMDD-HHMMSS/
  run-index.json
  reddit.com/
    raw-rows.jsonl
    unique-keywords.jsonl
    chunks-500/chunk-00.jsonl        # keyword-only rows for model screening
    first-pass-results/chunk-00.jsonl
    first-pass-candidates.jsonl
    final-review-chunks/review-00.jsonl
    final-review-results/review-00.jsonl
    final-reviewed-candidates.jsonl
    serp-review-recommendations.md
    serp-review-recommendation-keywords.jsonl
    serp-review-recommendation-clusters.json
    opportunity-clusters.json
    opportunity-clusters.md
```

Every recommended keyword row must include final derived priority plus audit fields:

```json
{"priority":"P2","priority_source":"derived","priority_hint":"P0","derived_cap":"cap_P2","derived_cap_reason":"live external data with weak supply control","canonical_opportunity_key":"lookup/entity_pair/event_player_stats/sortable_data_page","keyword":"...","type":"A","volume":12345,"kd":12,"cpc":1.23,"recommended_shape":"...","monetization":"...","risk":"medium"}
```

## CDP Login Handoff

Before scraping, verify that the primary CDP endpoint is healthy:

```bash
curl -fsS http://127.0.0.1:9222/json/version >/dev/null
```

If `9222` is refused, times out, returns `404`, or is otherwise not a healthy Chrome DevTools endpoint, do not stop with instructions for the user to start Chrome. Open a dedicated login browser yourself:

```bash
SEM_CDP_PORT=9222
SEM_PROFILE="$HOME/.codex/semrush-authority-chrome"
open -na "Google Chrome" --args \
  --remote-debugging-port="$SEM_CDP_PORT" \
  --user-data-dir="$SEM_PROFILE" \
  --no-first-run \
  --no-default-browser-check \
  'https://sem.3ue.co/analytics/organic/positions/'
```

If `9222` is already occupied by an unhealthy Chrome endpoint, do not kill the user's browser. Use the fallback port and remember to pass it to the scraper:

```bash
SEM_CDP_PORT=9333
SEM_PROFILE="$HOME/.codex/semrush-authority-chrome"
open -na "Google Chrome" --args \
  --remote-debugging-port="$SEM_CDP_PORT" \
  --user-data-dir="$SEM_PROFILE" \
  --no-first-run \
  --no-default-browser-check \
  'https://sem.3ue.co/analytics/organic/positions/'
```

After opening the browser, tell the user exactly what to do and wait:

```text
我已打开 SEMrush 登录浏览器。请在里面登录 SEMrush/sem.3ue.co，并确认 Organic Positions 表能正常显示；完成后回复我继续。
```

Do not scrape, spawn subagents, or fabricate a failed run while waiting for the user's login confirmation. After the user confirms, recheck `/json/version`, then continue scraping with `--cdp http://127.0.0.1:$SEM_CDP_PORT` when a fallback port was used.

## Scrape SEMrush

Use the bundled scraper. It captures the `organic.Positions` RPC request from the page and does not write cookies, API keys, or the captured RPC payload to disk.

Quota discipline:

- Treat every SEMrush Organic Positions page load and RPC fetch as potentially quota-bearing.
- Do not use the scraper itself as a quota probe. If quota may be exhausted, first inspect the existing CDP browser state for dashboard/quota text or ask the user to confirm the Organic Positions table is visible.
- Do not rerun completed domains just to confirm availability. Resume only from the durable `nextNotStarted` target unless a specific domain has a verified incomplete or failed state.
- Do not create temporary target scrapes to test access. A failed probe can still consume account-side quota even if it is later discarded.
- The scraper is expected to reuse the initial browser page-1 RPC response when Chrome exposes the response body; falling back to a manual page-1 fetch is only for cases where CDP cannot provide that initial response.

SEMrush treats root domains and subdomains as different search scopes. If the user gives `gamefaqs.gamespot.com`, keep that exact value as `q` and scrape with `searchType=subdomain`; do not collapse it to `gamespot.com` or leave `searchType=domain`. The scraper auto-detects common subdomain targets, inherits `searchType=subdomain` from a provided SEMrush URL, and also accepts `--search-type subdomain` when you need to be explicit.

```bash
node "$HOME/.codex/skills/semrush-authority-misrank-miner/scripts/cdp-scrape-semrush.mjs" \
  --domain reddit.com \
  --out-dir semrush-authority-runs/20260702-120000/reddit.com
```

For a subdomain target:

```bash
node "$HOME/.codex/skills/semrush-authority-misrank-miner/scripts/cdp-scrape-semrush.mjs" \
  --domain gamefaqs.gamespot.com \
  --search-type subdomain \
  --out-dir semrush-authority-runs/20260702-120000/gamefaqs.gamespot.com
```

If the user provides a SEMrush URL, pass it with `--url`:

```bash
node "$HOME/.codex/skills/semrush-authority-misrank-miner/scripts/cdp-scrape-semrush.mjs" \
  --domain gamefaqs.gamespot.com \
  --url 'https://sem.3ue.co/analytics/organic/positions/?...' \
  --out-dir semrush-authority-runs/20260702-120000/gamefaqs.gamespot.com
```

Scrape domains one at a time. Do not parallelize SEMrush scraping across domains.

If scraping fails:

- CDP connection refused, timeout, or unhealthy discovery endpoint: follow the CDP Login Handoff above, open the browser yourself, and wait for the user to confirm login.
- Login/captcha/403: keep the login browser open, tell the user to fix the browser session, and wait for confirmation before rerunning the failed domain.
- RPC template not found: reload or open the SEMrush Organic Positions page in the login browser, ask the user to confirm that the table is visible, then rerun.
- RPC schema changed: save the diagnostic summary without secrets and stop that domain.

## Prepare Chunks

After `raw-rows.jsonl` exists:

```bash
node "$HOME/.codex/skills/semrush-authority-misrank-miner/scripts/prepare-keyword-chunks.mjs" \
  --input semrush-authority-runs/20260702-120000/reddit.com/raw-rows.jsonl \
  --out-dir semrush-authority-runs/20260702-120000/reddit.com \
  --chunk-size 500
```

This writes `unique-keywords.jsonl` and `chunks-500/chunk-XX.jsonl`.

Important:

- `unique-keywords.jsonl` preserves metrics and source fields for deterministic reporting.
- Screening chunks are keyword-only by default. Do not expose `volume`, `traffic`, `kd`, `cpc`, `position`, or ranking URL to subagents during first-pass or second-pass review.
- Treat SEMrush metrics as reporting and ordering data after screening, not as evidence for whether a keyword is a non-pure-content opportunity.

## First-Pass Subagent Screening

Read `references/rubric.md` and `references/schema-v2.md` before spawning subagents.

For each `chunks-500/chunk-XX.jsonl`, spawn a worker subagent under the Subagent Model Contract above.

Prompt template:

```text
Screen exactly one SEMrush keyword chunk for non-pure-content site opportunities.
Read rubric: `$HOME/.codex/skills/semrush-authority-misrank-miner/references/rubric.md`.
Read output schema: `$HOME/.codex/skills/semrush-authority-misrank-miner/references/schema-v2.md`.
Input: <domain-dir>/chunks-500/chunk-XX.jsonl.
The input rows are keyword-only. Do not read raw rows, unique-keywords.jsonl, reports, or any file that exposes volume, traffic, KD, CPC, position, or ranking URLs.
Output plausible SERP-verification keywords only as JSONL to <domain-dir>/first-pass-results/chunk-XX.jsonl using the schema-v2 first-pass shape.
Base the decision only on the keyword text, rubric, and schema. Do not infer from SEMrush metrics.
Judge supply model and permutation risk, but use `unknown` instead of pretending certainty.
Always judge `google_native_answer_risk`: reject or mark high risk for simple calculator/converter/translator/lookup/date/symbol/code/fact queries that Google can answer directly. Keyword-pattern risk from scripts is only a signal; deletion requires agent judgment.
Do not reject solely because a keyword contains a game, software, platform, or entertainment brand. Keep/cap auxiliary tools when the user wants an original utility, planner, checker, calculator, generator, or workflow; reject only piracy/leaks/cracked downloads/official asset extraction/impersonation.
Do not assign final P0/P1/P2. Use `route_hint` and `confidence` only.
Write explanatory fields such as `reason` in Chinese.
Be strict; include no rejected keywords. Do not modify files outside this output file.
Final response: output path and count only.
```

Use a rolling queue of up to 6 worker subagents unless the user asks otherwise. Close completed agents before spawning replacements.

Then merge:

```bash
node "$HOME/.codex/skills/semrush-authority-misrank-miner/scripts/merge-jsonl-results.mjs" \
  --input-dir <domain-dir>/first-pass-results \
  --pattern '^chunk-[0-9]+\\.jsonl$' \
  --out <domain-dir>/first-pass-candidates.jsonl \
  --summary <domain-dir>/first-pass-summary.json
```

## Second-Pass Review

Split first-pass candidates into 100-row review chunks:

```bash
node "$HOME/.codex/skills/semrush-authority-misrank-miner/scripts/prepare-keyword-chunks.mjs" \
  --input <domain-dir>/first-pass-candidates.jsonl \
  --out-dir <domain-dir> \
  --chunk-size 100 \
  --chunks-dir final-review-chunks \
  --unique-out final-review-source.jsonl \
  --prefix review
```

For each `final-review-chunks/review-XX.jsonl`, spawn a worker subagent under the Subagent Model Contract above:

```text
Second-pass screen exactly one batch of first-pass SEMrush keyword candidates.
Read strict rubric: `$HOME/.codex/skills/semrush-authority-misrank-miner/references/rubric.md`.
Read output schema: `$HOME/.codex/skills/semrush-authority-misrank-miner/references/schema-v2.md`.
Read task taxonomy: `$HOME/.codex/skills/semrush-authority-misrank-miner/references/opportunity-taxonomy.md`.
Input: <domain-dir>/final-review-chunks/review-XX.jsonl.
The input rows are keyword-only. Do not read raw rows, unique-keywords.jsonl, first-pass source files, reports, or any file that exposes volume, traffic, KD, CPC, position, ranking URLs, or first-pass rationale.
Output only truly SERP-verification-worthy keywords as JSONL to <domain-dir>/final-review-results/review-XX.jsonl using the schema-v2 second-pass shape.
Base the decision only on the keyword text, rubric, schema, and taxonomy. Do not infer from SEMrush metrics.
Do not classify by topic category alone. Judge how the answer is produced, who naturally owns the best answer, and whether an independent builder has supply advantage.
Do not downgrade merely because the keyword belongs to sports, travel, finance, entertainment, or local data.
Do not assign final priority. `priority_hint`, `subagent_cap_hint`, and `route_hint` are evidence only.
Use canonical key components for task identity only; do not put supply, risk, winner, maintenance, cap, or priority into the key components.
Always judge `google_native_answer_risk`: high risk should usually be rejected by the reviewing agent when there is no durable independent value; medium risk cannot support P0. Keyword-pattern risk from scripts is only a cap/review signal, not a deletion rule.
Do not reject solely because a keyword contains a game, software, platform, or entertainment brand. Keep/cap auxiliary tools when the user wants an original utility, planner, checker, calculator, generator, or workflow; reject only piracy/leaks/cracked downloads/official asset extraction/impersonation.
Write explanatory fields such as `reason`, `recommended_shape`, `monetization`, and `subagent_cap_reason` in Chinese.
Do not preserve recall for weak opportunities, but do not reject low-CPC or low-volume keywords merely for being small.
Use `unknown` where keyword-only evidence is weak. Unknown does not mean reject, but unknown cannot support P0.
Do not modify files outside this output file.
Final response: output path and count only.
```

Merge:

```bash
node "$HOME/.codex/skills/semrush-authority-misrank-miner/scripts/merge-jsonl-results.mjs" \
  --input-dir <domain-dir>/final-review-results \
  --pattern '^review-[0-9]+\\.jsonl$' \
  --out <domain-dir>/final-reviewed-candidates.jsonl \
  --summary <domain-dir>/final-reviewed-summary.json
```

## Cluster and Report

Do not shrink the final list just to make it shorter. Cluster every second-pass candidate into P0/P1/P2 unless it is clearly invalid JSON or missing a keyword.
Read `references/priority-derivation.md` when diagnosing or editing final priority behavior.
The cluster script generates canonical keys from task identity fields, derives final route/cap/priority, and rehydrates metrics from `unique-keywords.jsonl` after screening.
Subagent `priority_hint`, `subagent_cap_hint`, and `route_hint` are evidence, not final judgment.
Regex or keyword-pattern risk inferred by the cluster script may cap a row to P2 and add audit fields, but must not hard-delete it by itself. Hard deletion requires explicit agent reject evidence or a derived finding that the candidate is unsafe, prohibited, invalid, or has no plausible independent supply/value-add.
SEMrush metrics can sort inside an allowed priority band but must not override reject or cap rules.
Markdown reports use Chinese headings, compact supply-model badges, labels, and priority explanations by default.

```bash
node "$HOME/.codex/skills/semrush-authority-misrank-miner/scripts/cluster-recommendations.mjs" \
  --input <domain-dir>/final-reviewed-candidates.jsonl \
  --out-dir <domain-dir>
```

Priority meanings:

- P0: verify first; supply is controllable, maintenance is bounded, differentiation is explicit, and value is not just permutation volume.
- P1: valid opportunity; supply, natural winner, or execution cost still needs confirmation.
- P2: valid long-tail, cluster seed, or data-source-needed review; not rejected.

## Run Index

For multi-domain jobs, maintain `run-index.json` with:

- domain
- status: `completed`, `failed`, or `skipped`
- raw row count
- unique keyword count
- first-pass candidate count
- final reviewed candidate count
- P0/P1/P2 keyword counts
- output directory
- error message if any

Build or refresh it with:

```bash
node "$HOME/.codex/skills/semrush-authority-misrank-miner/scripts/build-run-index.mjs" \
  --run-dir semrush-authority-runs/20260702-120000
```

Run this after each domain finishes and again at the end of a multi-domain run.

## Fixture Validation

When editing this skill or diagnosing pipeline drift, run:

```bash
node "$HOME/.codex/skills/semrush-authority-misrank-miner/scripts/validate-fixtures.mjs"
```

This verifies JSONL parsing, keyword dedupe, chunking, merging, P0/P1/P2 clustering, required recommendation fields, and run-index generation against small local fixtures.
It also checks v2 schema behavior, canonical grouping, priority caps, legacy v1 compatibility, and that hidden SEMrush metrics do not leak into subagent rows.

## Safety

- Never print or persist SEMrush API keys, cookies, authorization headers, or full RPC templates.
- Use random delay while scraping pages.
- Do not parallelize scraping across domains.
- Keep analysis parallelism to subagent screening, not browser scraping.
