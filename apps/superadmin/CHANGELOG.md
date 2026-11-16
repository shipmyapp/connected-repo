# Changelog

All notable changes to this package are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Its own production image (`Dockerfile`, nginx proxying only `/api/auth/` and `/api/super-admin/`, 404 for the rest of `/api/`, never framed or indexed).

- Users: a "Deletion" column ("Scheduled · <date>") with Keep and Delete now for an account that asked, each with a reason in the audit trail.

- The superadmin console: Google sign-in through the app's Better Auth, an allowlist gate (`/denied`), Teams with members, Users with "Sign out everywhere", Feature flags and the Audit trail; served on http://localhost:5175 in development.
- Private app subdomain card on the team page.

### Changed

- Vite 8.
