# @connected-repo/ui-mui

Material-UI components with direct exports for tree-shaking + React Hook Form wrappers

## Purpose
- Re-exports of MUI components with consistent theming
- Custom composite components
- RHF wrapper components for forms
- Zero barrel exports

## Structure
```
src/
├── components/      # Custom composites
├── data-display/    # MUI data display
├── feedback/        # MUI feedback
├── form/            # MUI form controls
├── layout/          # MUI layout
├── rhf-form/        # React Hook Form wrappers
└── theme/           # Theme config
```

## Imports

**External** (from other apps):
```typescript
import { Button } from '@connected-repo/ui-mui/form/Button'
import { RhfTextField } from '@connected-repo/ui-mui/rhf-form/RhfTextField'
```

**Internal** (within ui-mui):
```typescript
// ✅ Relative
import { NumLockAlert } from "../feedback/NumLockAlert";

// ❌ Package alias
import { NumLockAlert } from "@ui-mui/feedback/NumLockAlert";
```

## Component Categories

### form/ - Form Controls
```typescript
import { Button, TextField, Select, Checkbox, Radio, Switch, FormControl, MenuItem } from '@connected-repo/ui-mui/form/*'
```

### layout/ - Layout
```typescript
import { Box, Stack, Grid, Container, Paper, Card, Divider } from '@connected-repo/ui-mui/layout/*'
```

### feedback/ - Feedback
```typescript
import { Alert, CircularProgress, Dialog, Snackbar, Skeleton } from '@connected-repo/ui-mui/feedback/*'
```

### data-display/ - Data
```typescript
import { Typography, Table, List, Chip, Avatar, Badge, Tooltip } from '@connected-repo/ui-mui/data-display/*'
```

### components/ - Custom
```typescript
import { ContentCard, ErrorAlert, SuccessAlert, LoadingSpinner, PrimaryButton, SecondaryButton } from '@connected-repo/ui-mui/components/*'
```

## RHF Components

**All RHF components**: Responsive margins, full width, iOS-friendly font sizes, error handling

```typescript
import { useRhfForm, RhfFormProvider, RhfTextField, RhfCheckbox, RhfSwitch, RhfSelect, RhfRadio, RhfSubmitButton } from '@connected-repo/ui-mui/rhf-form/*'
```

**Example**:
```typescript
const { formMethods, RhfFormProvider } = useRhfForm({
  onSubmit: async (data) => { /* submit */ },
  formConfig: { resolver: zodResolver(schema) }
})

return (
  <RhfFormProvider>
    <RhfTextField name="email" label="Email" type="email" />
    <RhfSelect name="country" label="Country" options={[{ value: 'us', label: 'US' }]} />
    <RhfCheckbox name="terms" label="I agree" />
    <RhfSubmitButton />
  </RhfFormProvider>
)
```

**Base Styling**:
- Margins: 16px mobile, 20px desktop (fields); 12px mobile, 16px desktop (checkboxes)
- Full width by default
- Font size: 16px mobile (prevents iOS zoom), 14px desktop
- Override with `sx` prop

## Theme

```typescript
import { ThemeProvider } from '@connected-repo/ui-mui/theme/ThemeProvider'
```

**Colors**: Primary (#007bff), Secondary (#6c757d), Success (#28a745), Error (#dc3545)
**Spacing**: 8px base unit
**Border Radius**: 5px
**Defaults**: Buttons (no elevation, font-weight 500), TextFields (outlined, small), Cards (subtle shadow)

## Design Principles (CRITICAL)

**Beautiful, Smooth, Delightful**: Tasteful colors, generous spacing, clear typography, smooth transitions, immediate feedback

**Color Usage**:
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

**Transitions** (200-300ms):
```tsx
sx={{
  transition: 'all 0.2s ease-in-out',
  '&:hover': { transform: 'translateY(-2px)', boxShadow: 4 }
}}
```

**Typography**:
```tsx
<Typography variant="h5" fontWeight={600} lineHeight={1.7} color="text.primary" />
```

**Loading**: Use skeleton > spinner
```tsx
{isLoading ? <Skeleton variant="rectangular" height={200} /> : <Content />}
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
<Button sx={{ minHeight: 44, padding: { xs: '12px 24px', md: '8px 16px' } }} />
```

**Responsive Components**:
```tsx
<Grid container spacing={{ xs: 2, md: 3 }}>
  <Grid item xs={12} sm={6} md={4}>

<Stack direction={{ xs: 'column', md: 'row' }} spacing={2} />

const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
```

## Adding Components

**MUI Re-export**:
```typescript
// src/form/DatePicker.tsx
export { default as DatePicker, type DatePickerProps } from "@mui/x-date-pickers/DatePicker"
```

**Custom Component**:
```typescript
import type { BoxProps } from "@mui/material/Box"
import Box from "@mui/material/Box"

export interface MyComponentProps extends BoxProps { title: string }

export const MyComponent = ({ title, children, ...props }: MyComponentProps) => (
  <Box {...props}>
    <h3>{title}</h3>
    {children}
  </Box>
)
```

Rebuild: `yarn build`

## Styling

**sx Prop**:
```tsx
<Box sx={{
  p: 2,                    // Padding: 16px
  bgcolor: 'primary.main', // Theme color
  borderRadius: 1,         // 5px
  '&:hover': { bgcolor: 'primary.dark' }
}} />
```

**Theme Spacing**: `p: 1` (8px), `p: 2` (16px), `p: 3` (24px)
**Theme Colors**: `primary.main`, `error.light`, `divider`

## Peer Dependencies
```json
{
  "react": "^19.2.0",
  "react-dom": "^19.2.0",
  "@mui/material": "^7.3.4",
  "@emotion/react": "^11.14.0",
  "@emotion/styled": "^11.14.1"
}
```

## Bundle Size
```typescript
// ✅ Small: ~5KB
import { Button } from '@connected-repo/ui-mui/form/Button'

// ❌ Large: ~500KB (if barrel exports existed)
import { Button } from '@connected-repo/ui-mui'
```

## Best Practices
1. ✅ Direct imports from category/component paths
2. ✅ Export types alongside components
3. ✅ Use theme spacing/colors (not hardcoded)
4. ✅ Extend MUI props for custom components
5. ✅ Smooth transitions (200-300ms)
6. ✅ Generous spacing
7. ✅ Responsive (xs, sm, md, lg)
8. ✅ Touch targets 44x44px min
9. ❌ NO package root imports
10. ❌ NO inline styles when sx available
