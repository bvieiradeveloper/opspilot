# Quickstart: Agent Team Mode

## Prerequisites

- Node.js 22 or later and the repository's installed dependencies.
- A configured OpsPilot API and web application for the manual end-to-end check. Use the existing local configuration mechanism; do not display or copy secret values.

## Automated Validation

Run the project checks from the repository root:

```powershell
npm run test
npm run typecheck
npm run web:typecheck
```

Expected results:

- The team graph tests verify role capabilities, shared board handoffs, terminal decisions, and the eight-handoff ceiling.
- API tests verify explicit team-route selection, handoff response validation, approval-aware executor behavior, and refusal on an unsafe legacy path.
- Web tests verify that handoff events are parsed and shown in order in `Ver raciocínio`.
- All three commands complete successfully.

## Manual End-to-End Validation

1. Start the API and web application using the repository's existing development setup.
2. Select the team mode and submit an incident investigation request.
3. Confirm the response includes work based on shared findings and that the trace panel shows each role transition with its source, destination, and brief.
4. Confirm the analyst reports findings without proposing actions, and the planner returns a plan without tool actions.
5. If the executor proposes an incident mutation, confirm the existing approval flow is shown and that no state change occurs before approval.
6. Exercise a run that reaches the coordination cap; confirm there is no ninth handoff and the response explains any incomplete work.

## Contract Reference

See [contracts/team-mode.md](./contracts/team-mode.md) for the request, response, handoff event, and refusal behavior.
