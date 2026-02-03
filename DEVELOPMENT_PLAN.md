# Development Plan - Scheduled Prompt & Journal App

**Project:** Connected Repo Starter - Journal MVP
**Repository:** shipmyapp/connected-repo
**Tech Stack:** oRPC, Orchid ORM, Better Auth, React 19, Vite, PostgreSQL, pg-tbus, SuprSend
**Last Updated:** 2026-02-04

---

## Executive Summary

Building a **Scheduled Prompt & Journal** app with:
- Timed notifications with thought-provoking prompts
- Simple text-based journaling
- Search functionality for past entries
- Gamification (streaks & badges)
- Free tier (with ads) and paid tier (cloud sync, ad-free)
- Mobile & web support (PWA + Capacitor)

### Current State Analysis

**ALREADY IMPLEMENTED ✅**
- Better Auth with Google OAuth
- Database setup with OrchidORM + PostgreSQL
- User, JournalEntry, Prompt, Subscription, Team tables
- Basic journal entry CRUD endpoints (oRPC)
- Basic prompt endpoints (getAllActive, getRandomActive)
- **Journal Entry Form & List View (UI Components)**
- Frontend with React 19, React Router 7, Material UI
- Dashboard page with user context
- Biome linting & formatting configured
- Turbo monorepo setup with workspace dependencies
- Environment variable sync script
- **Code Hygiene (P0):** Pre-commit hooks, linting on save, unused code detection, contribution guidelines ✅ COMPLETED
- **Testing Infrastructure (P0):** Vitest + Playwright setup with database integration ✅ COMPLETED
- **OpenTelemetry & RUM (P0):** Sentry + OTEL distributed tracing ✅ COMPLETED
- **CI/CD (P0):** GitHub Actions + Coolify deployment (basic) ✅ COMPLETED

**MISSING FOR MVP ❌**
1. ~~**Testing Infrastructure (P0):** Vitest setup for backend/frontend with database integration~~ ✅ COMPLETED
2. ~~**OpenTelemetry & RUM (P0):** Error tracking, performance monitoring, distributed tracing~~ ✅ COMPLETED
3. ~~**CI/CD & DevOps (P0):** GitHub Actions, Coolify deployment setup~~ ✅ COMPLETED (Basic CI/CD)
4. ~~**PWA Setup (P0):** Service workers, manifest, offline support, install prompt~~ ✅ COMPLETED
5. ~~**Event-Driven Architecture (P0):** Database-backed event bus with pg-tbus~~ ✅ COMPLETED
6. ~~**Notification Infrastructure (P0):** SuprSend setup, event-driven notifications~~ ✅ COMPLETED
7. ~~**Cron Jobs (P0):** Per-minute cron with pg-tbus task scheduling~~ ✅ COMPLETED
8. ~~**Webhook Processing (P0):** Subscription alerts with retry logic~~ ✅ COMPLETED
9. **User Schedules (P0):** Schedule management for timed notifications
10. **Email Notifications (P0):** Event-driven daily prompt emails (after user schedules)
11. **Capacitor Setup (P0):** iOS/Android native app configuration
12. **Push Notifications (P0):** FCM/APNs setup and event-driven push notifications
13. **Mobile CI/CD (P0):** GitHub Actions for Android/iOS builds and store uploads
14. **Payments & Subscriptions (P0):** Stripe integration ($5/month, $50/year)
15. **Offline-First (V1):** Make app offline-first, free version offline-only, paid gets cloud sync
16. **Search Functionality (V1):** Backend search implementation
17. **Gamification (V1):** Streaks and badges system (event-driven)

---

## Priority Levels

- **V0 (MVP Critical)** = Must have for launch
- **V1 (Post-MVP)** = Needed for growth
- **V2 (Enhancement)** = Polish & scale

---

## V0: MVP FOUNDATION (CRITICAL)

### Phase 1: Developer Experience & Code Hygiene 🔧

**Priority:** HIGHEST - Foundation for all future work

#### Epic 1.1: Pre-commit Hooks & Linting Setup

**Issues:**

**1.1.1: Set up Biome Pre-commit Hooks** ✅ COMPLETED
- Manual Git pre-commit hook implemented using Biome's --staged flag
- Runs Biome check --write --staged --files-ignore-unknown=true --no-errors-on-unmatched
- Includes TypeScript type checking
- **Acceptance Criteria:**
  - Pre-commit hook runs Biome linting on staged files
  - Type checking runs on all files
  - Commits blocked if lint/type errors exist
  - No external dependencies (Husky/lint-staged avoided)

**1.1.2: Configure Knip to avoid unused-exports & unused-files** ✅ COMPLETED

**1.1.3: Configure Linting on Save (VSCode)** ✅ COMPLETED
- Create/update .vscode/settings.json
- Enable Biome format on save
- Enable organize imports on save
- Configure editor to respect Biome config (tabs, 100 chars, double quotes)
- Add recommended extensions list
- **Acceptance Criteria:**
  - VSCode formats on save
  - Imports auto-organize
  - Settings committed to repo
  - Works for all team members

**1.1.4: Configure Biome for Unused Code Detection** ✅ COMPLETED
- Enabled Biome rules for unused variables, functions, and imports
- Configured Biome to detect unused files
- Added pre-commit hook to block commits with unused code
- Set up CI to fail on unused code
- **Acceptance Criteria:**
  - Unused functions flagged as errors
  - Unused files detected and reported
  - Pre-commit blocks unused code
  - CI fails on unused code

**1.1.5: Create CONTRIBUTING.md** ✅ COMPLETED
- Document setup instructions
- Explain commit message format
- Define code style guidelines (tabs, double quotes, no any)
- Explain branch naming conventions (feat/, fix/, chore/)
- Add PR template guidelines
- Document testing requirements
- Document unused code policy
- **Acceptance Criteria:**
  - Clear onboarding guide for new developers
  - Examples of good commits
  - Code style documented
  - Unused code policy documented
  - PR process explained

---

### Phase 2: Testing Infrastructure 🧪

**Priority:** CRITICAL - Required for confident AI-assisted development

#### Epic 2.1: Backend Testing Setup

**Issues:**

**2.1.1: Set up Vitest for Backend with OrchidORM** ✅ COMPLETED
- Install vitest, @vitest/ui, and testing utilities
- Create vitest.config.ts for apps/backend
- Configure test environment (node)
- Set up test database (separate from dev)
- Follow OrchidORM testing guides:
  - Use `testTransaction` for database tests: https://orchid-orm.netlify.app/guide/transactions.html#testtransaction
  - Use test factories for data creation: https://orchid-orm.netlify.app/guide/test-factories.html#test-factories
