# Frontend Agent Guidelines

## Stack
React 19, Vite 7 + SWC, React Router 7, TanStack Query + oRPC, React Hook Form, Zustand, Material-UI (via `@connected-repo/ui-mui`), Zod, Better Auth, Sentry, Vite PWA

## Testing
- **E2E**: Playwright - `yarn test:e2e`, `yarn test:e2e:ui`
- **Shared State**: Tests share browser state - use conditional logic, check app state before actions

## React 19 Patterns
- **Actions & useTransition**: Handle async mutations
- **use() Hook**: Consume promises in render
- **Suspense**: Data fetching boundaries
- **Minimize useEffect**: Prefer direct calculations, event handlers, use()

## Structure
```
src/
├── modules/          # Feature modules
│   └── <module>/
│       ├── pages/          # Module pages
│       ├── <module>.router.tsx  # Routes
│       └── <module>.spec.ts     # E2E tests
├── components/       # Shared (prefer ui-mui package)
│   ├── pwa/          # PWA components (install/update prompts, offline blocker)
│   └── layout/       # Layout components
├── utils/           # oRPC client, auth, query client
├── configs/         # Environment and navigation config
├── router.tsx       # Main routes
└── main.tsx         # Entry
```

## Module Rules
- **Self-contained**: Each module has own pages, routes, logic
- **NO cross-module imports**: Move shared components to `@connected-repo/ui-mui`
- **Lazy load pages**: `const Page = lazy(() => import('./pages/Page.page'))`
- **Module router**: Export router from `<module>.router.tsx`

## Components
**Naming**:
- Pages: `PageName.page.tsx` (Login.page.tsx)
- Components: `ComponentName.tsx`

**Use ui-mui Package**:
```typescript
import { Button } from '@connected-repo/ui-mui/form/Button'
import { Card } from '@connected-repo/ui-mui/layout/Card'
import { RhfTextField } from '@connected-repo/ui-mui/rhf-form/RhfTextField'
```

## PWA (Progressive Web App)

**Features:**
- Offline functionality via service worker
- Install prompts for iOS and Android
- Update prompts for new versions
- Offline blocker UI when connection is lost

**Configuration** (`vite.config.ts`):
```typescript
import { VitePWA } from 'vite-plugin-pwa';

VitePWA({
  strategies: 'injectManifest',
  srcDir: 'src',
  filename: 'sw.ts',
  registerType: 'prompt',
  injectManifest: {
    globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
  },
  workbox: { cleanupOutdatedCaches: true },
  manifest: {
    name: 'AppName',
    short_name: 'AppName',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#1976d2',
    icons: [/* 192x192, 512x512, maskable, apple-touch-icon */]
  }
})
```

**Service Worker** (`src/sw.ts`):
```typescript
// Custom service worker logic
self.addEventListener('install', (event) => {
  // Skip waiting to activate immediately
  self.skipWaiting();
});
```

**Components:**
- `PwaInstallPrompt` - Shows install prompt for iOS/Android
- `PwaUpdatePrompt` - Shows update prompt when new version available
- `OfflineBlocker` - Blocks UI when connection lost

**Install Hook** (`hooks/usePwaInstall.ts`):
```typescript
import { usePwaInstall } from '@/hooks/usePwaInstall';

const { deferredPrompt, showInstallPrompt } = usePwaInstall();
```

**Store** (`stores/usePwaInstall.store.ts`):
```typescript
import { usePwaInstallStore } from '@/stores/usePwaInstall.store';

const deferredPrompt = usePwaInstallStore((state) => state.deferredInstallationPrompt);
```

## Forms (React Hook Form)
```typescript
import { useRhfForm } from '@connected-repo/ui-mui/rhf-form/useRhfForm'
import { RhfTextField } from '@connected-repo/ui-mui/rhf-form/RhfTextField'
import { zodResolver } from '@hookform/resolvers/zod'

const { formMethods, RhfFormProvider } = useRhfForm({
  onSubmit: async (data) => { /* submit */ },
  formConfig: { resolver: zodResolver(schema) }
})

return (
  <RhfFormProvider>
    <RhfTextField name="email" label="Email" type="email" />
    <RhfSubmitButton />
  </RhfFormProvider>
)
```

## State Management
- **Server state**: oRPC + TanStack Query
- **Global state**: Zustand (theme, user session, PWA state, shared UI state)
- **Form state**: React Hook Form
- **URL state**: React Router params
- **Local state**: useState/useReducer

## oRPC Client
```typescript
import { orpc } from '@/utils/orpc.client'

// Query
const { data, isLoading } = orpc.moduleName.getAll.useQuery()

// Mutation
const createEntity = orpc.moduleName.create.useMutation()
await createEntity.mutateAsync({ content: 'Test' })
```

## Design Principles (CRITICAL)

**Beautiful, Smooth, Delightful**:
- Tasteful colors, generous spacing, clear typography
- Smooth transitions (200-300ms)
- Immediate feedback on actions
- Elegant loading (skeleton > spinner)
- Friendly errors, inviting empty states

**Color**:
```tsx
<Box sx={{
  bgcolor: 'background.paper',
  color: 'text.primary',
  borderColor: 'divider',
}} />
```

**Spacing** (theme.spacing = 8px):
```tsx
sx={{ p: 2, mb: 3, gap: 1.5 }}  // 16px, 24px, 12px
```

**Transitions**:
```tsx
sx={{
  transition: 'all 0.2s ease-in-out',
  '&:hover': { transform: 'translateY(-2px)', boxShadow: 4 }
}}
```

**Typography**:
```tsx
<Typography variant="h5" fontWeight={600} lineHeight={1.7} />
```

## Responsive Design (CRITICAL)

**Mobile-First**:
```tsx
<Box sx={{
  p: 2,                    // Mobile: 16px
  md: { p: 3 },            // Desktop: 24px
  fontSize: { xs: '1rem', md: '0.875rem' }
}} />
```

**Breakpoints**: xs (0), sm (600px), md (900px), lg (1200px), xl (1536px)

**Touch Targets**: Min 44x44px
```tsx
<Button sx={{
  minHeight: 44,
  padding: { xs: '12px 24px', md: '8px 16px' }
}} />
```

**Grid**:
```tsx
<Grid container spacing={{ xs: 2, md: 3 }}>
  <Grid item xs={12} sm={6} md={4}>
</Grid>
```

**Stack**:
```tsx
<Stack direction={{ xs: 'column', md: 'row' }} spacing={2} />
```

**useMediaQuery**:
```tsx
const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
return isMobile ? <MobileView /> : <DesktopView />
```

## Performance
- **Lazy load** route-level pages
- **Memoize** expensive calculations
- **React Query** caching & stale-while-revalidate

## Environment
- Prefix: `VITE_`
- Access: `import.meta.env.VITE_API_URL`
- Validation: `envValidationVitePlugin` in vite.config.ts

## Key Takeaways
1. React 19: use(), useTransition, Suspense - minimize useEffect
2. NO `any` or `as unknown`
3. Modular: Keep modules independent
4. Lazy load pages
5. UI components: Use `@connected-repo/ui-mui`
6. Direct imports: `@connected-repo/ui-mui/form/Button`
7. Beautiful design: Tasteful, smooth, delightful
8. Responsive: ALWAYS mobile, tablet, desktop
9. Forms: React Hook Form + Zod + RHF components
10. State: Server (oRPC/Query), Global (Zustand), Forms (RHF), URL (Router), Local (useState)
11. PWA: Service worker, install prompts, offline support
