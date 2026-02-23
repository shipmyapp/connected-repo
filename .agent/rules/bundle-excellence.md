---
trigger: always_on
---

## Bundle Excellence

Our goal is to keep the application ultra-lightweight, specifically for critical paths like Login and Lead Creation.

1. **NO Barrel Exports**: Always use direct imports (e.g., `import { Button } from '@mui/material'` is okay IF tree-shaking is verified, but preferred `import Button from '@mui/material/Button'`). This ensures tree-shaking works effectively across all packages.
2. **Side Effects**: Every `package.json` in the monorepo MUST have `"sideEffects": false` unless the package explicitly relies on global side effects.
3. **Dynamic Imports**:
   - Heavy dependencies (e.g., Sentry, Toast notifications, large charts) MUST be dynamically imported.
   - Use `lazy(() => import(...))` for React components that are not needed for the initial render.
   - Use `requestIdleCallback` or similar triggers to defer non-critical initialization.
4. **Analysis**: Use `npx vite-bundle-analyzer` regularly to identify and eliminate bundle bloat. Small chunks (< 100KB) should be consolidated if they increase request overhead unnecessarily.