- Create test utilities (db setup/teardown helpers)
- Add test script to package.json
- Configure coverage collection
- **Acceptance Criteria:**
  - Vitest runs successfully
  - OrchidORM testTransaction configured
  - Test factories created for User, JournalEntry, Prompt
  - Test database isolated from development
  - Can run `yarn test` in apps/backend
  - Coverage reports generated

**2.1.2: Write oRPC Endpoint Tests with Database Integration** ✅ COMPLETED
- Test journal entry endpoints (create, getAll, getById, delete) - includes database constraints
- Test prompt endpoints (getAllActive, getRandomActive, getById) - includes database queries
- Test auth context (protected procedures require user)
- Test database foreign key constraints and cascade deletes
- Test unique constraints and validation
- Mock Better Auth session
- Test error cases (not found, unauthorized, constraint violations)
- Achieve >80% coverage on routers
- **Acceptance Criteria:**
  - All oRPC endpoints tested with real database operations
  - Database constraints validated (foreign keys, unique constraints)
  - Success and error cases covered
  - Better Auth mocked properly
  - Tests use testTransaction for isolation
  - Coverage >80% on router files

**2.1.3: Test Factory Setup** ✅ COMPLETED
- Create factories for User, JournalEntry, Prompt
- Implement factory methods for creating test data with relationships
- Add helper methods for common test scenarios
- **Acceptance Criteria:**
  - Test factories create consistent test data
  - Relationships properly established
  - Factories reusable across tests

---

#### Epic 2.2: Frontend E2E Testing Setup

**Issues:**

**2.2.1: Set up Playwright for E2E Testing** ✅ COMPLETED
- Install Playwright
- Configure playwright.config.ts
- Set up test environment with backend test-server
- Create helper utilities for auth and navigation
- Add test script to package.json
- **Acceptance Criteria:**
  - Playwright configured for E2E testing
  - Backend test-server integration
  - Auth helpers for login/signup
  - Can run `yarn test:e2e`

**2.2.2: Write Critical Flow E2E Tests** ✅ COMPLETED
- Test user registration/login flow
- Test journal entry creation and viewing
- Test basic navigation and responsiveness
- Test PWA installation prompt (when implemented)
- Focus on critical user journeys, not every component
- **Acceptance Criteria:**
  - Key user flows tested end-to-end
  - Tests run against real backend
  - Mobile responsiveness tested
  - Critical bugs caught by E2E

---

### Phase 3: OpenTelemetry & RUM Setup 📊

**Priority:** CRITICAL - Must catch errors before users complain

#### Epic 3.1: Backend Error Tracking & Tracing

**Issues:**

**3.1.1: Integrate Sentry for Backend** ✅ COMPLETED
- Create Sentry account and project
- Install @sentry/node and @sentry/profiling-node
- Initialize Sentry in server.ts
- Configure error sampling (100% for dev, 10% for prod)
- Capture errors in oRPC error handler
- Upload source maps
- Test error reporting
- **Acceptance Criteria:**
  - Sentry captures backend errors
  - User context attached (userId, email)
  - Source maps working
  - Errors visible in Sentry dashboard

**3.1.2: Set up OpenTelemetry Tracing** ✅ COMPLETED
- Configure trace exporter (Sentry or OTLP)
- Generate trace IDs for all requests
- Return trace IDs in response headers (x-trace-id)
- Link traces to Sentry errors
- **Implemented:** Renamed sentry.sdk.ts to otel.sdk.ts, added @kubiks/otel-better-auth for automatic Better Auth tracing, created record-message.otel.utils.ts for context-aware error/message recording, updated graceful shutdown to use OTEL utilities
- **For Capacitor/Mobile:** Evaluate options:
  - **last9.io**: Check if they support Capacitor - if yes, use their SDK
  - **Alternative libraries**: @opentelemetry/api + capacitor-opentelemetry-plugin, or Sentry's Capacitor SDK
- **Acceptance Criteria:**
  - Distributed tracing active
  - Database queries traced
  - HTTP requests traced
  - Trace IDs in headers
  - End-to-end request visibility
  - Mobile OTEL solution identified

---

#### Epic 3.2: Frontend Error Tracking & RUM

**Issues:**

**3.2.1: Integrate Sentry for Frontend** ✅ COMPLETED
- Install @sentry/react
- Initialize Sentry in main.tsx
- Integrate with React Router error boundaries
- Configure breadcrumbs (user actions)
- Capture user context
- Upload source maps
- **Acceptance Criteria:**
  - Frontend errors reported to Sentry
  - React error boundaries integrated
  - User context captured
  - Source maps working

**3.2.2: Enable Real User Monitoring (RUM)**
- Enable Sentry Performance Monitoring
- Track page load times (First Contentful Paint, Time to Interactive)
- Track API request durations (oRPC calls)
- Monitor Core Web Vitals (LCP, FID, CLS)
- Set performance budgets
- Capture trace IDs from backend responses
- Link frontend errors to backend traces
- **Acceptance Criteria:**
  - Performance data in Sentry
  - Core Web Vitals monitored
  - API requests tracked with durations
  - Frontend-backend traces linked

---

### Phase 4: PWA Setup 📱 ✅ COMPLETED

**Status:** ✅ COMPLETED - All PWA features implemented and tested

**Implementation Summary:**
- **Vite PWA Plugin:** Configured with `vite-plugin-pwa` using injectManifest strategy
- **Service Worker:** Custom `sw.ts` with Workbox integration, caches static assets (JS, CSS, HTML, images, fonts)
- **Manifest:** Complete web app manifest with icons (192x192, 512x512, maskable, apple-touch-icon), theme colors, display modes
- **Install Prompts:** Platform-specific prompts for iOS and Android with dismiss functionality
- **Update Prompts:** Service worker update detection with user notification
- **Offline Blocker:** `OfflineBlocker.tsx` component that blocks UI when connection is lost
- **State Management:** Zustand store (`usePwaInstall.store.ts`) manages installation state

**Files:**
- `apps/frontend/vite.config.ts` - PWA configuration
- `apps/frontend/src/sw.ts` - Service worker
- `apps/frontend/src/components/pwa/install_prompt.pwa.tsx` - Install prompts
- `apps/frontend/src/components/pwa/update_prompt.pwa.tsx` - Update prompts
- `apps/frontend/src/components/OfflineBlocker.tsx` - Offline UI blocker
- `apps/frontend/src/stores/usePwaInstall.store.ts` - Installation state
- `apps/frontend/src/hooks/usePwaInstall.ts` - Install hook

---

### Phase 5: Event-Driven Architecture & Notifications 🔔 ✅ COMPLETED

**Status:** ✅ COMPLETED - pg-tbus event system, SuprSend notifications, cron jobs, webhooks

**Implementation Summary:**

#### Epic 5.1: Event-Driven Architecture with pg-tbus ✅

