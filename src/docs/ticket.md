# Add locations filter

- **Monday ID**: 1234567890
- **Link**: https://ewebinar.monday.com/boards/626076134/pulses/1234567890
- **Date**: 2026-04-06
- **Branch**: `feature/1234567890-add-locations-filter`
- **Status**: Coding

## Progress

### Steps
| # | Step | Status |
|---|------|--------|
| 1 | Ensure config | done |
| 2 | Pick ticket | done |
| 3 | Fetch details and create files | done |
| 4 | Write plan | done |
| 5 | Identify repos and checkout branches | done |
| 6 | Implementation | active |
| 7 | Create commits | pending |
| 8 | Fill implementation details and testing checklist | pending |
| 9 | Create PRs | pending |
| 10 | Move Monday ticket to PR Review | pending |
| 11 | Handle PR feedback | pending |

### Tasks
| # | Task | Status | Repo |
|---|------|--------|------|
| 1 | Add backend support for type-filtered location cities | done | backend |
| 2 | Update frontend tabs to use isolated city/municipality state | active | frontend |

## Pull requests

| Repo | PR |
|---|---|
| frontend | — |
| backend | https://github.com/ewebinar/backend/pull/1234 |
| cdn | — |

## Ticket Summary

**Column values**: Status — Coding · Priority — High · Person — Jane Doe

**Update 1** — *Jane Doe, 2025-12-10*
We need a locations filter on the dashboard. Users should be able to filter by city and municipality. The filter should apply to both active and request locations.

> **Reply** — *John Smith*
> The UI should show the selected filters in the header bar so users always know what's active.

**Update 2** — *John Smith, 2025-12-12*
One thing to watch out for: we should preserve filter state when switching between tabs.

## Specification

This ticket adds a locations filter to the dashboard. The product owner requested filtering by city and municipality. In the updates, the team clarified that the filter should apply to both active and request locations, and that the UI should show the selected filters in the header.

The solution must preserve tab isolation so the municipality filter selected in one tab does not bleed into the other tab. The implementation should keep behavior stable for existing locations views while adding explicit type-aware filtering.
