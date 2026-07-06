# Priority Derivation

Subagent hints are evidence. The normalizer derives final route, cap, and priority after canonical grouping and metric rehydration.

## Route

`route_hint=reject` is not final. Hard reject only when the derived judgment finds the candidate clearly unsafe, prohibited, illegal, unusable, or when it has no non-content advantage, no differentiation, and no plausible independent supply path.

Otherwise a reject hint should become low-priority review evidence such as `cluster_seed` or capped P2.

Keyword-pattern or regex-derived risk is not final. Deterministic scripts may use it to add audit fields and cap priority, but they must not hard-delete a candidate solely from keyword text. Hard deletion requires explicit agent reject evidence, objective policy/rights risk, invalid data, or a derived no-supply/no-differentiation finding.

## Caps

Cap to P2 when:

- Google native answer risk is high but only inferred by deterministic keyword-pattern logic;
- Google native answer risk is medium;
- live, proprietary, or official data has weak or unknown supply control;
- live freshness has high or unknown maintenance;
- permutation inflation is high and supply control is weak or unknown;
- official or specialized providers are natural winners and differentiation is missing;
- critical supply or identity fields are unknown while the row asks for P0.

Reject when:

- agent-reviewed Google native answer risk is high with an explicit reject signal: simple calculator/converter/translator/lookup/date/symbol/code/fact intent that Google can satisfy directly and that lacks durable independent value-add;
- the page would only restate a direct answer with a tiny widget or article wrapper;
- the query itself asks for piracy, ROMs, cracked APKs, leaks, copyrighted downloads/streams, official asset extraction, impersonation, or other rights-violating access;
- there is no non-content advantage, no differentiation, and no plausible independent supply path.

Do not reject solely because a keyword contains a brand or fictional world. Brand/IP-adjacent auxiliary tools can remain candidates when the user intent is a utility, planner, checker, calculator, generator, or workflow built from original UI, user inputs, deterministic logic, or public compatibility facts. Cap to P1/P2 when naming, official-affiliation, or brand-policy risk needs SERP/legal review.

Cap to P1 when:

- dynamic or external supply has medium control plus real differentiation;
- specialized providers are natural winners but independent aggregation, filtering, visualization, or personalization is credible;
- maintenance burden is medium but bounded.

Allow P0 only when:

- non-content advantage is high;
- supply control is strong or clearly medium;
- maintenance is low or bounded;
- legal/platform risk is acceptable;
- independent value-add is explicit;
- permutation volume is not the main reason for priority;
- unknown fields do not hide key supply assumptions.
- Google native answer risk is low.

## Metrics

SEMrush metrics are ordering data after screening. They may rank candidates within an allowed priority band, but they must not override reject or cap rules.
