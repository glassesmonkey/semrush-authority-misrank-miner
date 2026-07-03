# Opportunity Taxonomy

Canonical keys identify the task, not the risk judgment.

Generate `canonical_opportunity_key` in code from task identity fields only:

```json
{
  "task_family": "lookup",
  "task_object": "event_player_stats",
  "entity_structure": "entity_pair",
  "output_shape": "sortable_data_page",
  "input_pattern": "optional"
}
```

The key becomes:

```text
lookup/entity_pair/event_player_stats/sortable_data_page
```

Do not put supply control, answer source model, natural winner, maintenance burden, legal risk, priority, or cap fields into the key. Those fields can drift between reviewers and belong in priority derivation, not identity.

## Examples

- Team A vs Team B player stats: `lookup/entity_pair/event_player_stats/sortable_data_page`
- Flight number status: `lookup/single_entity/flight_status/status_panel`
- Artist city tickets: `lookup/entity_location/event_ticket_inventory/availability_table`
- Unit A to Unit B: `converter/none/unit_conversion/instant_calculator`
- Printer offline: `workflow/single_entity/device_troubleshooting/diagnostic_flow`
- Holiday year: `lookup/entity_date/holiday_calendar/date_table`