**pg-tbus Implementation:**
- **Library:** pg-tbus for PostgreSQL-based event bus with Transactional Outbox Pattern
- **Configuration:** `apps/backend/src/events/tbus.ts` - TBus instance with PostgreSQL connection
- **Schema:** `apps/backend/src/events/events.schema.ts` - Type-safe event and task definitions
  - `userCreatedEventDef` - User registration events
  - `userReminderTaskDef` - Scheduled reminder tasks
  - `subscriptionAlertWebhookTaskDef` - Webhook tasks with retry logic
- **Queries:** `apps/backend/src/events/events.queries.ts` - Event registration and handlers
- **Utils:** `apps/backend/src/events/events.utils.ts` - Orchid ORM to TBus query adapter

**Features:**
- Type-safe events using TypeBox schemas
- Transactional event publishing (atomic with DB operations)
- Task definitions with retry configuration (retryLimit, retryDelay, retryBackoff)
- Event handlers for user creation and reminders
- Audit logging via `pg_tbus_task_log` table

#### Epic 5.2: Cron Job Infrastructure ✅

**Implementation:**
- **Library:** node-cron for per-minute scheduling
- **File:** `apps/backend/src/cron_jobs/services/per_minute_cron.ts`
- **Pattern:** Mutex flag prevents concurrent execution
- **Tasks:**
  - Journal entry reminder scheduling
  - Future: webhook processing, cleanup jobs

**Mutex Pattern:**
```typescript
let isCronJobRunning = false;
cron.schedule('* * * * *', async () => {
  if (isCronJobRunning) return;
  isCronJobRunning = true;
  try {
    await runScheduledTasks();
  } finally {
    isCronJobRunning = false;
  }
});
```

#### Epic 5.3: Notification Infrastructure ✅

**SuprSend Implementation:**
- **Configuration:** `apps/backend/src/configs/suprsend.config.ts`
- **Library:** @suprsend/node-sdk
- **Event Types:**
  - `USER REMINDER SCHEDULED` - Daily prompt reminders
  - User created notifications

**Handler:** `apps/backend/src/modules/journal-entries/notifications/reminder.notifications.journal_entries.ts`

#### Epic 5.4: Webhook Processing ✅

**Implementation:**
- **Handler:** `apps/backend/src/modules/webhook_calls/handlers/subscription_alert_webhook.handler.ts`
- **Features:**
  - Sends subscription usage alerts at 90% threshold
  - Audit logging to `pg_tbus_task_log` table
  - Retry logic via pg-tbus (3 attempts with exponential backoff)
  - Bearer token authentication
  - 30-second timeout

**Audit Logging:**
- Task execution tracked in `pg_tbus_task_log` table
- Success/failure status, error messages, response codes
- Retry tracking and willRetry flags

---

### Phase 6: User Schedules & Advanced Notifications 📅

**Priority:** HIGH - Schedule management for timed notifications

**Status:** 🔄 PENDING - Next priority after PWA completion

#### Epic 6.1: User Schedule Management

**Note:** User schedules stored in `users.journalReminderTimes` array (already exists in schema). May need dedicated `user_schedules` table for more complex scheduling.

**Issues:**

**6.1.1: Create UserSchedule Table (if needed)**
- Evaluate if `users.journalReminderTimes` array is sufficient
- If not, create `user_schedules` table:
  - id, userId, scheduledTime, timezone, frequency, isActive
  - Support daily frequency for MVP
  - Store time as string (e.g., "08:00", "20:00")
  - Store timezone (e.g., "America/New_York", "Asia/Kolkata")
- Run migration: `yarn db g user_schedules`
- **Acceptance Criteria:**
  - Table created with proper schema
  - Timezone validation
  - Foreign key to users table
  - Default schedule can be set

**6.1.2: Build Schedule oRPC Endpoints**
- `schedule.get` - Get user's current schedule
- `schedule.upsert` - Create or update schedule
- `schedule.delete` - Remove schedule
- Validate timezone against IANA timezone list
- Validate time format (HH:MM)
- **Acceptance Criteria:**
  - Endpoints validate input
  - Timezone validation works
  - User can only modify their own schedule
  - Clear error messages

**6.1.3: Create Schedule Settings UI**
- Build settings page for notification schedule
- Time picker for scheduled time
- Timezone selector (react-timezone-select)
- Toggle to enable/disable notifications
- Save button calls oRPC endpoint
- Show current settings on load
- **Acceptance Criteria:**
  - Clean, intuitive UI
  - Time picker easy to use
  - Timezone auto-detected if possible
  - Changes saved successfully
  - Confirmation message on save

---

#### Epic 6.2: Daily Prompt Notifications

**Issues:**

**5.2.1: Create UserSchedule Table**
- Create `UserSchedule` table (id, userId, scheduledTime, timezone, frequency, isActive)
- Support daily frequency for MVP
- Store time as string (e.g., "08:00", "20:00")
- Store timezone (e.g., "America/New_York", "Asia/Kolkata")
- Add unique constraint on userId (one schedule per user for MVP)
- Run migration
- **Acceptance Criteria:**
  - Table created with proper schema
  - Timezone validation
  - Foreign key to users table
  - Default schedule can be set

**5.2.2: Build Schedule oRPC Endpoints**
- `schedule.get` - Get user's current schedule
- `schedule.upsert` - Create or update schedule
- `schedule.delete` - Remove schedule
- Validate timezone against IANA timezone list
- Validate time format (HH:MM)
- **Acceptance Criteria:**
  - Endpoints validate input
  - Timezone validation works
  - User can only modify their own schedule
  - Clear error messages

**5.2.3: Create Schedule Settings UI**
- Build settings page for notification schedule
- Time picker for scheduled time
- Timezone selector (react-timezone-select)
- Toggle to enable/disable notifications
- Save button calls oRPC endpoint
- Show current settings on load
- **Acceptance Criteria:**
  - Clean, intuitive UI
  - Time picker easy to use
  - Timezone auto-detected if possible
  - Changes saved successfully
  - Confirmation message on save

---

#### Epic 6.2: Daily Prompt Notifications

**Note:** Using SuprSend for notifications (already implemented). Email templates via Brevo can be added later if needed.

**Issues:**

**6.2.1: Create Daily Prompt Notification Template**
- Design notification template for daily prompts (SuprSend)
- Include prompt text prominently
- Add "Write your response" CTA linking to app
- Include unsubscribe/settings link
- Make responsive for mobile
- **Acceptance Criteria:**
  - Notification template professional and branded
  - CTA button works correctly
  - Responsive on mobile
  - Unsubscribe link functional
  - Branding consistent with app

