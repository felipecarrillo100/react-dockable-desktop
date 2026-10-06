# Stability and versioning

react-dockable-desktop follows [Semantic Versioning](https://semver.org/). This page says exactly
what that promises: what counts as the public API, what each kind of release may change, how long a
deprecated API keeps working, and how long an old major version is supported.

## Why 7.0.0 broke so much, and why it won't happen again

7.0.0 renamed most of the public API in one release, with no deprecation period. That was a
one-time cost: the React, Vue and Angular editions of this library (react-dockable-desktop,
vue-dockable-desktop and angular-dockable-desktop) now share one vocabulary, so a concept has the
same name in all three and a team can move between them. Since 7.0.0, the rules below apply to
every release, and a rename of that kind will not happen again.

## The public API

A breaking change to anything in this list needs a new major version.

- **The exports of `react-dockable-desktop`, with their full type signatures**: components, hooks,
  functions, classes, constants and types. They are recorded in
  [`api/react-dockable-desktop.api.md`](https://github.com/felipecarrillo100/react-dockable-desktop/blob/main/api/react-dockable-desktop.api.md),
  which is generated from the published type declarations. That file is the contract: every change
  to it shows as a diff in review, and CI rejects a removed or changed signature unless the major
  version goes up.
- **The two entry points**: `react-dockable-desktop` and `react-dockable-desktop/styles.css`.
- **Saved layouts.** A layout saved by `saveLayout()` in any 7.x release loads with `loadLayout()`
  (or `initialState`) in every later 7.x release. Fixtures written by the real `saveLayout()` are
  part of the test suite, and each release that changes the format adds one. A new major version
  states in its migration guide whether it reads the previous major's layouts.

### Not covered

These may change in a minor release. Every such change is listed in the
[CHANGELOG](https://github.com/felipecarrillo100/react-dockable-desktop/blob/main/CHANGELOG.md):

- Styling: the `--rdd-*` CSS custom properties, the `.rdd-*` class names, the `data-rdd-*`
  attributes and the DOM structure. Tests pin the parts the stylesheet relies on, but they are not
  yet part of this promise.
- Defaults: sizes, spacing, colours, animation timings, default labels. Changing a default, such
  as a padding, is a minor release with a CHANGELOG note.
- Anything marked `@internal` or not exported, including `Workspace._core`.
- The wording of development-only console warnings.

## What each kind of release may do

| Release | May contain |
|---|---|
| **Major** (8.0.0) | Breaking changes to the public API, batched together, each with a migration note. Removes only APIs that were deprecated first. |
| **Minor** (7.8.0) | New APIs, new options, deprecations, changed defaults and visual changes, each with a CHANGELOG note. |
| **Patch** (7.7.4) | Bug fixes. |

A major version breaks nothing outside the public API, and nothing in it that wasn't deprecated
first.

## Deprecation

When an API is replaced:

1. The old name stays, as an alias of the new one, marked `@deprecated` in its documentation (your
   editor shows it struck through), with the replacement and the version that removes it.
2. In development builds it prints one console warning, once per page load, naming the
   replacement. Production builds print nothing.
3. The CHANGELOG entry of that release lists it under **Deprecated**.
4. It keeps working for **at least one minor release and at least three months**, and is removed
   only in a major version.
5. A rename ships with a **codemod**: a [jscodeshift](https://github.com/facebook/jscodeshift)
   script, so the migration is one command:
   `npx jscodeshift -t <codemod URL from the CHANGELOG> src/`.

## Support for older major versions

The previous major version gets bug fixes for **12 months** after the next one ships: 7.x until 12
months after 8.0.0. Fixes only, no new features.

## How often major versions ship

At most **one or two a year**, with breaking changes batched into them rather than spread over
releases. The deprecations a major version will remove ship in a 7.x minor release first, so you
can move to the new APIs at your own pace before upgrading.

## How it is enforced

- **API report.** `npm run api:check` runs in CI on every push: the committed API report must match
  the built type declarations, and a removed declaration, a removed member or a changed signature
  since the last release fails the build unless the major version went up.
- **Exports.** A test pins every runtime and type export by name.
- **Saved layouts.** Fixture layouts written by earlier releases must load and save back unchanged.
- **Migration guide.** A sample 6.x app migrated with the 7.0 guide alone keeps compiling against
  the current API.
