### Task 1: Add backend support for `type`-filtered location cities

- [ ] Add a failing test in `backend/src/modules/location/__tests__/LocationsResolver.test.ts` for `type=active` and `type=request`.

```ts
it("filters cities by type query param", async () => {
  const active = await getCities({ type: "active" });
  const request = await getCities({ type: "request" });
  expect(active).not.toEqual(request);
});
```

- [ ] Run the focused test.
  - Command: `cd /Users/mac/projects/ewebinar/backend && npm test -- LocationsResolver.test.ts --runInBand`
  - Expected: FAIL before implementation, PASS after implementation.
- [ ] Implement query handling in `backend/src/modules/location/resolvers/LocationsResolver.ts`.
- [ ] Commit backend changes.
  - Command: `cd /Users/mac/projects/ewebinar/backend && git add src/modules/location/resolvers/LocationsResolver.ts src/modules/location/__tests__/LocationsResolver.test.ts && git commit -m "feat: filter location cities by type"`
  - Expected: One focused backend commit for API behavior.

### Task 2: Update frontend tabs to use isolated city/municipality state

- [ ] Add a failing test in `frontend/src/sections/Home/Locations/__tests__/LocationsTabs.test.tsx` proving tab state does not bleed.

```tsx
it("keeps municipality filter isolated per tab", async () => {
  render(<LocationsTabs />);
  await selectMunicipality("active", "Austin");
  await switchTab("request");
  expect(getSelectedMunicipality("request")).toBeNull();
});
```

- [ ] Run the focused frontend test.
  - Command: `cd /Users/mac/projects/ewebinar/frontend && npm test -- LocationsTabs.test.tsx --runInBand`
  - Expected: FAIL before implementation, PASS after implementation.
- [ ] Implement separate tab state in `frontend/src/sections/Home/Locations/LocationsTabs.tsx`.
- [ ] Commit frontend changes.
  - Command: `cd /Users/mac/projects/ewebinar/frontend && git add src/sections/Home/Locations/LocationsTabs.tsx src/sections/Home/Locations/__tests__/LocationsTabs.test.tsx && git commit -m "fix: isolate municipality filters per locations tab"`
  - Expected: One focused frontend commit for tab-state behavior.