**6.2.2: Implement Cron Job for Daily Prompt Scheduling**
- Design HTML email template for daily prompts
- Include prompt text prominently
- Add "Write your response" CTA button linking to app
- Include unsubscribe/settings link
- Make responsive for mobile
- Test in Gmail, Outlook, Apple Mail
- **Acceptance Criteria:**
  - Email looks professional
  - CTA button works correctly
  - Responsive on mobile email clients
  - Unsubscribe link functional
  - Branding consistent with app

**6.2.2: Implement Cron Job for Daily Prompt Scheduling**
- Use **node-cron** for scheduling (already configured in `per_minute_cron.ts`)
- Create cron job that runs every minute: `cron.schedule('* * * * *', handler)`
- In job handler:
  - Query users with active schedules matching current time (in their timezone)
  - For each matched user:
    - Fetch daily prompt
    - Publish `userReminderTaskDef` event via pg-tbus
- Prevent duplicate scheduling using idempotency keys: `${userId}:${date}`
- **Acceptance Criteria:**
  - Cron job runs reliably every minute
  - Correctly converts timezones
  - Events published at scheduled time (±1 min)
  - No duplicate event publishing (idempotency)
  - Events published atomically (no ghost notifications)
  - Scales to 1000+ users

**6.2.3: Implement Event-Driven Notification Sending**
- Notification service already subscribes to events via `reminderNotificationJournalEntryHandler`
- Extend handler to process `userReminderTaskDef` events:
  - Check user notification preferences
  - Send notification via SuprSend
  - Mark event as processed
  - Log successful sends and errors
- Handle rate limits and retries via pg-tbus config (already set: retryLimit: 3)
- **Acceptance Criteria:**
  - Event subscription working
  - Notifications sent when events published
  - User preferences respected
  - Failed sends retried with backoff
  - Event marked processed after successful send
  - Errors logged but don't crash service

**6.2.4: Test Event-Driven Notifications End-to-End**
- Test event publishing from cron job
- Test event processing by notification service
- Test timezone conversions
- Test notification delivery at scheduled times
- Test unsubscribe functionality
- Test notification preferences
- Monitor delivery rates
- **Acceptance Criteria:**
  - Events published correctly from cron
  - Events processed by notification service
  - Notifications sent at correct times across timezones
  - Delivery rates >95%
  - Unsubscribe works correctly
  - Preferences respected
  - Event-driven flow works reliably

---

### Phase 6: Capacitor Mobile App 📲

**Priority:** CRITICAL - Native mobile experience (do AFTER email notifications)

#### Epic 6.1: Capacitor Setup & Configuration

**Issues:**

**6.1.1: Initialize Capacitor Project**
- Install Capacitor CLI
- Initialize Capacitor in apps/frontend
- Configure capacitor.config.ts
- Add iOS and Android platforms
- Sync web assets to native projects
- Test basic app launch in simulators
- **Acceptance Criteria:**
  - Capacitor initialized
  - iOS and Android folders created
  - App launches in simulators
  - Web assets sync correctly

**6.1.2: Configure Android Build**
- Install Android Studio
- Configure Gradle build
- Set up app signing (debug and release)
- Configure app permissions (notifications, internet)
- Update app icon and splash screen
- Build debug APK
- Test on emulator and physical device
- **Acceptance Criteria:**
  - Android Studio opens project
  - Debug build succeeds
  - APK installs on emulator
  - App icon and splash correct

**6.1.3: Configure iOS Build**
- Install Xcode
- Configure iOS project settings
- Set up code signing (development)
- Configure app permissions (notifications, internet)
- Update app icon and launch screen
- Build to iOS simulator
- Test on simulator and physical device
- **Acceptance Criteria:**
  - Xcode opens project
  - Simulator build succeeds
  - App runs on iOS simulator
  - App icon and launch screen correct

**6.1.4: Create App Icons & Splash Screens**
- Design app icon (1024x1024)
- Generate all required sizes
- Design splash screen
- Use capacitor-assets to generate
- Update Android and iOS projects
- **Acceptance Criteria:**
  - Icon looks good at all sizes
  - Splash screen displays on launch
  - Branding consistent
  - No placeholder icons remain

**6.1.5: Test on Physical Devices**
- Build release APK for Android
- Build to connected iPhone for iOS
- Install and test all features (auth, entries)
- Check performance
- Verify PWA features work in native app
- **Acceptance Criteria:**
  - App installs successfully on Android phone
  - App installs successfully on iOS phone
  - All features work
  - Performance acceptable
  - No crashes

---

### Phase 7: Push Notification Setup 🔔

**Priority:** HIGH - Native push notifications (do AFTER Capacitor)

#### Epic 7.1: Push Notification Infrastructure

**Issues:**

**7.1.1: Set up Firebase Cloud Messaging (Android)**
- Create Firebase project
- Add Android app to Firebase
- Download and configure google-services.json
- Install Firebase SDK
- Configure FCM in Android project
- Generate server key for backend
- Test token registration
- **Acceptance Criteria:**
  - Firebase project configured
  - Android app registered
  - FCM tokens generated
  - Backend can send test notifications
  - Tokens stored in database

**7.1.2: Configure Apple Push Notification Service (iOS)**
- Create Apple Developer account (if needed)
- Create APNs certificate/key
- Configure Push Notification capability in Xcode
- Upload APNs key to Firebase (for unified FCM)
- Test token registration on iOS
- **Acceptance Criteria:**
  - APNs configured
  - iOS app registered for push
  - Push tokens generated
  - Backend can send test notifications
  - Tokens stored in database

**7.1.3: Integrate Capacitor Push Notifications Plugin**
- Install @capacitor/push-notifications
- Request notification permissions (iOS/Android)
- Register for push notifications
- Store device tokens in database (linked to userId)
- Handle token refresh
- Create oRPC endpoints for token management
- **Acceptance Criteria:**
  - Plugin installed and configured
  - Permissions requested on app launch
  - Tokens stored in database
  - Token refresh handled
  - Endpoints for token CRUD operations

**7.1.4: Implement Push Notification Service in Notifications Module**
- Extend centralized notification module with push provider
- Implement FCM integration (unified for iOS + Android)
- Create notification payload builder
- Handle notification delivery (foreground/background)
- Implement notification click handlers
- Add push notification to queue system
- **Acceptance Criteria:**
  - Push provider integrated into module
  - Can send push notifications via FCM
  - Notifications delivered to iOS and Android
  - Click handlers open app correctly
  - Queue system handles async sending

**7.1.5: Implement Event-Driven Push Notifications**
- Update notification service to handle push notifications
- Subscribe to `notification.scheduled` events
- On event received:
  - Check user notification preferences
  - If push enabled, send push notification via FCM
  - Support multi-channel (email + push) from same event
  - Mark event as processed after all channels sent
