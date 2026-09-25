# Migration fixture

A small app that uses the react-dockable-desktop **6.x** API — nearly every export the 7.0.0
migration guide renames or restructures, plus the tricky cases the guide's rules exist for:
an aliased import, a local name that collides with a 7.0 name, a component from another
library with the same name as a 6.x one, and a test mock keyed by export names.

It is the acceptance test for `docs/migration-7.0.0.md` (docs-site/guide/migration.md): an agent
with no other context migrates it using the guide alone, and the result must type-check and pass
`App.test.tsx` against 7.0. The migrated version is what lives here; `tsconfig.json` type-checks
it in CI.
