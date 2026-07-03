# High-Authority Misrank Screening Rubric

The method:

Find keywords where a high-authority site ranks because Google lacks a precise result, not because the high-authority result is actually the best answer. Good targets are SERPs filled with videos, forums, encyclopedic pages, music pages, generic social pages, or broad community discussions when the user actually wants a concrete tool, workflow, planner, library, comparison, or interactive result.

Do not recommend a keyword merely because YouTube, Reddit, Wikipedia, Spotify, Facebook, or Fandom ranks. Recommend it only when a more precise non-pure-content page could clearly satisfy the intent better.

## Misrank Signals

Treat a keyword as a possible authority misrank only when several signals line up:

- The ranking authority page is a forum thread, video, encyclopedia entry, social page, music page, wiki page, or other broad/high-authority result.
- The keyword itself implies a concrete output, choice, workflow, file, plan, playable experience, visual library, or calculation.
- The current ranking page likely ranks because of authority and coverage, not because it is the ideal page shape.
- A focused non-pure-content result could answer faster, with less ambiguity, or with personalization that static content cannot provide.
- The opportunity can be produced with public data, deterministic logic, reusable templates, CC0/commercial assets, or a scalable workflow.

Weak signal:

- A high-authority page ranks, but the keyword is still just a broad topic or informational question.
- A tool could be invented, but users are not clearly asking for an input-output result.
- The best page would still be mostly an article with a decorative widget.

## Opportunity Supply Model

Do not judge a keyword only by whether the result shape is clear. First infer how the correct answer would be produced.

Prefer opportunities where the answer can be produced from deterministic logic, user-provided input transformation, stable public data, bounded periodic public data, reusable templates, commercially usable assets, or a scalable workflow.

Be cautious when the answer primarily depends on live external data, licensed or proprietary databases, official inventory, schedules, prices, tickets, availability, event-specific facts, rapidly changing public facts, or subjective/UGC consensus.

A clear lookup or data-page shape is not enough. A candidate becomes strong only when there is a credible supply advantage.

## Supply Advantage

Ask what an independent builder can do better than the natural winner.

Valid advantages include calculation, personalization, aggregation, filtering, visualization, workflow completion, format conversion, comparison, structured checklists, historical views, scenario simulation, and asset filtering.

Weak advantages include restating raw facts, copying official data, summarizing what a specialized data provider already does, or attaching a tiny widget to an article-shaped page.

## Permutation Inflation

When many keywords differ only by interchangeable entities, dates, locations, products, teams, routes, or event instances, infer the canonical opportunity before judging priority.

Examples:

- `team A vs team B player stats` -> entity-pair event stats lookup
- `UA123 flight status` -> flight status lookup
- `artist city tickets` -> event ticket inventory lookup
- `city zip code` -> postal code lookup
- `unit A to unit B` -> unit converter
- `holiday year` -> date calendar lookup

Large volume from permutations should not raise priority by itself. It matters only after the canonical opportunity passes supply control, maintenance, and natural-winner checks.

## P0 Gate

A candidate may be P0 only when all are true:

1. The user wants a concrete output, not just information.
2. A non-content page is materially better than article, forum, video, or list results.
3. The answer can be produced accurately from controllable inputs, deterministic logic, stable data, or a clearly available data source.
4. The page has value-add beyond restating raw facts.
5. Maintenance burden is low or bounded.
6. Legal, IP, and platform risk is acceptable.
7. The keyword is not merely one permutation inside a large entity/date/location/event matrix.
8. If official or specialized data providers are the natural winner, explicit independent value-add exists.

## Unknown Handling

Use `unknown` when the keyword-only view cannot support a confident judgment. Unknown does not mean reject, but unknown also cannot support P0.

Unknown in supply control, natural winner, maintenance burden, legal/platform risk, or canonical identity should trigger a cap or review route, not a confident high-priority recommendation.

## Types