- Handle notification failures gracefully
- Log push notification events
- Test delivery on physical devices
- **Acceptance Criteria:**
  - Notification service sends to multiple channels from one event
  - User preferences respected (email only, push only, both, none)
  - Push notifications delivered reliably
  - Tapping notification opens app to entry form
  - Works in background and foreground
  - Multi-channel delivery tracked in logs
  - Event marked processed only after all channels complete

---

### Phase 8: Mobile CI/CD & DevOps 🚀

**Priority:** HIGH - Automated mobile deployment (do AFTER push notifications)

#### Epic 8.1: Mobile CI/CD Pipeline

**Issues:**

**8.1.1: Set up Mobile CI/CD (Android & iOS)**
- Create GitHub Actions workflow for mobile builds
- Configure Android build pipeline:
  - Set up Java/Gradle environment
  - Build APK/AAB for release
  - Sign with release keystore (stored in GitHub secrets)
  - Upload to Google Play Console (internal testing track)
- Configure iOS build pipeline:
  - Set up Xcode environment on macOS runner
  - Build IPA for release
  - Sign with distribution certificate
  - Upload to TestFlight
- Automate version bumping (semantic versioning)
- Generate changelogs from commits
- **Acceptance Criteria:**
  - Android builds automatically on release tags
  - iOS builds automatically on release tags
  - Signed builds uploaded to stores
  - Version numbers auto-incremented
  - Changelogs generated
  - Build status visible in GitHub

**8.1.2: Set up Sentry Releases for Mobile Apps**
- Install Sentry CLI in mobile CI workflow
- Create Sentry releases for mobile builds
- Upload source maps for React Native/Capacitor
- Configure release tracking for mobile error correlation
- Associate commits to mobile releases
- **Acceptance Criteria:**
  - Mobile Sentry releases created automatically
  - Source maps uploaded for mobile builds
  - Mobile errors linked to specific releases
  - Release versions match app versions
  - Production mobile errors traceable to exact code

---

### Phase 9: Payments & Subscriptions 💳

**Priority:** CRITICAL - Revenue generation (after mobile CI/CD)

#### Epic 9.1: Stripe Integration for Web [$5/month, $50/year]

**Issues:**

**9.1.1: Set up Stripe Account & Products**
- Create Stripe account
- Create subscription products:
  - Monthly: $5/month
  - Yearly: $50/year
- Configure pricing in Stripe dashboard
- Set up test mode
- **Acceptance Criteria:**
  - Stripe account configured
  - Products created with correct pricing
  - Test mode enabled

**9.1.2: Update Subscription Schema**
- Update database schema for subscriptions
- Add tier enum (FREE, PREMIUM)
- Add status enum (ACTIVE, EXPIRED, CANCELED, TRIAL)
- Add provider enum (STRIPE, GOOGLE_PLAY, APPLE_IAP)
- Store expiresAt, startedAt, external subscription ID
- Create middleware to check subscription status
- **Acceptance Criteria:**
  - Schema supports multiple providers
  - Status tracking works
  - Middleware blocks premium features for free users

**9.1.3: Implement Stripe Checkout Flow**
- Install Stripe SDK
- Create checkout session endpoint (oRPC)
- Build checkout page with Stripe Elements
- Handle successful payment callback
- Update user subscription in database
- Send confirmation email
- **Acceptance Criteria:**
  - Checkout flow works end-to-end
  - Successful payments create subscription
  - User upgraded to PREMIUM tier
  - Test mode transactions succeed

**9.1.4: Implement Stripe Webhooks**
- Create webhook endpoint
- Verify Stripe signatures
- Handle events: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted
- Update database on each event
- Log all webhook events
- **Acceptance Criteria:**
  - Webhooks verified securely
  - Subscription status updated automatically
  - Cancellations handled
  - Webhook logs for debugging

---

## V1: POST-MVP FEATURES

### Phase 10: Offline-First Implementation 📱

**Priority:** HIGH - Make app work offline, free version offline-only, paid gets cloud sync

#### Epic 10.1: Offline-First Architecture

**Issues:**

**10.1.1: Implement IndexedDB for Offline Storage**
- Install Dexie.js for IndexedDB management
- Create IndexedDB schema for journal entries, prompts, user data
- Implement offline CRUD operations for journal entries
- Store entry drafts locally (auto-save as user types)
- Implement data synchronization queue
- Handle conflict resolution (local changes take precedence)
- Show offline/online indicators
- **Acceptance Criteria:**
  - IndexedDB initialized and working
  - Journal entries stored offline
  - Drafts auto-saved
  - Sync queue implemented
  - Offline/online status indicators
  - Conflicts resolved gracefully

**10.1.2: Free vs Paid Tier Logic**
- Implement tier checking middleware
- Free tier: offline-only, no cloud sync
- Premium tier: cloud sync enabled
- Show upgrade prompts for cloud features
- Implement data export for free users (GDPR compliance)
- **Acceptance Criteria:**
  - Free users blocked from cloud features
  - Premium users can sync data
  - Upgrade prompts shown appropriately
  - Data export works for free users

**10.1.3: Cloud Sync for Premium Users**
- Implement background sync when online
- Queue offline changes for upload
- Download changes from server
- Handle merge conflicts (user chooses or last-write-wins)
- Show sync status and progress
- Implement manual sync button
- **Acceptance Criteria:**
  - Offline changes sync when online
  - Server changes download automatically
  - Merge conflicts handled
  - Sync status visible to user
  - Manual sync works

**10.1.4: Network-Aware UI**
- Show offline/online status in UI
- Disable cloud features when offline
- Show cached data with "offline" indicators
- Implement retry mechanisms for failed requests
- **Acceptance Criteria:**
  - Network status clearly indicated
  - Offline features work seamlessly
  - Retry buttons for failed operations
  - Cached data clearly marked

---

### Phase 11: Search Implementation 🔍

**Priority:** MEDIUM - User-requested feature

#### Epic 11.1: Backend Search Implementation

**Issues:**

**11.1.1: Implement pg_textsearch with Trigram & BM25 Search**
- Create `journalEntries.search` oRPC endpoint
- Use pg_textsearch library (open-sourced) for advanced text search with trigram similarity and BM25 ranking
- Combine trigram similarity for fuzzy matching and BM25 for keyword relevance scoring
- Accept filters: keyword, dateFrom, dateTo, limit, offset
- Filter by userId (user can only search their entries)
- Return matching entries with highlighted snippets
- Order by relevance (BM25 score) or date
- Add database indexes for trigram and BM25 performance
- **Acceptance Criteria:**
  - Search returns relevant results
  - Date range filtering works
  - Pagination implemented
  - Query performance <500ms
  - Only user's entries returned
  - Full-text search indexes created

