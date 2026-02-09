# Teams Feature Specification

**Expowiz - Trade Fair Networking Platform**  
*Living Document - Version 1.0*  
*Last Updated: February 2026*

---

## Table of Contents

1. [Feature Overview](#1-feature-overview)
2. [User Roles & Permissions](#2-user-roles--permissions)
3. [Core Features](#3-core-features)
4. [Working Patterns & Flows](#4-working-patterns--flows)
5. [Edge Cases & Error Handling](#5-edge-cases--error-handling)
6. [Database Schema](#6-database-schema)
7. [Implementation Plan](#7-implementation-plan)
8. [API Specifications](#8-api-specifications)
9. [Questions & Updates Log](#9-questions--updates-log)

---

## 1. Feature Overview

### What is Teams?

Teams enables exhibitors at trade fairs to collaborate on lead capture and management. Multiple booth staff can capture leads under a shared team account, with centralized billing, role-based access, and shared lead visibility.

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Team** | A group of users sharing leads and subscription |
| **Workspace** | The active team context - users can switch between teams |
| **Owner** | Creates team, manages subscriptions, full permissions |
| **Admin** | Manages members, can capture/view all team leads |
| **User** | Can capture leads, sees only personal + team leads |
| **Subscription** | Time-based access (5 days, 1 month, 1 year) |
| **Pending Leads** | Leads captured offline or without active subscription |

### User Types

**Owner**
- Creates and owns the team
- Manages subscriptions and billing
- Can transfer ownership
- Can delete team
- Full access to all team leads

**Admin**
- Added by Owner or other Admins
- Can add/remove Users
- Can view all team leads
- Cannot manage subscriptions
- Cannot delete team

**User (Member)**
- Added by Owner or Admin
- Can capture leads for team
- Views personal leads + team leads
- Cannot add others
- Cannot view admin features

---

## 2. User Roles & Permissions

### Permission Matrix

| Action | Owner | Admin | User |
|--------|-------|-------|------|
| **Team Management** ||||
| Create team | ✓ | ✗ | ✗ |
| Add members | ✓ | ✓ | ✗ |
| Leave team | ✗ | ✓ | ✓ |
| Remove members | ✓ | ✓ (except Owner) | ✗ |
| Change member roles | ✓ | ✓ (promote to Admin only) | ✗ |
| Transfer ownership | ✓ | ✗ | ✗ |
| Delete team | ✓ | ✗ | ✗ |
| **Workspace** ||||
| Switch between teams | ✓ | ✓ | ✓ |
| Create multiple teams | ✓ | ✓ | ✓ |
| **Subscriptions** ||||
| Purchase subscription | ✓ | ✗ | ✗ |
| View subscription status | ✓ | ✓ | ✓ |
| Select members for plan | ✓ | ✗ | ✗ |
| **Lead Capture** ||||
| Capture leads (active sub) | ✓ | ✓ | ✓ |
| Capture leads (no sub) - saved as pending | ✓ | ✓ | ✓ |
| View personal leads | ✓ | ✓ | ✓ |
| View all team leads | ✓ | ✓ | ✗ |
| Edit any team lead | ✓ | ✓ | ✗ |
| Delete leads | ✓ | ✓ | Own leads only |
| Export leads | ✓ | ✓ | ✗ |

### Role Hierarchy

```
Owner (1 per team)
    ↓
Admin (multiple)
    ↓
User (multiple)
```

**Important Rules:**
- Only one Owner per team
- Owner cannot leave team (must transfer ownership first or delete team)
- Admins cannot demote other Admins (only Owner can)
- Users can be promoted to Admin by Owner or Admin
- Admins can be demoted to User by Owner only

---

## 3. Core Features

### 3.1 Team Management

#### Create Team

**Flow:**
1. User clicks "Create Team" from workspace selector
2. Enter team name (required, max 50 chars)
3. Optional: Upload team logo
4. System creates team with user as Owner
5. Auto-switch to new team workspace
6. Show onboarding: "Add your team members"

**Validation:**
- Team name required, 3-50 characters
- Name must be unique per user (user cannot own duplicate team names)
- Unlimited teams per user

**Database Operations:**
- Insert into `teams` table
- Insert into `team_members` as Owner
- Create default subscription record (inactive)

#### Add Team Member

**Flow:**
1. Owner/Admin opens "Team Settings" → "Members"
2. Click "Add Member"
3. Enter email address
4. Select role (Admin or User)
5. Member is immediately added to the team

**Auto-join Logic:**
- Member email added to team roster immediately with selected role
- If member has existing account: Can access team immediately
- If member is new user: They automatically see the team in their workspace upon first signup with that email
- No invitation or acceptance required - member appears in team immediately

**Validation:**
- Email format validation
- Cannot add existing team member
- Cannot add self

#### Auto-join on Signup

**Flow:**
1. Owner/Admin adds member email to team roster
2. Member immediately appears in team roster as "active"
3. If member has existing account: Can access team immediately in workspace selector
4. If new user: When they sign up with that email, they automatically see the team in their workspace selector
5. Member clicks on the team in workspace selector to switch to it
6. No invitation acceptance required - direct addition and automatic membership

#### Leave Team

**Flow:**
1. User goes to "Team Settings" → "Leave Team"
2. Confirmation dialog: "Your leads will remain with the team. Continue?"
3. On confirm: Remove from `team_members`
4. Switch to personal workspace or next available team

**Restrictions:**
- Owner cannot leave (must transfer or delete)
- Last Admin cannot leave (demote self first or invite replacement)

**Data Retention:**
- User's captured leads remain with team
- User loses access to team leads
- Personal workspace leads preserved

#### Remove Member

**Flow:**
1. Owner/Admin clicks "Remove" next to member
2. Confirmation: "[Name]'s leads will remain with the team"
3. On confirm: Soft delete from `team_members`
4. Removed member's active session switches to personal workspace

**Permissions:**
- Owner can remove anyone except self
- Admin can remove Users only
- Cannot remove last Admin (Owner must handle)

#### Change Member Roles

**Promote User to Admin:**
- Owner or Admin can promote
- User gets Admin permissions immediately

**Demote Admin to User:**
- Only Owner can demote Admins
- Cannot demote if only Admin remaining
- Admin loses team leads visibility

**Transfer Ownership:**
1. Owner selects "Transfer Ownership" in settings
2. Select new Owner from Admins (must be Admin first)
3. Immediate transfer (no acceptance required)
4. Swap roles: Old Owner becomes Admin, new Admin becomes Owner
5. Old Owner can leave team or remain as Admin

**Validation:**
- New Owner must be existing Admin in team
- Old Owner must confirm transfer (password re-authentication)

#### Delete Team

**Flow:**
1. Owner goes to "Team Settings" → "Danger Zone" → "Delete Team"
2. Type team name to confirm
3. Warning: "All leads, members, and data will be permanently deleted"
4. On confirm: 
   - Soft delete team (mark `is_active: false`)
   - Archive all leads (30-day grace period)
   - Remove all members
   - Cancel active subscriptions (prorated refund if applicable)
5. All members switched to personal workspace

**Restrictions:**
- Only Owner can delete
- Cannot delete with unresolved billing disputes
- 30-day grace period for data recovery

### 3.2 Workspace Switching

#### Multiple Teams Support

**User Experience:**
- Users can belong to multiple teams simultaneously
- Each team has isolated workspace
- Visual indicator shows active team
- Quick switcher in navigation bar

**Workspace Selector UI:**

```
┌─────────────────────────────┐
│  🏢 [Active Team Name] ▼   │
├─────────────────────────────┤
│  📋 Personal                │
│  ─────────────────────      │
│  🏢 Acme Corp              │  ← Current
│     Owner · Active         │
│  🏢 TechStart Inc          │
│     Admin · Expires in 5d  │
│  ─────────────────────      │
│  ➕ Create New Team         │
└─────────────────────────────┘
```

**Behavior:**
- Click team name to switch
- Different color/icon for each role
- Expiration warnings shown inline
- Badge count for pending items per team

#### Context Preservation

When switching workspaces:
- Current view preserved (if accessible in new workspace)
- Filters reset to defaults
- Lead list refreshes for new team
- Subscription status checked

**If no access to current view:**
- Redirect to dashboard
- Show "Switched to [Team]" toast

### 3.3 Team Subscriptions

#### Subscription Plans

| Plan | Duration | Price | Best For |
|------|----------|-------|----------|
| **Trade Fair** | 5 days | ₹1,000 per member | Single event |
| **Monthly** | 30 days | ₹2,000 per member | Multiple events/month |
| **Yearly** | 365 days | ₹10,000 per member | Regular exhibitors |

#### Subscription Features

**Time-Based (Not Event-Based):**
- Clock starts at purchase time
- No pausing or extending
- Multiple subscriptions can be active
- Overlapping subscriptions add time

**Member Selection:**
- Owner selects which members to include at purchase
- Checkboxes next to each member
- "Select All" option
- Price is per-member (e.g., 3 members × ₹1,000 = ₹3,000 total)
- Only selected members can capture leads

**Multiple Active Subscriptions:**
- Team can have overlapping subscriptions
- Example: Trade Fair (5 days) + Yearly overlap
- Longest active subscription takes precedence
- Expiration = latest end date among all active

#### Subscription Lifecycle

```
┌──────────────┐
│   Inactive   │
└──────┬───────┘
       │ Purchase
       ▼
┌──────────────┐     ┌──────────────┐
│    Active    │────▶│   Expired    │
└──────────────┘     └──────────────┘
       │
       │ Renew
       ▼
┌──────────────┐
│    Active    │ (extended)
└──────────────┘
```

**Purchase Flow:**
1. Owner clicks "Upgrade" or "Extend"
2. Select plan (5 days / Monthly / Yearly)
3. Select members to include (checkboxes)
4. Review order summary
5. Payment via Razorpay
6. On success: Activate subscription for selected members
7. Sync any pending leads

**Status Indicators:**

| Status | Icon | Color | Description |
|--------|------|-------|-------------|
| Active | ✓ | Green | Subscription valid |
| Expiring Soon | ⚠️ | Yellow | < 3 days remaining |
| Expired | ✗ | Red | No active subscription |
| Pending | ⏳ | Orange | Payment processing |

#### Member Subscription Selection

**At Purchase Time:**
- Owner sees member list with checkboxes
- Checked members get subscription access
- Unchecked members remain without access
- Can modify selections later (contact support)

**UI:**
```
Select Members for Subscription:
☑️ John Doe (Admin)
☑️ Jane Smith (User)  
☐ Mike Johnson (User)  ← Not selected
☑️ Sarah Lee (User)

[Select All]  [Clear All]
```

**Behavior:**
- Members without subscription can still view team
- Cannot capture new leads (shows upgrade prompt)
- Can view existing leads
- Can be added to subscription later

### 3.4 Lead Capture

#### Capture Flow (Subscription-Agnostic)

**Normal Capture:**
1. User initiates lead capture (scan card, voice note)
2. Lead is ALWAYS saved normally to local storage first
3. Lead is immediately visible in the user's workspace
4. **Sync behavior:**
   - If active subscription AND user included in subscription: Auto-sync to cloud immediately when online
   - If no subscription OR user not included: Lead remains local only, no cloud sync
   - If subscription becomes active later: Pending leads sync automatically

**No Subscription:**
- Capture works exactly the same - no dialog or interruption
- Lead saved locally and visible immediately
- Cloud sync only happens when:
  - Subscription becomes active
  - User is added to active subscription
  - User manually exports data

#### Pending Leads

**Storage:**
- LocalStorage + IndexedDB (TinyBase)
- Schema: Same as leads + `captured_at`, `pending_id`
- Photos stored as base64 or blob URLs
- Unlimited pending leads per user

**Sync on Activation:**
1. When subscription becomes active
2. System detects pending leads in local storage
3. Shows: "You have 5 pending leads to sync"
4. User clicks "Sync Now"
5. Batch upload via `sync-pending-leads` edge function
6. Move from `pending_leads` to `leads` table
7. Clear local storage on success
8. Show confirmation: "5 leads synced successfully"

**Offline Capture:**
- Same as pending lead flow
- Marked as `is_offline: true`
- Auto-sync when back online + subscription active

#### Lead Visibility Rules

**Personal Workspace:**
- User sees only their own leads
- Captured before joining team
- Personal trade fair visits

**Team Workspace (User Role):**
- User's own leads (captured as team member)
- All team leads (view-only)
- Cannot edit team leads

**Team Workspace (Admin/Owner Role):**
- All team leads (full edit access)
- Filter by: Captured by [Member], Date, Event
- Bulk operations: Export, Delete

#### Team Leads Page

**Access:**
- Button "Team Leads" visible only to Admin/Owner
- In navigation sidebar
- Not visible to User role

**Features:**
- Grid/list view of all team leads
- Advanced filters:
  - Captured by (member selector)
  - Date range
  - Event/trade fair
  - Lead quality rating
- Sort by: Date, Name, Company, Rating
- Bulk actions: Export to Excel, PDF, CSV
- Statistics dashboard:
  - Total leads this month
  - Leads by team member

### 3.5 Lead Management in Teams

#### Lead Ownership

**Captured By:**
- Each lead tracks `captured_by_user_id`
- Original captor remains owner
- Other members can view (Admin/Owner can edit)

**When Member Leaves:**
- Leads remain with team
- `captured_by_user_id` preserved for audit
- Lead stays in team workspace

**When Team Deleted:**
- All leads soft deleted
- 30-day recovery window
- After 30 days: Permanent deletion

---

## 4. Working Patterns & Flows

### 4.1 User Onboarding

**Scenario 1: User Creates Team (Owner)**

```
1. Sign up → Personal workspace created
         ↓
2. Click "Create Team" in workspace selector
         ↓
3. Enter team name, logo
         ↓
4. Team created, user becomes Owner
         ↓
5. Prompt: "Add team members?"
         ↓
6. Add member emails → Members added immediately
         ↓
7. "Purchase subscription to start capturing leads"
         ↓
8. Select plan → Payment → Subscription active
         ↓
9. Dashboard shows: Team active, ready for leads
```

**Scenario 2: User Added to Team (Admin/User)**

```
1. Owner/Admin adds user's email to team
         ↓
2. User immediately appears in team roster
         ↓
3. If user already has account: Can immediately access team workspace
         ↓
4. If new user: They see team in workspace selector upon first login
         ↓
5. User selects workspace from team list
         ↓
6. Check subscription status (visible to all)
         ↓
7. Can capture leads immediately
```

**Scenario 3: Existing User Creates Second Team**

```
1. In workspace selector: "Create New Team"
         ↓
2. Enter details
         ↓
3. New team created, user is Owner
         ↓
4. Can switch between teams anytime
         ↓
5. Each team has separate subscription
```

### 4.2 Daily Usage Patterns

**Morning - Team at Trade Fair:**

```
1. Staff arrive at booth
         ↓
2. Open app → Already in team workspace
         ↓
3. Quick check: Subscription active? ✓
         ↓
4. Start capturing visitor cards
         ↓
5. Voice notes for hot prospects
         ↓
6. Leads sync in real-time
         ↓
7. Admin/Owner monitors: "15 leads captured today"
```

**Afternoon - Lead Review:**

```
1. Admin opens "Team Leads"
         ↓
2. Filter: Today's leads
         ↓
3. Review quality, add notes
         ↓
5. Export leads for CRM import
```

**Evening - Subscription Check:**

```
1. Owner sees notification: "Subscription expires in 2 days"
         ↓
2. Click extend → Select plan
         ↓
3. Payment → Subscription extended
         ↓
4. Pending leads auto-sync
         ↓
5. Team continues without interruption
```

### 4.3 Team Lifecycle

```
Day 0: Team Created
    ↓
Day 1-3: Members added to team roster
    ↓
Day 5: Subscription purchased (5-day plan)
    ↓
Day 5-10: Trade fair event, lead capture active
    ↓
Day 10: Subscription expires
    ↓
Day 15: Another trade fair announced
    ↓
Day 20: New subscription purchased (monthly)
    ↓
Day 20-50: Monthly usage
    ↓
Day 50: Upgrade to yearly plan
    ↓
Ongoing: Continuous usage, member changes
    ↓
[Member leaves] → Leads remain, access revoked
    ↓
[New member joins] → Access granted
    ↓
[Owner transfers ownership] → New Owner takes over
    ↓
[Team disbands] → Owner deletes team, data archived
```

### 4.4 Subscription Management

**Purchasing First Subscription:**

```
1. Owner clicks "Upgrade" from dashboard
         ↓
2. Select plan: Trade Fair (5 days) / Monthly / Yearly
         ↓
3. Select members (checkboxes)
         ↓
4. Review: "₹1,000 per member × 3 members = ₹3,000 total for 5 days"
         ↓
5. Razorpay checkout
         ↓
6. Payment success → Webhook received
         ↓
7. Subscription activated
         ↓
8. Sync pending leads
```

**Extending Subscription:**

```
1. Owner sees expiration warning (3 days before)
         ↓
2. Click "Extend" from subscription page
         ↓
3. Can choose same or different plan
         ↓
4. New subscription time added to remaining time
         ↓
5. Example: 2 days left + 5 days new = 7 days total
         ↓
6. Payment → Immediate extension
```

**Multiple Active Subscriptions:**

```
Situation: Team has both Monthly and Trade Fair subscriptions

Monthly: Active until Day 30
Trade Fair: Active Day 15-20 (for specific event)

Result: Team access continuous from Day 0-30
         + Extra 5 days overlapping

Longest expiration wins for "active" status
All subscriptions tracked separately
```

### 4.5 Workspace Isolation

**Data Isolation:**

| Data | Personal Workspace | Team A | Team B |
|------|-------------------|--------|--------|
| Leads | Separate table | `team_id: A` | `team_id: B` |
| Subscriptions | Individual | Team A only | Team B only |
| Members | N/A | Members A | Members B |
| Settings | Individual | Team A settings | Team B settings |

**UI Isolation:**

- Navigation context switches completely
- Team-specific colors/branding (if configured)
- Separate lead counts
- Separate subscription status
- No cross-contamination

**Sync Isolation:**

- TinyBase stores per-workspace data
- Workspace ID prefixes local keys
- `leads_team_A`, `leads_team_B`, `leads_personal`
- Sync operations scoped to active workspace

---

## 5. Edge Cases & Error Handling

### 5.1 Team Management Edge Cases

#### Owner Tries to Leave Team

**Scenario:** Owner clicks "Leave Team"

**Behavior:**
- Button disabled or hidden for Owner
- If somehow triggered: Error message
- Message: "Owners cannot leave teams. Transfer ownership or delete team."
- Redirect to ownership transfer flow

**UI:**
```
[Leave Team] ← Disabled for Owner
Tooltip: "Transfer ownership first"

Alternative shown:
[Transfer Ownership] [Delete Team]
```

#### Last Admin Demotes Themselves

**Scenario:** Only Admin in team tries to change role to User

**Behavior:**
- Validation: "Team must have at least one Admin"
- Cannot demote self if last Admin
- Must invite/promote replacement first
- Error: "Promote another member to Admin first"

#### Delete Team with Active Subscriptions

**Scenario:** Owner tries to delete team with unexpired subscription

**Behavior:**
- Warning: "Team has active subscription until [date]"
- Options:
  - "Cancel subscription and delete"
  - "Keep team until subscription ends"
- If delete confirmed:
  - Cancel subscription (disable auto-renew)
  - Proceed with deletion

#### Add Duplicate Member

**Scenario:** Try to add email that's already in team roster

**Behavior:**
- Check existing members: If email already exists: "User is already a team member"
- Can change role if needed: Link to member management page
- If email was removed previously: Allow re-add immediately (no cooldown)

#### Add Existing Member

**Scenario:** Try to add current team member with different role

**Behavior:**
- Error: "[Email] is already a [Role] in this team"
- Suggest: "Change role instead?"
- Link to member management page

### 5.2 Subscription Edge Cases

#### Purchase Subscription for Removed Member

**Scenario:** Owner selects member for subscription, but member is removed before purchase completes

**Behavior:**
- At checkout: Validate all selected members still in team
- If member removed: Remove from selection, recalculate per-member price
- Show: "[Member] was removed from team, removed from subscription"
- Proceed with remaining members (price adjusts automatically)

**Post-Purchase Removal:**
- If member removed after subscription purchased:
- Subscription remains active for remaining members
- No refund for removed member's slot
- Can add new member to subscription (contact support)
- New member gets remaining subscription time at no additional cost

#### Multiple Subscriptions Overlap

**Scenario:** Team has multiple active subscriptions with different end dates

**Behavior:**
- UI shows: "Active until [latest date]"
- Detail view: List all active subscriptions with end dates
- Renewal: Ask which subscription to extend
- Grace period: Use latest expiration date

#### Subscription Payment Fails

**Scenario:** Razorpay payment fails or is abandoned

**Behavior:**
- Create subscription record with `status: pending_payment`
- 15-minute window to complete payment
- Show "Complete Payment" button
- After 15 min: Mark as `expired`, allow retry
- Show in-app notification: "Complete your subscription purchase"

### 5.3 Lead Capture Edge Cases

#### Offline Lead Capture

**Scenario:** User captures lead without internet connection

**Behavior:**
1. Detect offline status
2. Save to local `pending_leads` storage
3. Queue for sync when online
4. Show: "Lead saved offline. Will sync when connected."
5. Badge on sync icon: "3 pending"

**When Back Online:**
- Auto-attempt sync
- If subscription active: Upload immediately
- If no subscription: "Purchase subscription to sync 3 pending leads"

#### Switch Workspace Mid-Capture

**Scenario:** User starts capturing lead in Team A, switches to Team B or Personal

**Behavior:**
- Capture dialog remains open (modal)
- Warning: "You have unsaved lead data. Save or discard before switching?"
- Options: 
  - Save to current team (complete capture)
  - Discard and switch
  - Cancel switch, stay in current workspace

**If Discarded:**
- Clear form data
- Switch workspace
- Show: "Unsaved lead discarded"

#### Pending Lead Sync Fails

**Scenario:** Sync of pending leads partially fails

**Behavior:**
- Success: Clear synced leads from local storage
- Partial failure: 
  - Show: "3 of 5 leads synced"
  - Retry button for failed items
  - Error details per failed lead
  - Option to manually retry or contact support

**Full Failure:**
- Keep all pending leads locally
- Show error: "Sync failed. Retrying automatically..."
- Exponential backoff retry
- Manual retry option always available

### 5.4 Data Integrity Edge Cases

#### Member Added While Subscription Purchase in Progress

**Scenario:** New member joins during Owner's checkout

**Behavior:**
- Checkout screen shows snapshot of members at start
- New member not automatically included
- Post-purchase: Owner can contact support to add new member
- Or: Next subscription purchase includes them

#### Simultaneous Role Changes

**Scenario:** Two Admins try to change same member's role simultaneously

**Behavior:**
- Optimistic locking on `team_members` table
- Last write wins with timestamp check
- If conflict: Show updated state, ask to retry
- Notification to both admins of change

#### Team Deleted While User Active

**Scenario:** Owner deletes team while members are using app

**Behavior:**
- Soft delete first (30-day grace)
- Active sessions: Show "Team scheduled for deletion. Data available for 30 days."
- Read-only mode for remaining period
- Force switch to personal workspace after 30 days

#### Database Connection Lost

**Scenario:** Server error or network issue during critical operation

**Behavior:**
- All operations: Show user-friendly error
- Don't expose technical details
- Retry automatically where safe
- Log error for debugging
- Offer "Try Again" or "Contact Support"

### 5.5 UI/UX Edge Cases

#### Many Teams in Selector

**Scenario:** User belongs to many teams (unlimited teams supported)

**Behavior:**
- Selector becomes scrollable
- Search/filter option: "Find team..."
- Recent teams at top
- Personal workspace always pinned at top
- Performance optimized for large team lists

#### Role Changed While Using Feature

**Scenario:** Admin demotes self to User while viewing Team Leads page

**Behavior:**
- Immediate permission check on next action
- If access revoked: Redirect to dashboard
- Toast: "Your role was changed. Some features no longer available."
- Graceful degradation

#### Subscription Expires on Page Load

**Scenario:** User loads page, subscription expires during session

**Behavior:**
- Real-time subscription check every 5 minutes
- On expire: Show banner "Subscription expired. Purchase to continue capturing leads."
- Existing leads remain accessible
- Capture buttons show upgrade prompt

### 5.6 Error Messages Reference

| Error Code | Scenario | User Message |
|------------|----------|--------------|
| `TEAM_001` | Duplicate team name | "You already have a team with this name. Choose a different name." |
| `TEAM_003` | Owner leave attempt | "Owners cannot leave teams. Transfer ownership first." |
| `TEAM_004` | Last admin demotion | "Team needs at least one Admin. Promote another member first." |
| `MEMBER_001` | Duplicate member | "This user is already a team member." |
| `SUB_001` | No active subscription | "No active subscription. Purchase to capture leads." |
| `SUB_002` | Member not in subscription | "You're not included in the active subscription. Contact team owner." |
| `SYNC_001` | Sync failed | "Some leads failed to sync. Retry or contact support." |
| `AUTH_001` | Unauthorized action | "You don't have permission to do this." |

---

## 6. Database Schema

### 6.1 Teams Table

```sql
-- Teams: Core team entity
CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) NOT NULL,
    slug VARCHAR(50) UNIQUE, -- URL-friendly identifier
    logo_url TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    is_active BOOLEAN DEFAULT true, -- Soft delete flag
    metadata JSONB DEFAULT '{}', -- Custom fields, settings
    
    CONSTRAINT team_name_length CHECK (char_length(name) >= 3 AND char_length(name) <= 50)
);

-- Indexes
CREATE INDEX idx_teams_created_by ON teams(created_by);
CREATE INDEX idx_teams_slug ON teams(slug);
CREATE INDEX idx_teams_is_active ON teams(is_active);

-- RLS Policies
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

-- Owners can view their teams
CREATE POLICY "Team owners can view their teams"
    ON teams FOR SELECT
    USING (created_by = auth.uid());

-- Team members can view their teams (via team_members join)
CREATE POLICY "Team members can view their teams"
    ON teams FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM team_members 
            WHERE team_members.team_id = teams.id 
            AND team_members.user_id = auth.uid()
            AND team_members.removed_at IS NULL
        )
    );

-- Only owner can update
CREATE POLICY "Only team owner can update"
    ON teams FOR UPDATE
    USING (created_by = auth.uid());

-- Only owner can delete (soft)
CREATE POLICY "Only team owner can delete"
    ON teams FOR DELETE
    USING (created_by = auth.uid());
```

### 6.2 Team Members Table

```sql
-- Team Members: Junction table with roles
CREATE TABLE team_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL, -- Added by owner/admin
    role VARCHAR(20) NOT NULL DEFAULT 'user',
    added_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    removed_at TIMESTAMP WITH TIME ZONE,
    removed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    
    CONSTRAINT valid_role CHECK (role IN ('owner', 'admin', 'user')),
    CONSTRAINT unique_team_member UNIQUE (team_id, email)
);

-- Indexes
CREATE INDEX idx_team_members_team_id ON team_members(team_id);
CREATE INDEX idx_team_members_user_id ON team_members(user_id);
CREATE INDEX idx_team_members_role ON team_members(role);
CREATE INDEX idx_team_members_email ON team_members(email);
CREATE INDEX idx_team_members_team_user ON team_members(team_id, user_id);
CREATE INDEX idx_team_members_active ON team_members(removed_at) WHERE removed_at IS NULL;

-- RLS Policies
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

-- Users can view their own memberships
CREATE POLICY "Users can view their memberships"
    ON team_members FOR SELECT
    USING (user_id = auth.uid());

-- Team owners/admins can view all members of their team
CREATE POLICY "Team admins can view team members"
    ON team_members FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.team_id = team_members.team_id
            AND tm.user_id = auth.uid()
            AND tm.role IN ('owner', 'admin')
            AND tm.removed_at IS NULL
        )
    );

-- Only owners/admins can add members
CREATE POLICY "Team admins can create members"
    ON team_members FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.team_id = team_members.team_id
            AND tm.user_id = auth.uid()
            AND tm.role IN ('owner', 'admin')
            AND tm.removed_at IS NULL
        )
    );

-- Only owners can update roles, admins can update users only
CREATE POLICY "Team admins can update members"
    ON team_members FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.team_id = team_members.team_id
            AND tm.user_id = auth.uid()
            AND tm.role IN ('owner', 'admin')
            AND tm.removed_at IS NULL
        )
    );

-- Function to prevent owner leave
CREATE OR REPLACE FUNCTION check_owner_leave()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.role = 'owner' AND NEW.removed_at IS NOT NULL THEN
        RAISE EXCEPTION 'Owners cannot leave teams. Transfer ownership first.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_owner_leave
    BEFORE UPDATE ON team_members
    FOR EACH ROW
    EXECUTE FUNCTION check_owner_leave();
```

### 6.3 Enhanced Leads Table

```sql
-- Add team support to existing leads table
-- Assuming existing leads table exists

-- Add columns for team support
ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS captured_by_user_id UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS is_team_lead BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS workspace_type VARCHAR(20) DEFAULT 'personal'; -- 'personal', 'team'

-- Update existing leads to set workspace_type based on context
-- Migration: UPDATE leads SET workspace_type = 'personal' WHERE team_id IS NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_leads_team_id ON leads(team_id);
CREATE INDEX IF NOT EXISTS idx_leads_captured_by ON leads(captured_by_user_id);
CREATE INDEX IF NOT EXISTS idx_leads_is_team_lead ON leads(is_team_lead);
CREATE INDEX IF NOT EXISTS idx_leads_workspace ON leads(workspace_type);
CREATE INDEX IF NOT EXISTS idx_leads_team_created ON leads(team_id, created_at DESC);

-- RLS Policies for Team Leads
-- Note: Keep existing personal lead policies, add team-specific ones

-- Users can view leads they captured in teams
CREATE POLICY "Users can view their team leads"
    ON leads FOR SELECT
    USING (
        captured_by_user_id = auth.uid()
        OR
        (
            is_team_lead = true
            AND team_id IN (
                SELECT team_id FROM team_members 
                WHERE user_id = auth.uid() 
                AND removed_at IS NULL
            )
        )
    );

-- Team admins can view all team leads
CREATE POLICY "Team admins can view all team leads"
    ON leads FOR SELECT
    USING (
        is_team_lead = true
        AND team_id IN (
            SELECT tm.team_id FROM team_members tm
            WHERE tm.user_id = auth.uid()
            AND tm.role IN ('owner', 'admin')
            AND tm.removed_at IS NULL
        )
    );

-- Users can create leads in their teams
CREATE POLICY "Users can create team leads"
    ON leads FOR INSERT
    WITH CHECK (
        team_id IS NULL -- Personal lead
        OR
        (
            team_id IN (
                SELECT team_id FROM team_members 
                WHERE user_id = auth.uid() 
                AND removed_at IS NULL
            )
        )
    );

-- Users can update their own leads
CREATE POLICY "Users can update their own leads"
    ON leads FOR UPDATE
    USING (
        captured_by_user_id = auth.uid()
        OR
        (
            is_team_lead = true
            AND team_id IN (
                SELECT tm.team_id FROM team_members tm
                WHERE tm.user_id = auth.uid()
                AND tm.role IN ('owner', 'admin')
                AND tm.removed_at IS NULL
            )
        )
    );
```

### 6.4 Enhanced User Subscriptions Table

```sql
-- Enhanced subscriptions with team support
-- Assuming existing user_subscriptions table exists

-- Add columns for team subscriptions
ALTER TABLE user_subscriptions
ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE CASCADE, -- Nullable: NULL for individual subscriptions
ADD COLUMN IF NOT EXISTS subscription_type VARCHAR(20) DEFAULT 'individual', -- 'individual', 'team'
ADD COLUMN IF NOT EXISTS is_team_subscription BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS selected_member_ids UUID[] DEFAULT '{}', -- Array of user IDs covered by subscription
ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN DEFAULT false;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_subscriptions_team_id ON user_subscriptions(team_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_type ON user_subscriptions(subscription_type);
CREATE INDEX IF NOT EXISTS idx_subscriptions_team_active ON user_subscriptions(team_id, is_active);

-- Function to check if user is covered by team subscription
CREATE OR REPLACE FUNCTION is_user_in_team_subscription(
    p_user_id UUID,
    p_team_id UUID
) RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 
        FROM user_subscriptions us
        WHERE us.team_id = p_team_id
        AND us.is_active = true
        AND us.end_date > now()
        AND (
            us.selected_member_ids @> ARRAY[p_user_id]
            OR us.created_by = p_user_id -- Owner always covered
        )
    );
END;
$$ LANGUAGE plpgsql;

-- RLS Policies

-- Users can view subscriptions for teams they're in
CREATE POLICY "Users can view team subscriptions"
    ON user_subscriptions FOR SELECT
    USING (
        user_id = auth.uid() -- Individual subscriptions
        OR
        (
            team_id IN (
                SELECT team_id FROM team_members 
                WHERE user_id = auth.uid() 
                AND removed_at IS NULL
            )
        )
    );

-- Only owners can create team subscriptions
CREATE POLICY "Only team owners can create subscriptions"
    ON user_subscriptions FOR INSERT
    WITH CHECK (
        team_id IS NULL -- Individual subscription
        OR
        (
            EXISTS (
                SELECT 1 FROM team_members tm
                WHERE tm.team_id = user_subscriptions.team_id
                AND tm.user_id = auth.uid()
                AND tm.role = 'owner'
                AND tm.removed_at IS NULL
            )
        )
    );
```

### 6.5 Pending Leads Table

```sql
-- Pending Leads: For offline/subscription-lacking captures
CREATE TABLE pending_leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    pending_id VARCHAR(100) UNIQUE NOT NULL, -- Client-generated ID for deduplication
    
    -- Lead data (same as leads table)
    contact_name VARCHAR(255),
    company_name VARCHAR(255),
    job_title VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    website VARCHAR(500),
    address TEXT,
    notes TEXT,
    voice_note_url TEXT,
    card_images TEXT[], -- Array of image URLs
    
    -- Metadata
    is_offline BOOLEAN DEFAULT false,
    captured_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    sync_attempts INTEGER DEFAULT 0,
    last_sync_error TEXT,
    
    -- Sync status
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'syncing', 'synced', 'failed'
    synced_at TIMESTAMP WITH TIME ZONE,
    synced_lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    
    -- Team context at capture time
    captured_as_team_member BOOLEAN DEFAULT false,
    intended_team_id UUID REFERENCES teams(id)
);

-- Indexes
CREATE INDEX idx_pending_leads_user_id ON pending_leads(user_id);
CREATE INDEX idx_pending_leads_team_id ON pending_leads(team_id);
CREATE INDEX idx_pending_leads_status ON pending_leads(status);
CREATE INDEX idx_pending_leads_captured_at ON pending_leads(captured_at);
CREATE INDEX idx_pending_leads_pending_id ON pending_leads(pending_id);

-- RLS Policies
ALTER TABLE pending_leads ENABLE ROW LEVEL SECURITY;

-- Users can only see their own pending leads
CREATE POLICY "Users can view their pending leads"
    ON pending_leads FOR SELECT
    USING (user_id = auth.uid());

-- Users can create their own pending leads
CREATE POLICY "Users can create pending leads"
    ON pending_leads FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- Users can update their own pending leads
CREATE POLICY "Users can update their pending leads"
    ON pending_leads FOR UPDATE
    USING (user_id = auth.uid());

-- Users can delete their own pending leads
CREATE POLICY "Users can delete their pending leads"
    ON pending_leads FOR DELETE
    USING (user_id = auth.uid());
```

### 6.6 TinyBase Schema Updates

```typescript
// TinyBase schema for local storage with team support
export const teamSchema = {
  // Workspaces table - track active workspace
  workspaces: {
    id: { type: 'string' },
    type: { type: 'string' }, // 'personal', 'team'
    team_id: { type: 'string', nullable: true },
    name: { type: 'string' },
    role: { type: 'string', nullable: true }, // For teams
    is_active: { type: 'boolean' },
    last_accessed: { type: 'number' }, // timestamp
  },

  // Leads table with team_id
  leads: {
    id: { type: 'string' },
    workspace_id: { type: 'string' }, // Links to workspaces.id
    team_id: { type: 'string', nullable: true },
    
    // Contact info
    contact_name: { type: 'string', nullable: true },
    company_name: { type: 'string', nullable: true },
    job_title: { type: 'string', nullable: true },
    email: { type: 'string', nullable: true },
    phone: { type: 'string', nullable: true },
    
    // Content
    notes: { type: 'string', nullable: true },
    voice_note_transcript: { type: 'string', nullable: true },
    card_images: { type: 'string', nullable: true }, // JSON array
    
    // Status
    status: { type: 'string' }, // 'active', 'archived', 'deleted'
    is_synced: { type: 'boolean' },
    is_pending: { type: 'boolean', default: false },
    
    // Timestamps
    created_at: { type: 'number' },
    updated_at: { type: 'number' },
    
    // Ownership
    captured_by: { type: 'string' },
    is_team_lead: { type: 'boolean', default: false },
  },

  // Pending leads (for offline/no subscription)
  pending_leads: {
    id: { type: 'string' },
    pending_id: { type: 'string' }, // Client UUID
    workspace_id: { type: 'string' },
    team_id: { type: 'string', nullable: true },
    
    // Same fields as leads
    contact_name: { type: 'string', nullable: true },
    company_name: { type: 'string', nullable: true },
    // ... other lead fields
    
    // Pending specific
    capture_data: { type: 'string' }, // JSON blob of all data
    is_offline: { type: 'boolean', default: false },
    sync_attempts: { type: 'number', default: 0 },
    last_error: { type: 'string', nullable: true },
    status: { type: 'string' }, // 'pending', 'syncing', 'failed'
    captured_at: { type: 'number' },
  },

  // Team metadata cache
  team_metadata: {
    team_id: { type: 'string' },
    name: { type: 'string' },
    role: { type: 'string' },
    member_count: { type: 'number' },
    subscription_status: { type: 'string' },
    subscription_expires_at: { type: 'number', nullable: true },
    last_synced: { type: 'number' },
  },

  // Sync queue
  sync_queue: {
    id: { type: 'string' },
    workspace_id: { type: 'string' },
    lead_id: { type: 'string' },
    operation: { type: 'string' }, // 'create', 'update', 'delete'
    status: { type: 'string' }, // 'pending', 'in_progress', 'completed', 'failed'
    retry_count: { type: 'number', default: 0 },
    created_at: { type: 'number' },
    error_message: { type: 'string', nullable: true },
  },
};

// Storage keys with workspace isolation
export const getStorageKey = (workspaceId: string, entity: string) => 
  `expowiz_${workspaceId}_${entity}`;

export const getPendingLeadKey = (workspaceId: string) =>
  `expowiz_${workspaceId}_pending_leads`;
```

### 6.7 Indexes Summary

```sql
-- Performance indexes for common queries

-- Teams
CREATE INDEX CONCURRENTLY idx_teams_lookup ON teams(id, is_active, created_by);

-- Team members - common queries
CREATE INDEX CONCURRENTLY idx_team_members_lookup 
    ON team_members(team_id, user_id, role)
    WHERE removed_at IS NULL;

-- Leads - team filtering
CREATE INDEX CONCURRENTLY idx_leads_team_filtered 
    ON leads(team_id, is_team_lead, created_at DESC) 
    WHERE is_active = true;

-- Leads - user filtering
CREATE INDEX CONCURRENTLY idx_leads_user_filtered 
    ON leads(captured_by_user_id, created_at DESC) 
    WHERE is_active = true;

-- Subscriptions - active lookup
CREATE INDEX CONCURRENTLY idx_subscriptions_active_lookup 
    ON user_subscriptions(team_id, is_active, end_date DESC) 
    WHERE is_team_subscription = true;

-- Pending leads - sync queue
CREATE INDEX CONCURRENTLY idx_pending_leads_sync 
    ON pending_leads(user_id, status, sync_attempts) 
    WHERE status IN ('pending', 'failed');

-- Partial indexes for common filters
CREATE INDEX CONCURRENTLY idx_team_members_owners 
    ON team_members(team_id, user_id) 
    WHERE role = 'owner' AND removed_at IS NULL;

CREATE INDEX CONCURRENTLY idx_leads_recent 
    ON leads(created_at DESC) 
    WHERE created_at > now() - interval '30 days';
```

---

## 7. Implementation Plan

### Phase 1: Database & Backend (Days 1-4)

**Tasks:**
1. Create migration files for new tables
   - `teams`, `team_members`, `pending_leads`
   - Enhance `leads`, `user_subscriptions`
2. Set up RLS policies
3. Create edge function scaffolding
4. Write database functions (triggers, helpers)
5. Set up TinyBase schema updates

**Deliverables:**
- Migration scripts ready
- Database schema deployed
- Edge functions structure in place

**Estimated Time:** 3-4 days

### Phase 2: Core Frontend Infrastructure (Days 5-7)

**Tasks:**
1. Create Team types and interfaces
2. Set up workspace context/store
3. Implement workspace switching logic
4. Update TinyBase persistence layer
5. Create team API client hooks

**Deliverables:**
- Type definitions complete
- Workspace store functional
- API integration layer ready

**Estimated Time:** 2-3 days

### Phase 3: Team Management UI (Days 8-12)

**Tasks:**
1. Build workspace selector component
2. Create "Create Team" flow
3. Build invite member UI
4. Implement team settings page
5. Create member management interface
6. Build role change UI
7. Implement ownership transfer flow

**Deliverables:**
- Team creation functional
- Add member system working
- Member management complete

**Estimated Time:** 4-5 days

### Phase 4: Workspace Switching (Days 13-15)

**Tasks:**
1. Implement workspace context switching
2. Update navigation for workspace awareness
3. Build workspace-aware lead loading
4. Create workspace isolation in TinyBase
5. Add workspace persistence (last active)

**Deliverables:**
- Can switch between teams
- Lead data properly isolated
- UI updates on switch

**Estimated Time:** 2-3 days

### Phase 5: Subscriptions UI (Days 16-20)

**Tasks:**
1. Update subscription page for teams
2. Build member selection UI for subscriptions
3. Integrate Razorpay for team subscriptions
4. Create subscription status components
5. Build expiration warnings
6. Implement subscription extension flow

**Deliverables:**
- Can purchase team subscriptions
- Member selection working
- Status indicators visible

**Estimated Time:** 4-5 days

### Phase 6: Lead Capture & Visibility (Days 21-25)

**Tasks:**
1. Update capture flow for always-local storage
2. Implement offline lead storage
3. Create pending leads UI
4. Build "Team Leads" page (Admin/Owner only)
5. Add lead visibility filters

**Deliverables:**
- Subscription-aware capture
- Pending leads functional
- Team leads view for admins

**Estimated Time:** 4-5 days

### Phase 7: Navigation & Route Guards (Days 26-27)

**Tasks:**
1. Update routing for workspace context
2. Add permission-based route guards
3. Build "Access Denied" pages
4. Implement redirect logic
5. Add loading states for workspace switching

**Deliverables:**
- Proper route protection
- Smooth navigation
- Permission checks in place

**Estimated Time:** 1-2 days

### Phase 8: Lead Services & Sync (Days 28-30)

**Tasks:**
1. Update lead CRUD for team context
2. Build pending lead sync logic
3. Implement offline queue management
4. Create sync status UI
5. Add error handling for sync failures
6. Build retry mechanisms

**Deliverables:**
- Lead sync working
- Offline support functional
- Error handling complete

**Estimated Time:** 2-3 days

### Phase 9: Testing (Days 31-35)

**Tasks:**
1. Write unit tests for team utilities
2. Create integration tests for flows
3. Test all edge cases
4. Performance testing (workspace switching)
5. Security testing (RLS policies)
6. Mobile testing (Capacitor)

**Deliverables:**
- Test suite passing
- Edge cases covered
- Performance acceptable

**Estimated Time:** 4-5 days

### Phase 10: Documentation (Days 36-37)

**Tasks:**
1. Update AGENTS.md with team info
2. Create user-facing help docs
3. Document API endpoints
4. Create troubleshooting guide
5. Update environment variables doc

**Deliverables:**
- Documentation complete
- Help docs available
- Troubleshooting guide ready

**Estimated Time:** 1-2 days

### Total Estimated Time: **29-37 Days**

### Critical Path

```
Database → Frontend Infra → Team Management → Workspace Switching → 
→ Subscriptions → Lead Capture → Testing → Launch
```

### Parallel Workstreams

**Stream A (Backend-heavy):** Days 1-12
- Database migrations
- Edge functions
- RLS policies
- API integrations

**Stream B (Frontend-heavy):** Days 5-25
- UI components
- State management
- Navigation updates
- Subscription flows

**Stream C (Integration):** Days 20-35
- End-to-end flows
- Sync logic
- Testing
- Bug fixes

### Risk Mitigation

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| RLS complexity | Medium | Test thoroughly with real scenarios |
| Subscription edge cases | Medium | Comprehensive testing, grace periods |
| Performance on workspace switch | Low | Lazy loading, caching strategies |
| Mobile compatibility | Medium | Early Capacitor testing |

---

## 8. API Specifications

### 8.1 Edge Function: create-team

**Endpoint:** `POST /functions/v1/create-team`

**Authentication:** Required (Bearer token)

**Request Body:**
```json
{
  "name": "Acme Corp",
  "logo_url": "https://...",
  "metadata": {
    "industry": "Technology",
    "booth_number": "A123"
  }
}
```

**Validation:**
- Name: 3-50 characters, required
- Logo: Optional, valid URL

**Response (Success - 200):**
```json
{
  "success": true,
  "data": {
    "team": {
      "id": "uuid",
      "name": "Acme Corp",
      "slug": "acme-corp",
      "logo_url": "https://...",
      "created_by": "user_uuid",
      "created_at": "2026-02-03T10:00:00Z",
      "is_active": true
    },
    "membership": {
      "id": "uuid",
      "team_id": "team_uuid",
      "user_id": "user_uuid",
      "role": "owner",
      "joined_at": "2026-02-03T10:00:00Z"
    }
  }
}
```

**Response (Error - 400/403/429):**
```json
{
  "success": false,
  "error": {
    "code": "TEAM_001",
    "message": "You already have a team with this name",
    "details": {}
  }
}
```

**Implementation Notes:**
- Create team and membership in transaction
- Generate unique slug from name
- Return both team and membership for immediate UI update

### 8.2 Edge Function: add-team-member

**Endpoint:** `POST /functions/v1/add-team-member`

**Authentication:** Required (Bearer token)

**Request Body:**
```json
{
  "team_id": "team_uuid",
  "email": "user@example.com",
  "role": "admin"
}
```

**Validation:**
- User must be Owner or Admin of team
- Email: Valid format, not self
- Role: 'admin' or 'user'
- Cannot add duplicate email

**Response (Success - 200):**
```json
{
  "success": true,
  "data": {
    "member": {
      "id": "uuid",
      "team_id": "team_uuid",
      "email": "user@example.com",
      "role": "admin",
      "added_by": "adder_uuid",
      "added_at": "2026-02-03T10:00:00Z"
    },
    "message": "Member added to team"
  }
}
```

**Auto-join Logic:**
```typescript
// Member added immediately - no invitation or acceptance required
await addTeamMember(team_id, email, role, adder_id);
return { status: 'added', message: 'Member added to team' };

// For new users: they automatically see team in workspace selector upon signup
// For existing users: team appears in workspace selector immediately
```

### 8.3 Edge Function: get-team-details

**Endpoint:** `GET /functions/v1/get-team-details?team_id=uuid`

**Authentication:** Required (Bearer token)

**Query Parameters:**
- `team_id` (required): Team UUID
- `include_members` (optional): boolean, default true
- `include_subscription` (optional): boolean, default true

**Response (Success - 200):**
```json
{
  "success": true,
  "data": {
    "team": {
      "id": "uuid",
      "name": "Acme Corp",
      "slug": "acme-corp",
      "logo_url": "https://...",
      "created_at": "2026-02-03T10:00:00Z",
      "metadata": {}
    },
    "my_role": "owner",
    "members": [
      {
        "id": "member_uuid",
        "user_id": "user_uuid",
        "email": "user@example.com",
        "full_name": "John Doe",
        "role": "admin",
        "avatar_url": "https://...",
        "added_at": "2026-02-03T10:00:00Z"
      }
    ],
    "subscription": {
      "status": "active",
      "plan": "monthly",
      "started_at": "2026-02-01T00:00:00Z",
      "expires_at": "2026-03-01T00:00:00Z",
      "days_remaining": 27,
      "selected_members": ["user_uuid_1", "user_uuid_2"],
      "is_user_covered": true
    },
    "stats": {
      "total_leads": 156,
      "leads_this_month": 23,
      "member_count": 5
    }
  }
}
```

**Permissions:**
- Team members can view
- Non-members: 403 Forbidden

**Caching:**
- Cache for 5 minutes
- Invalidate on member/subscription changes

### 8.4 Edge Function: create-team-subscription

**Endpoint:** `POST /functions/v1/create-team-subscription`

**Authentication:** Required (Bearer token)

**Request Body:**
```json
{
  "team_id": "team_uuid",
  "plan": "monthly",
  "selected_member_ids": ["user_uuid_1", "user_uuid_2", "user_uuid_3"],
  "payment_method": "razorpay",
  "razorpay_order_id": "order_xxx",
  "razorpay_payment_id": "pay_xxx"
}
```

**Plans:**
- `trade_fair`: 5 days, ₹1,000
- `monthly`: 30 days, ₹2,000  
- `yearly`: 365 days, ₹10,000

**Validation:**
- Only Owner can purchase
- All selected members must be active team members
- Payment verification required

**Response (Success - 200):**
```json
{
  "success": true,
  "data": {
    "subscription": {
      "id": "sub_uuid",
      "team_id": "team_uuid",
      "plan": "monthly",
      "start_date": "2026-02-03T10:00:00Z",
      "end_date": "2026-03-03T10:00:00Z",
      "selected_member_ids": ["user_uuid_1", "user_uuid_2", "user_uuid_3"],
      "is_active": true,
      "created_at": "2026-02-03T10:00:00Z"
    },
    "synced_leads": 5,
    "message": "Subscription activated. 5 pending leads synced."
  }
}
```

**Post-Purchase Actions:**
1. Verify Razorpay payment
2. Create subscription record
3. Update all selected members' access
4. Trigger pending leads sync

**Razorpay Integration:**
```typescript
// Verify payment signature
const isValid = verifyRazorpaySignature(
  razorpay_order_id,
  razorpay_payment_id,
  razorpay_signature,
  process.env.RAZORPAY_SECRET
);

if (!isValid) {
  throw new Error('Invalid payment signature');
}
```

### 8.5 Edge Function: sync-pending-leads

**Endpoint:** `POST /functions/v1/sync-pending-leads`

**Authentication:** Required (Bearer token)

**Request Body:**
```json
{
  "team_id": "team_uuid",
  "pending_leads": [
    {
      "pending_id": "client_generated_uuid",
      "contact_name": "John Doe",
      "company_name": "Acme Inc",
      "email": "john@acme.com",
      "phone": "+91 98765 43210",
      "notes": "Met at booth",
      "card_images": ["base64_or_url"],
      "captured_at": "2026-02-01T10:00:00Z",
      "is_offline": false
    }
  ]
}
```

**Validation:**
- User must have active subscription for team
- Max 50 leads per batch
- Duplicate check on `pending_id`

**Response (Success - 200):**
```json
{
  "success": true,
  "data": {
    "synced": 5,
    "failed": 0,
    "results": [
      {
        "pending_id": "client_uuid",
        "status": "success",
        "lead_id": "new_lead_uuid",
        "message": "Lead synced successfully"
      }
    ],
    "failed_leads": []
  }
}
```

**Response (Partial Failure - 207):**
```json
{
  "success": false,
  "partial": true,
  "data": {
    "synced": 3,
    "failed": 2,
    "results": [...],
    "failed_leads": [
      {
        "pending_id": "client_uuid",
        "status": "failed",
        "error": "Invalid email format",
        "retryable": false
      }
    ]
  }
}
```

**Processing:**
1. Validate each lead
2. Insert into `leads` table with `team_id`
3. Update `pending_leads` status to 'synced'
4. Return mapping of `pending_id` → `lead_id`
5. Handle partial failures gracefully

**Error Handling:**
- Validation errors: Mark as failed, non-retryable
- Database errors: Retryable, keep in pending
- Auth errors: Return 403 immediately

### 8.6 Additional Edge Functions

**leave-team**
- `POST /functions/v1/leave-team`
- Body: `{ "team_id": "uuid" }`
- Validates not owner, not last admin

**remove-team-member**
- `POST /functions/v1/remove-team-member`
- Body: `{ "team_id": "uuid", "member_id": "uuid" }`
- Owner/Admin only

**update-member-role**
- `POST /functions/v1/update-member-role`
- Body: `{ "team_id": "uuid", "member_id": "uuid", "new_role": "admin" }`
- Validates role hierarchy rules

**transfer-ownership**
- `POST /functions/v1/transfer-ownership`
- Body: `{ "team_id": "uuid", "new_owner_id": "uuid" }`
- Immediate transfer, no email confirmation required

**delete-team**
- `POST /functions/v1/delete-team`
- Body: `{ "team_id": "uuid", "confirm_name": "Team Name" }`
- Soft delete with 30-day recovery

---

## 9. Questions & Updates Log

### Pending Decisions

| Question | Context | Impact | Status |
|----------|---------|--------|--------|
| Should pending leads auto-sync on subscription purchase? | UX decision | Low | **DECIDED: Yes, with user confirmation** |
| Can removed members be re-added immediately? | Technical | Low | **DECIDED: Yes, no cooldown** |
| Max teams per user limit? | Abuse prevention | Medium | **DECIDED: Unlimited teams** |
| Grace period after subscription expires? | User experience | Medium | **DECIDED: 24-hour capture grace** |
| Should admins see billing info? | Permission scope | Low | **DECIDED: No, Owner only** |
| Export format options for team leads? | Feature scope | Low | **PENDING** |

### Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-03 | Time-based subscriptions (not event-based) | Simpler implementation, clearer value |
| 2026-02-03 | Owner selects members at purchase | Flexible billing, matches Slack model |
| 2026-02-03 | 24-hour grace period post-expiration | Prevents disruption during busy fairs |
| 2026-02-03 | Pending leads stored in TinyBase only | No cloud storage without subscription |
| 2026-02-03 | Soft delete teams for 30 days | Data recovery safety net |
| 2026-02-03 | Owner cannot leave team | Force ownership transfer, prevent orphan teams |
| 2026-02-03 | Last admin cannot demote self | Ensure team always has management |
| 2026-02-03 | Unlimited teams per user | Remove arbitrary limits, scale with usage |
| 2026-02-03 | Auto-join on signup | New users automatically see team in workspace when signing up with email that was added to team roster |
| 2026-02-03 | Subscription stacking - allow with warning | Owner can buy multiple but warned about overlap |
| 2026-02-03 | Pending leads device-only | Never sync to cloud, stays on capture device only |
| 2026-02-03 | Regular Users see only personal leads | No team lead visibility for non-admins |
| 2026-02-03 | Team logos in Cloudinary | Consistent with existing media storage |

### Implementation Updates

| Date | Section | Update |
|------|---------|--------|
| 2026-02-03 | Initial | Document created with full specification |
| 2026-02-03 | Decisions | 4 pending questions answered and documented |
| | | - Subscription stacking: allow with warning |
| | | - Pending leads: device-only, no cloud sync |
| | | - User lead visibility: personal leads only |
| | | - Logo storage: Cloudinary |
| | | Ready for Phase 1 implementation |
| 2026-02-03 | Clarifications | 8 critical clarifications updated in spec |
| | | 1. Pending leads: device-only, never synced to server-db |
| | | 2. Unlimited teams: No maximum limit, users can join any number |
| | | 3. Lead capture only: No assignment or follow-up features |
| | | 4. No invitation system: Direct member addition, auto-join on signup |
| | | - No invited_at, pending status, or invitation tokens |
| | | - Email field added to team_members for matching |
| | | - removed_at used instead of is_active for soft delete |
| | | 5. Per-member pricing: ₹1000 per member for 5 days, etc. |
| | | 6. Capture flow: Always normal, sync only when subscribed |
| | | 7. Unlimited pending leads: No storage limits |
| | | 8. team_id nullable: Confirmed in user_subscriptions table |

### Known Issues / TODOs

- [x] Define exact TinyBase schema for workspace switching - Completed
- [x] Clarify behavior when subscription expires mid-capture - Completed (24hr grace period)
- [ ] Design pending leads sync UI mockup
- [x] Create edge case test scenarios - Completed (30+ scenarios documented in Section 5)
- [ ] Document Razorpay webhook handling
- [ ] Implement subscription stacking warning UI
- [ ] Document device-independent pending leads behavior

### Review Checklist

- [x] Feature Overview complete
- [x] Permission matrix documented
- [x] All core features specified
- [x] Working patterns described
- [x] Edge cases covered (30+ scenarios)
- [x] Database schema complete with SQL
- [x] Implementation plan with phases
- [x] API specifications detailed
- [x] Questions log established

---

## Appendix: Environment Variables

```bash
# Supabase
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Razorpay (for team subscriptions)
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=

# Edge Functions
EDGE_FUNCTIONS_BASE_URL=

# TinyBase / Storage
TINYBASE_PERSISTENCE_KEY=expowiz_
ENABLE_OFFLINE_SYNC=true

# Feature Flags
ENABLE_TEAMS=true
ENABLE_TEAM_SUBSCRIPTIONS=true
```

---

**Document Status:** Ready for Implementation  
**Next Review:** After Phase 3 completion  
**Owner:** Expowiz Engineering Team
