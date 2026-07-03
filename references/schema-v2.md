# Screening Schema v2

Use JSONL. One object per kept keyword. Do not output prose in result files.

Subagent rows are evidence, not final judgment. The normalizer derives final route, cap, canonical key, and P0/P1/P2.

## Hidden Metrics

First-pass and second-pass subagents must not read or output SEMrush metrics or ranking evidence: `volume`, `traffic`, `kd`, `cpc`, `position`, `page`, ranking URL, or landing URL.

## First Pass

First pass is a coarse screen. Use `unknown` when the keyword alone does not support a strong inference.

```json
{
  "schema_version": 2,
  "keyword": "...",
  "keep": true,
  "intent_shape": "calculator|converter|checker|lookup|tracker|generator|workflow|planner|library|comparison|data_page|training|unknown",
  "answer_source_model": "deterministic_logic|user_input_transform|stable_public_data|periodic_public_data|live_external_data|licensed_or_proprietary_data|official_or_marketplace_inventory|subjective_or_ugc|unknown",
  "entity_structure": "none|single_entity|entity_pair|entity_date|entity_location|event_instance|route_pair|many_permutations|unknown",
  "canonical_opportunity_label": "...",
  "supply_risk_hint": "low|medium|high|unknown",
  "route_hint": "build_candidate|serp_review|cluster_seed|reject",
  "confidence": "high|medium|low",
  "reason": "..."
}
```

## Second Pass

Second pass is stricter. Include canonical key components, but do not invent certainty. The key components describe task identity only.

```json
{
  "schema_version": 2,
  "keyword": "...",
  "intent_shape": "...",
  "answer_source_model": "...",
  "freshness_need": "none|low|periodic|event_bound|live|unknown",
  "entity_structure": "...",
  "canonical_opportunity_label": "...",
  "canonical_key_components": {
    "task_family": "calculator|converter|checker|lookup|tracker|generator|workflow|planner|library|comparison|data_page|training|unknown",
    "task_object": "...",
    "entity_structure": "none|single_entity|entity_pair|entity_date|entity_location|event_instance|route_pair|many_permutations|unknown",
    "output_shape": "...",
    "input_pattern": "optional"
  },
  "non_content_advantage": "high|medium|low|unknown",
  "supply_control": "strong|medium|weak|unknown",
  "natural_winner": "independent_tool|official_source|specialized_data_provider|marketplace|community_or_forum|encyclopedia|video_platform|unknown",
  "differentiation_basis": "calculation|personalization|aggregation|filtering|visualization|workflow_completion|conversion|comparison|asset_library|historical_view|none|unknown",
  "maintenance_burden": "low|medium|high|unknown",
  "legal_or_platform_risk": "low|medium|high|unknown",
  "permutation_inflation": "low|medium|high|unknown",
  "route_hint": "build_candidate|serp_review|cluster_seed|reject",
  "priority_hint": "P0|P1|P2|none",
  "subagent_cap_hint": "none|cap_P1|cap_P2|reject",
  "subagent_cap_reason": "...",
  "recommended_shape": "...",
  "monetization": "...",
  "risk": "low|medium|high",
  "confidence": "high|medium|low",
  "reason": "..."
}
```

## Legacy v1

Rows without `schema_version: 2` are legacy v1. Keep them readable through the legacy fallback, but do not rewrite old reports.