**11.1.2: Build Search UI**
- Create search page with search bar
- Add date range picker (from/to dates)
- Display results in list format
- Highlight matching keywords
- Show "no results" state
- Add clear filters button
- **Acceptance Criteria:**
  - Search bar easy to use
  - Date pickers functional
  - Results update on filter change
  - Keywords highlighted
  - Responsive on mobile

---

### Phase 12: Gamification System 🏆

**Priority:** MEDIUM - Increase engagement and retention

#### Epic 12.1: Streaks & Badges Implementation

**Issues:**

**12.1.1: Create Streak & Badge Tables**
- Create `UserStreak` table (userId, currentStreak, longestStreak, lastEntryDate)
- Create `Badge` table (id, name, description, iconUrl, milestoneValue)
- Create `UserBadge` junction table (userId, badgeId, awardedAt)
- Seed badges (7-day, 30-day, 100-day, 365-day streaks)
- Add migrations
- **Acceptance Criteria:**
  - Tables created with proper schema
  - Foreign keys configured
  - Badges seeded with data
  - Indexes on userId

**12.1.2: Implement Streak Calculation**
- Create background job (or hook on entry creation)
- Calculate if entry extends current streak
- Reset streak if >24h gap (timezone-aware)
- Update currentStreak and longestStreak
- Handle edge cases (multiple entries same day, timezone changes)
- Test streak logic thoroughly
- **Acceptance Criteria:**
  - Streak increments on consecutive days
  - Streak resets after missed day
  - Timezone-aware calculations
  - Multiple entries same day don't duplicate count

**12.1.3: Implement Badge Award Logic**
- Define badge metadata (names, descriptions, icons)
- Create or find badge icons/images
- Check if user qualifies for badges after each entry
- Award badges automatically
  - 7-day streak badge
  - 30-day streak badge
  - 100-day streak badge
  - 365-day streak badge
  - First entry badge
- Prevent duplicate awards
- **Acceptance Criteria:**
  - At least 5 badge types defined
  - Icons visually appealing
  - Awards triggered correctly
  - No duplicate awards

**12.1.4: Build Gamification oRPC Endpoints**
- `gamification.getStreak` - Get user's current streak
- `gamification.getBadges` - Get user's earned badges
- Include streak in user profile response
- **Acceptance Criteria:**
  - Endpoints return accurate data
  - Fast queries (<100ms)
  - User can only see their own streaks
  - Leaderboard optional for MVP

**12.1.5: Design Streak UI Component**
- Create streak display component
- Show current streak number prominently
- Display flame/fire icon (🔥)
- Show longest streak
- Add motivational message
- Animate streak increment
- Display in dashboard
- **Acceptance Criteria:**
  - Visually appealing design
  - Current streak prominent
  - Animation on streak increase
  - Responsive on mobile

---

### Phase 13: Advanced Features ✨

**Priority:** MEDIUM - Premium features & polish

#### Epic 13.1: Cloud Sync & Data Export

**Issues:**

**13.1.1: Implement Cloud Backup (Premium)**
- Set up S3 or Cloudflare R2 for storage
- Create backup API endpoint (premium users only)
- Encrypt journal data before upload (AES-256)
- Schedule automatic backups (daily)
- Add manual backup trigger
- Implement restore functionality
- **Acceptance Criteria:**
  - Premium users can backup
  - Free users blocked
  - Data encrypted
  - Automatic backups work
  - Restore tested and works

**13.1.2: Add Data Export (GDPR Compliance)**
- Create export endpoint
- Support JSON format (all user data)
- Support CSV format (entries only)
- Include prompts in export
- Add download button in settings
- Generate export asynchronously for large datasets
- **Acceptance Criteria:**
  - Export includes all user data
  - JSON format valid
  - CSV opens in Excel/Google Sheets
  - Download works
  - GDPR compliant

**13.1.3: Implement Account Deletion (GDPR)**
- Create account deletion endpoint
- Delete all user data (cascade)
- Remove from Stripe, Sentry, etc.
- Send confirmation email
- Add 30-day grace period (optional)
- Log deletions for compliance
- **Acceptance Criteria:**
  - All user data deleted
  - Third-party data removed
  - Confirmation sent
  - Irreversible after grace period
  - GDPR compliant

---

## V2: SCALING & POLISH

### Phase 14: Advertising for Free Tier 📢

**Priority:** MEDIUM - Monetize free users

#### Epic 14.1: Ad Integration

**Issues:**

**14.1.1: Select & Set Up Ad Provider**
- Choose between Google AdSense (web) + AdMob (mobile) OR alternatives
- Create accounts
- Get approval for app
- Create ad units
- **Acceptance Criteria:**
  - Provider selected
  - Account created
  - App approved for ads
  - Ad units created

**14.1.2: Integrate Ads into Web App**
- Install AdSense SDK
- Create ad components
- Place ads between entries (non-intrusive)
- Test ad display
- Handle ad blockers gracefully
- Ensure no ads for premium users
- **Acceptance Criteria:**
  - Ads display on web
  - Placement non-intrusive
  - Premium users see no ads
  - Ad blockers handled

**14.1.3: Integrate AdMob for Mobile**
- Install AdMob plugin (Capacitor)
- Configure Android ad units
- Configure iOS ad units
- Place banner or interstitial ads
- Test on devices
- Ensure no ads for premium users
- **Acceptance Criteria:**
  - Ads display on Android
  - Ads display on iOS
  - Placement appropriate
  - Premium users see no ads

**14.1.4: Implement Ad Compliance**
- Add GDPR consent for ads (EU users)
- Update privacy policy
- Test ad content appropriateness
- Monitor for policy violations
- **Acceptance Criteria:**
  - Ads compliant with policies
  - GDPR consent obtained
  - Privacy policy updated
  - No policy violations

---

### Phase 15: Performance Optimization ⚡

**Priority:** MEDIUM - Scale to 10,000+ users

#### Epic 15.1: Performance & Scalability

**Issues:**

**15.1.1: Add Database Indexes**
- Analyze slow queries (use pg_stat_statements)
- Add indexes on:
  - journal_entries(authorUserId, createdAt)
  - users(email)
  - subscriptions(userId, status)
  - user_schedules(userId, isActive)
- Add composite indexes where needed
- Test query performance improvement
- **Acceptance Criteria:**
  - Slow queries identified
  - Indexes added
  - Queries 10x faster
  - No over-indexing

**15.1.2: Set up CDN for Static Assets**
- Configure Cloudflare CDN
- Upload static assets (images, fonts, icons)
- Configure cache headers
- Update asset URLs to use CDN
- Test asset delivery
- Monitor cache hit rates
- **Acceptance Criteria:**
  - CDN configured
  - Assets served from CDN
  - Page load 50% faster
  - Cache headers correct