- A. Native tool: calculator, converter, generator, checker, estimator, lookup, tracker, finder, analyzer.
- B. Task completion: template, guided workflow, checklist, letter/email/resume, planner, budget, schedule.
- C. Playable or interactive: game, quiz, simulator, challenge, test, practice experience.
- D. Course or training plan: followable plan, drills, workout/training plan, language/music/skill practice.
- E. Asset or inspiration library: ideas, examples, templates, images, design references, prompts, galleries.
- F. Configuration or decision: setup, build, kit, gear/equipment, buying checklist, comparison, software/SaaS selection.
- G. Seed only: broad theme, useful for more long-tail mining but not directly recommendable.
- H. Reject: brand navigation, adult, piracy, leaks, local near-me service, high-risk YMYL, pure definition/QA, celebrity/news, IP/copyright-heavy.

## Priority

Subagents may provide priority hints, but final priority is derived by the normalizer/clusterer after canonical grouping and metric rehydration:

- P0: verify first. Strong non-content shape, clear monetization, clear user intent, low or manageable risk, and the page can be built at scale.
- P1: valid opportunity. The product shape is real, but SERP weakness, monetization, data supply, or execution cost still needs more confirmation.
- P2: long-tail or expansion verification. The intent is valid but commercial value is weaker, SERPs may be crowded, or the opportunity is better as part of a cluster.

Do not use priority as a way to hide uncertainty. If a keyword is broad, pure content, unsafe, local-only, or IP-heavy, route it to reject or low-priority review evidence instead of promoting it.

## First-Pass Rule

Recommend only if all are true:

1. Search intent is clear.
2. Expected result format is clear.
3. Non-pure-content format is obviously better than an article, forum thread, or generic list.
4. The page can be produced or scaled at reasonable cost.
5. Copyright/compliance risk is acceptable.
6. There is a monetization path.

Important:

- Do not turn every topic into a fake tool.
- Topic nouns like `3d printer`, `interior design`, and `dog walker` are G unless the keyword itself implies an action or output.
- Supply-side advantages, such as CC0 images or public data, are notes, not reasons by themselves.
- Prefer high-value low-volume SaaS/configuration opportunities over weak high-volume information queries.
- Preserve low-CPC native tool opportunities if the intent is unmistakably tool-shaped.

## Second-Pass Rule

Be stricter about false positives, but do not shrink the list for aesthetics.

Hard reject:

- Broad topic nouns or seed terms.
- Pure informational definitions, simple Q&A, trivia, celebrity/news, memes, lyrics, plot queries.
- Brand/navigation terms unless the user is comparing alternatives, pricing, competitors, or a clearly decision-oriented workflow.
- Copyright/IP-heavy games, movies, anime, books, music, songs, characters, ROMs, leaks, or piracy terms.
- Adult, medical diagnosis/treatment, legal advice, finance/investment advice, and other high-risk YMYL.
- Local-intent service terms where a directory or map pack is the natural product.
- Keywords where the best page would still be mostly an article with a small widget attached.

Keep:

- Exact calculator/converter/checker/lookup/generator intent.
- Troubleshooting and diagnostic workflows with clear inputs and outputs.
- SaaS and product comparison or pricing intent.
- Salary, cost, and quote estimators where variables materially change the answer.
- Templates and planners where the user wants a finished artifact.
- Libraries where scalable assets and filters are core to the experience.
- Training/practice tools where interactivity or a followable plan beats static text.

## Output JSONL

Subagent outputs must be JSONL. One object per kept keyword:

```json
{"keyword":"...","type":"A|B|C|D|E|F or combo","volume":12345,"kd":12,"cpc":1.23,"page":1,"reason":"why this deserves SERP verification","recommended_shape":"specific non-content page shape","monetization":"ads/affiliate/SaaS/lead-gen/templates/course","risk":"low|medium","supply_advantage":"optional short note"}
```

Do not output rejected keywords. Do not output prose in result files.
