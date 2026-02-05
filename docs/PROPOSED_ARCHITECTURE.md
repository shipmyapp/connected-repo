# Proposed Frontend Architecture

The current architecture is a mix of feature modules and shared core logic. To improve scalability and maintainability, I propose a **Domain-Driven Modular Architecture**.

## Current vs Proposed

### Current (`src/`)
```
src/
├── components/          # Shared components (mixed with PWA, layout)
├── configs/
├── hooks/              # Shared hooks (mixed with domain-specific worker hooks)
├── modules/            # Domain features (journal-entries, prompts)
├── stores/             # Mixed PWA and other stores
├── worker/             # Sync core and data worker logic
└── main.tsx
```

### Proposed (`src/`)
```
src/
├── core/                   # Platform & Infrastructure (Domain-agnostic)
│   ├── api/                # oRPC client, interceptors
│   ├── auth/               # Better Auth config & wrappers
│   ├── connectivity/       # Network status management
│   ├── storage/            # TinyBase engine, persisters
│   ├── sync/               # SyncManager, Backoff utilities
│   └── worker/             # Worker initialization & message relay
│
├── modules/                # Domain-specific logic (Self-contained)
│   ├── journal-entries/
│   │   ├── components/     # Feature-specific UI
│   │   ├── hooks/          # useJournalEntries, usePendingJournalEntries
│   │   ├── pages/          # React Router pages
│   │   ├── service/        # Domain-specific worker logic (if complex)
│   │   └── index.ts        # Public API for the module
│   └── prompts/
│
├── shared/                 # Cross-module reusable components
│   ├── components/         # Button, Card (if not in ui-mui package)
│   ├── hooks/              # useDebounce, useMediaQuery
│   ├── layout/             # AppNavbar, MainLayout
│   └── pwa/                # InstallPrompt, UpdatePrompt
│
├── App.tsx
└── main.tsx
```

## Rationale

1.  **Strict Separation of Concerns**: Infrastructure logic (TinyBase, SyncManager, Worker relay) is clearly separated from business logic (Journal Entries).
2.  **Domain Autonomy**: Each module in `modules/` is responsible for its own UI, hooks, and domain-specific logic.
3.  **Scalability**: Adding a new feature (e.g., "Goals" or "Habits") is as simple as creating a new module. No need to touch `core/` unless infrastructure needs changing.
4.  **Clarity**: New developers can easily distinguish between "how the app works" (`core/`) and "what the app does" (`modules/`).
5.  **Testability**: Core infrastructure can be unit tested in isolation from the UI.