**15.1.3: Implement Redis for Caching**
- Install Redis
- Install ioredis
- Cache user sessions
- Cache prompts (1 hour TTL)
- Cache user streaks (5 min TTL)
- Implement cache invalidation
- **Acceptance Criteria:**
  - Redis configured
  - Sessions in Redis
  - API responses cached
  - Cache invalidation works
  - Reduces database load by 60%

**15.1.4: Optimize Frontend Bundle**
- Analyze bundle size (vite-bundle-analyzer)
- Implement code splitting
- Lazy load routes
- Optimize images (WebP, lazy loading)
- Tree-shake unused code
- **Acceptance Criteria:**
  - Bundle size reduced by 40%
  - Initial load time <2s
  - Lazy loading works
  - Lighthouse score >90

**15.1.5: Migrate to Kafka (If Needed for Scale)**
- Evaluate if Kafka is needed (only if >10k users and high event throughput)
- Set up managed Kafka cluster (e.g., Confluent Cloud, AWS MSK)
- Replace pg-tbus calls with Kafka client (kafkajs)
- Keep same event names and payload structures
- Update subscribers to use Kafka consumer API
- Set up monitoring and alerting
- Perform load testing
- **Acceptance Criteria:**
  - Kafka cluster running
  - Event publishers migrated to Kafka
  - Event subscribers migrated to Kafka consumers
  - Minimal business logic changes (pg-tbus designed for easy migration)
  - Event throughput handles production load
  - Monitoring dashboards operational

---

## Success Metrics

### MVP Launch (V0 - Current Status)
- [x] Users can sign in with Google (Better Auth)
- [x] Users can create journal entries (form & list view)
- [x] App installable as PWA (Vite PWA, service worker, install prompts)
- [x] Event-driven architecture (pg-tbus, cron jobs, notifications)
- [ ] Native mobile apps (Android + iOS) via Capacitor ⏳ Phase 7
- [ ] Users receive notifications with prompts ⏳ Phase 6 (SuprSend configured)
- [ ] Premium subscriptions live ($5/month, $50/year via Stripe) ⏳ Phase 9
- [x] 80% test coverage on backend (Vitest), E2E on frontend (Playwright)
- [x] CI/CD pipeline operational (GitHub Actions, Coolify)
- [x] Error monitoring & RUM active (Sentry, OpenTelemetry)
- [x] Coolify deployment automated

### Post-MVP (V1 Complete)
- [ ] Offline-first app (free offline-only, paid cloud sync)
- [ ] Search functionality implemented
- [ ] Gamification system (streaks & badges)
- [ ] Cloud sync & data export for premium users
- [ ] 1000+ registered users
- [ ] 40% Day 7 retention
- [ ] 5% free → premium conversion

### V2 Goals
- [ ] Ads displayed to free users
- [ ] 10,000+ registered users
- [ ] 99.9% uptime
- [ ] <2s average page load time
- [ ] Profitable (revenue > costs)

---

## Technical Stack Summary

### Backend
- **Runtime:** Node.js 22
- **Framework:** oRPC (HTTP server)
- **ORM:** Orchid ORM
- **Database:** PostgreSQL
- **Auth:** Better Auth (Google OAuth)
- **Validation:** Zod
- **Logging:** Pino
- **Monitoring:** Sentry, OpenTelemetry
- **Event Bus:** pg-tbus (Transactional Outbox Pattern) - built for easy Kafka migration
- **Architecture:** Event-driven with Transactional Outbox Pattern
- **Cron Jobs:** node-cron (scheduling)
- **Notifications:** SuprSend (transactional notifications), FCM/APNs (push - future)
- **Cron Jobs:** node-cron (per-minute scheduling with mutex)
- **Webhooks:** pg-tbus tasks with retry logic and audit logging
- **Payments:** Stripe, Google Play Billing, Apple IAP
- **Testing:** Vitest

### Frontend
- **Framework:** React 19
- **Router:** React Router 7
- **State:** TanStack Query (React Query)
- **UI:** Material UI (MUI)
- **Forms:** React Hook Form + Zod
- **PWA:** Vite PWA Plugin (Workbox)
- **Mobile:** Capacitor (iOS + Android)
- **Testing:** Vitest + React Testing Library
- **Monitoring:** Sentry RUM

### DevOps
- **CI/CD:** GitHub Actions
- **Deployment:** Coolify
- **Code Quality:** Biome (lint + format), Commitlint, Husky
- **Monorepo:** Turborepo + Yarn Workspaces

---

## Event-Driven Architecture

### Overview

The application uses an **event-driven architecture** to decouple services and enable scalable, asynchronous operations. Events are the source of truth for side effects like notifications, analytics, and third-party integrations.

### 📚 Key References & Best Practices

**IMPORTANT:** Use **pg-tbus** for transactional event publishing with PostgreSQL.

**Reference Articles:**
1. **Type-Safe Event-Driven with PubSub & PostgreSQL**
   - Link: https://dev.to/encore/building-type-safe-event-driven-applications-in-typescript-using-pubsub-cron-jobs-and-postgresql-50jc
   - Key Takeaways: Type-safe event definitions, PostgreSQL as event store, structured logging

2. **Scalable Event-Driven Node.js Services**
   - Link: https://itnext.io/how-to-create-simple-and-scalable-event-driven-nodejs-services-14e9dee75a74
   - Key Takeaways: Message patterns, error handling, retry strategies, monitoring

**Library Choice: pg-tbus**
- **pg-tbus** - Transactional Outbox Pattern for PostgreSQL
  - ✅ Built for **events**, not jobs (unlike pg-boss)
  - ✅ **Atomic event publishing**: Publish events in same transaction as business data
  - ✅ **Transactional integrity**: No ghost notifications if transaction fails
  - ✅ **Multiple subscribers**: Many services can listen to one event (like Kafka)
  - ✅ **Outbox pattern**: Industry-standard approach for event-driven systems
  - ✅ **Easy Kafka migration**: API similar to message brokers
  - ✅ No additional infrastructure (uses existing PostgreSQL)
  - ✅ Auto-creates outbox tables
  - ✅ Built-in polling and relay (no custom polling needed)
  
**Why NOT pg-boss:**
- pg-boss is for "jobs" (background tasks), not "events" (integration events)
- Harder to achieve transactional integrity
- One job = One worker (not pub/sub model)
- Clunky to migrate to Kafka later

### MVP Implementation (Transactional Outbox Pattern with pg-tbus)

For MVP, use **pg-tbus** library for transactional event publishing:

