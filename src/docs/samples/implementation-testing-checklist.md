## Implementation Details

- Add `type` query parameter (`active` / `request`) to the locations API and pass it from the frontend in `useLocationCities`.
- Cache active and request cities separately in React Query using `queryKeys.locations.cities(type)`.
- Split municipality state per tab so selections do not bleed across active vs request tabs.

## Testing Checklist

- [x] Verify the active locations tab shows only municipalities that have active locations.
- [x] Verify the request locations tab shows only municipalities that have request locations.
- [x] Verify switching between active and request tabs does not carry over the municipality filter from one tab to the other.
