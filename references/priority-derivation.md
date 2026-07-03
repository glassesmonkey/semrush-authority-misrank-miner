# Priority Derivation

Subagent hints are evidence. The normalizer derives final route, cap, and priority after canonical grouping and metric rehydration.

## Route

`route_hint=reject` is not final. Hard reject only when the derived judgment finds the candidate clearly unsafe, prohibited, illegal, unusable, or when it has no non-content advantage, no differentiation, and no plausible independent supply path.

Otherwise a reject hint should become low-priority review evidence such as `cluster_seed` or capped P2.

## Caps

Cap to P2 when:

- live, proprietary, or official data has weak or unknown supply control;
- live freshness has high or unknown maintenance;
- permutation inflation is high and supply control is weak or unknown;
- official or specialized providers are natural winners and differentiation is missing;
- critical supply or identity fields are unknown while the row asks for P0.

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

## Metrics

SEMrush metrics are ordering data after screening. They may rank candidates within an allowed priority band, but they must not override reject or cap rules.