**Why pg-tbus?**
- ✅ **Transactional Outbox Pattern**: Industry-standard for event-driven systems
- ✅ **Atomic publishing**: Events published in SAME transaction as business data
- ✅ **No ghost notifications**: Transaction rollback = event not sent
- ✅ **Pub/Sub model**: Multiple subscribers per event (like Kafka)
- ✅ Built for events, not jobs
- ✅ No additional infrastructure (uses PostgreSQL)
- ✅ Auto-creates outbox tables
- ✅ Built-in polling and relay (no custom code needed)
- ✅ **Easy Kafka migration**: API similar to message brokers

**Tables (created automatically by pg-tbus):**
- `tbus_outbox` - Outbox for pending events
- `tbus_inbox` - Inbox for consumed events (idempotency)
- `tbus_subscriptions` - Event subscriptions

**Components:**
- **Event Publishers**: Core modules (auth, journal-entries, subscriptions) publish events using `tbus.publish()`
- **Event Subscribers**: Services (notifications, analytics) subscribe using `tbus.subscribe()`
- **Outbox Relay**: pg-tbus auto-polls outbox and delivers events to subscribers
- **Type Safety**: Zod schemas for event payload validation
- **Transactional Integrity**: Events published within database transactions

### Core Events

| Event Type | Payload | Subscribers |
|------------|---------|-------------|
| `user.created` | `{ userId, email, createdAt }` | notifications (welcome email) |
| `user.deleted` | `{ userId, deletedAt }` | notifications, cleanup services |
| `journal_entry.created` | `{ entryId, userId, createdAt }` | gamification (streak tracking) |
| `schedule.updated` | `{ userId, schedule }` | notification scheduler |
| `subscription.updated` | `{ userId, tier, status }` | notifications (confirmation), access control |
| `notification.scheduled` | `{ userId, type, channel, payload }` | notifications (email/push sender) |

### Example Code (Using pg-tbus)

**Installing pg-tbus:**
```bash
yarn add pg-tbus
```

**Setting up pg-tbus:**
```typescript
// apps/backend/src/modules/events/tbus.ts
import { createTbus } from 'pg-tbus';
import { db } from '../../db/config';

export const tbus = createTbus({
  db: db, // OrchidORM database instance
  schema: 'public' // or your schema name
});

// Start the outbox relay (polls for events and delivers to subscribers)
await tbus.start();
```

**Publishing Events (Transactionally):**
```typescript
// In auth module after user signup - ATOMIC with database transaction
import { db } from '../../db/config';
import { tbus } from '../events/tbus';
import { UserCreatedEvent } from '../events/event_types';

// Everything in ONE transaction
await db.transaction(async (tx) => {
  // 1. Save user to database
  const user = await tx.users.create({
    email: 'user@example.com',
    name: 'John Doe'
  });
  
  // 2. Publish event in SAME transaction
  await tbus.publish('user.created', {
    userId: user.id,
    email: user.email,
    createdAt: new Date()
  }, { tx }); // Pass transaction to ensure atomicity
  
  // If transaction fails, BOTH user creation AND event are rolled back
  // No ghost notifications!
});
```

**Subscribing to Events:**
```typescript
// In notification module
import { tbus } from '../events/tbus';
import { UserCreatedEvent } from '../events/event_types';

// Multiple subscribers can listen to same event
await tbus.subscribe<UserCreatedEvent>('user.created', async (event) => {
  await sendWelcomeEmail(event.payload.email);
});

// Another subscriber for analytics
await tbus.subscribe<UserCreatedEvent>('user.created', async (event) => {
  await trackUserSignup(event.payload.userId);
});
```

### Future Migration to Kafka (When Needed)

**pg-tbus is built for easy Kafka migration:**

When you reach scale (10k+ users, high event throughput), migrate to Kafka by:
1. Swap pg-tbus with Kafka client (kafkajs)
2. Keep same event names and payloads
3. Update subscribers to use Kafka consumer API

**Why pg-tbus makes migration easy:**
- Subscription model matches Kafka (pub/sub, multiple subscribers)
- Event patterns are message-broker-like
- Business logic stays unchanged
- Only swap the "driver"

**No detailed migration planning needed now** - pg-tbus design ensures minimal refactoring when the time comes.

### Design Principles (Transactional Outbox Pattern)

1. **Transactional Integrity** - ALWAYS publish events within database transactions (using pg-tbus)
2. **No Ghost Notifications** - If transaction fails, event is NOT published (atomic guarantee)
3. **Type Safety First** - Use TypeScript + Zod for event payload validation
4. **Events are immutable** - Never modify published events
5. **At-least-once delivery** - Events may be processed multiple times (idempotency required)
6. **Async by default** - Event relay delivers events asynchronously to subscribers
7. **Event versioning** - Include schema version in payload for backwards compatibility
8. **Structured logging** - Log event ID, type, timestamp, processing time for tracing
9. **Idempotency keys** - Use unique keys (e.g., `${eventType}:${resourceId}`) to prevent duplicate processing
10. **Pub/Sub model** - Multiple subscribers can listen to same event (like Kafka)

---

## Technical Debt & Future Enhancements

### Known Limitations (OK for MVP)
- No Redis initially (sessions in PostgreSQL - migrate in V2)
- pg-tbus event bus (migrate to Kafka when scaling beyond 10k users)
- Basic conflict resolution for offline sync (backend wins)
- Simple daily prompt rotation (no ML personalization)

### Future Enhancements (V3+)
- AI-powered prompt personalization (based on user's writing)
- Voice journaling (speech-to-text)
- Rich text editor (formatting, images)
- Multiple journals/categories
- Social features (share entries with friends, prompts marketplace)
- Export to PDF with beautiful formatting
- Desktop apps (Tauri)
- Integrations (Notion, Obsidian, Day One)
- Analytics dashboard for users (word count, sentiment analysis)
- Habit tracking integration
- Mood tracking
- Journaling templates

---

## Development Guidelines

### Code Style (Enforced by Biome)
- **Formatting:** Tabs (NOT spaces), 100 char line width, double quotes
- **Types:** NO `any` or `as unknown` - use strict TypeScript
- **Imports:** Direct imports (NO barrel exports/index files)
- **Naming:**
  - camelCase for code
  - snake_case for database tables/columns
  - Descriptive IDs (`userId` not `id`, `authorUserId` not `authorId`)
- **Error Handling:** Throw standard errors - centralized error formatter converts to HTTP responses

### Git Workflow
- **Branches:** `main` (production), `develop` (staging), `feat/*`, `fix/*`, `chore/*`
- **Commits:** Conventional commits (feat, fix, docs, style, refactor, test, chore)
- **PRs:** Require CI passing, 1+ approval, no merge conflicts

### Testing Requirements
- **Backend:** >80% coverage on routers and critical logic
- **Frontend:** >70% coverage on components and pages
- **All PRs:** Must include tests for new features

---

**Last Updated:** 2026-01-01
**Next Review:** After V0 completion
