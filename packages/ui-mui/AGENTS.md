# UI Component Package (AGENTS.md)

## 1. Blueprint
**Intent**: Reusable Material-UI component library optimized for tree-shaking and React Hook Form (RHF) integration.
**Core Stack**: React 19, MUI 7, Emotion, Material React Table, React Hook Form.

**Key Architectures**:
- **Zero Barrel Exports**: Direct path imports required (e.g., `@ui-mui/form/Button`) to minimize bundle size.
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
| [ADR-U03] | iOS Zoom Fix | Accepted | Force 16px font-size on mobile inputs. |

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
