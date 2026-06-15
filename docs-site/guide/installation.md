# Installation

## Requirements

- React `≥ 16.8` (hooks required)

## npm

```bash
npm install react-dockable-desktop
```

## pnpm / yarn

```bash
pnpm add react-dockable-desktop
yarn add react-dockable-desktop
```

## CSS import

Add the stylesheet to your application entry point (`main.tsx`, `index.js`, etc.):

```ts
import 'react-dockable-desktop/styles.css';
```

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
