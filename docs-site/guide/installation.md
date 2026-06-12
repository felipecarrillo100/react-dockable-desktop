# Installation

## Requirements

- React `≥ 16.8` (hooks required)
- `replace-react-contexify` peer dependency for context menus

## npm

```bash
npm install react-dockable-desktop replace-react-contexify
```

## pnpm / yarn

```bash
pnpm add react-dockable-desktop replace-react-contexify
yarn add react-dockable-desktop replace-react-contexify
```

## CSS imports

Add both stylesheets to your application entry point (`main.tsx`, `index.js`, etc.):

```ts
import 'replace-react-contexify/styles.css';
import 'react-dockable-desktop/styles.css';
```

The order matters — import the peer dependency stylesheet first.

## TypeScript

The library is written in TypeScript and ships full `.d.ts` type definitions. No `@types` package is needed.

## Module formats

The package ships both ESM and CJS:

| Field | File |
|-------|------|
| `import` (ESM) | `dist/index.js` |
| `require` (CJS) | `dist/index.cjs` |
| `types` | `dist/index.d.ts` |
| `styles` | `dist/styles.css` |
