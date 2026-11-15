# UI Component Package (AGENTS.md)

## 1. Blueprint
**Intent**: Reusable Material-UI component library optimized for tree-shaking and React Hook Form (RHF) integration.
**Core Stack**: React 19, MUI 7, Emotion, Material React Table, React Hook Form.

**Key Architectures**:
- **Zero Barrel Exports**: Direct path imports required (e.g., `@connected-repo/ui-mui/form/Button`) to minimize bundle size.
- **RHF Wrappers**: Pre-configured form controls with responsive margins and iOS-friendly font sizes (16px).
- **Responsive-First**: Default 44x44px touch targets; mobile/desktop breakpoints for all spacing.
- **Theme Consistency**: Centralized `ThemeProvider` for consistent colors, spacing (8px), and transitions.

---

## 2. Active Task
**Context**: Syncing UI package documentation with the monorepo standard.
**Current Status**: Refactoring `AGENTS.md` to 3-layer lifecycle.
**Intent**: Ensure agents use direct imports and responsive patterns.

---

## 3. Decision Records
| ID | Title | Status | Description |
|---|---|---|---|
| [ADR-U01] | Direct Exports | Accepted | Enforce folder-level imports for tree-shaking. |
| [ADR-U02] | Skeleton-First | Accepted | Prefer MUI Skeletons over global spinners for partial loads. |
| [ADR-U03] | iOS Zoom Fix | Accepted | Force 16px font-size on mobile inputs: the theme's `MuiCssBaseline` sets every `input`, `textarea` and `select` to 16px under `(pointer: coarse)`, MUI fields and hand-built ones alike, so iOS never zooms on focus. Pinch-zoom stays allowed (no `maximum-scale`). |
| [ADR-U04] | Dialogs are drawers | Accepted | The theme docks every `Dialog` as a drawer: to the bottom of the screen below `md` (rounded top, grab handle, safe-area padding, at most 92dvh), to the right edge from `md` up (full height, as wide as the dialog's `maxWidth`: xs 480, sm 600, md 760, lg 960). `feedback/DrawerTransition` slides it in from the matching side, instantly under reduced motion. |
| [ADR-U05] | Peers are devDependencies too | Accepted | Every peer the package compiles against is also a devDependency at the range the apps lock, so a `turbo prune` of any one app can build it (a pruned image's `tsc` could not resolve them otherwise). |
| [ADR-U06] | Shared web pieces live here | Accepted | Anything two apps would otherwise copy — confirm dialog, relative time, error screens, toast container, browser helpers under `utils/` — is added here, never duplicated in an app. `utils/*` holds pure helpers and is tested with `yarn workspace @connected-repo/ui-mui test:run`. |
| [ADR-U07] | The accessibility floor is in the theme | Accepted | `sharedComponentOverrides` gives every app a 2px ring on `:focus-visible`, ends animations and transitions under `prefers-reduced-motion`, makes buttons and icon buttons 44px on touch screens (`pointer: coarse`, so desktop tables stay dense) and sets `touch-action: manipulation`. Tested in `theme/theme.config.test.ts`. |
| [ADR-U08] | Back closes overlays | Accepted | `utils/use_back_closes.ts` is the one implementation; `ConfirmDialog` calls it; an app's own dialog calls it with its `open` / `onClose`. |

## Technical Guidelines

### Structure
- `src/form/`, `src/layout/`, `src/feedback/`, `src/data-display/`, `src/navigation/` re-export MUI components.
- `src/rhf-form/` contains `useRhfForm` and `RhfTextField`, `RhfSelect`, etc.
- `src/components/` for custom composites (e.g., `ErrorAlert`, `LoadingSpinner`).

### Usage
```typescript
import { Button } from '@connected-repo/ui-mui/form/Button';
import { RhfTextField } from '@connected-repo/ui-mui/rhf-form/RhfTextField';
```

### Design Standards
- **Spacing**: Use `theme.spacing` (8px). Common: `p: 2` (16px), `mb: 3` (24px).
- **Transitions**: 200-300ms ease-in-out (`all 0.2s ease-in-out`).
- **Touch**: Min 44x44px targets.

### Best Practices
- **NO** root imports (`from '@connected-repo/ui-mui'`).
- **YES** extend MUI props for all custom wrappers.
- **YES** use `sx` for overrides; avoid inline styles.
