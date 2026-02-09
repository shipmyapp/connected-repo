# Packages Guidelines

## Architecture

### NO Barrel Exports
- NEVER create `index.ts` re-exporting everything
- Direct imports: `import { Button } from '@connected-repo/ui-mui/form/Button'`

### Tree-Shaking
- `"sideEffects": false` in package.json
- Direct file exports via `exports` field

### Internal Imports
- **Within package**: Relative imports (`./Component`, `../folder/Component`)
- **Between packages**: Package exports (`@connected-repo/package/path/Component`)

## Available Packages

### @connected-repo/typescript-config
Shared TypeScript configs: `base.json`, `library.json`, `react-library.json`, `vite.json`

```json
{ "extends": "@connected-repo/typescript-config/library.json" }
```

### @connected-repo/zod-schemas
Entity schemas, validators, compliance (GSTIN, PAN)

📖 See [zod-schemas/AGENTS.md](./zod-schemas/AGENTS.md)

### @connected-repo/ui-mui
Material-UI components + RHF wrappers

📖 See [ui-mui/AGENTS.md](./ui-mui/AGENTS.md)

## Adding Package

1. Create: `packages/my-package/`
2. Add package.json: `"sideEffects": false`, configure `exports`
3. Create tsconfig.json extending base
4. Add to root workspaces

```json
{
  "name": "@connected-repo/my-package",
  "type": "module",
  "sideEffects": false,
  "exports": {
    "./*": {
      "types": "./src/*.ts",
      "import": "./dist/*.js"
    }
  }
}
```

## Troubleshooting
- **"Cannot find module"**: Run `yarn build`, verify exports, restart TS server
- **Tree-shaking not working**: Check `"sideEffects": false`, use direct imports
