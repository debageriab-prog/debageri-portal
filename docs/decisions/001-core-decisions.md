# Core architecture decisions

## 001: Separate website and portal cloud projects

Accepted. Recruitment and employee data have different users, purposes, retention, and risk; no production infrastructure is shared.

## 002: Local emulators plus isolated development and production projects

Superseded. Local work uses the Firebase Emulator Suite and fictitious project
ID `debageri-portal-local`. Feature branches use `debageri-portal-dev`, while
`main` alone uses `debageri-portal`. Development and production data, runtime
identities, Firebase applications, and secrets remain isolated.

## 003: Firestore as primary database

Accepted. It matches the Firebase stack, query patterns, emulator support, and current scale. No SQL requirement exists.

## 004: Weekly timesheet as approval unit

Accepted. One deterministic ISO-week document provides clear locking, totals, versioning, and manager workflow.

## 005: Integer minutes

Accepted. Integer arithmetic is exact, auditable, and maps to employment schedules; floating-point hours are prohibited.

## 006: Top-level time entries

Accepted. Date/user/week queries and future reporting are simpler than nested per-sheet entries; organization/user constraints remain mandatory.

## 007: Immutable time-code snapshots

Accepted. Historical reports retain the code meaning used at entry time after configuration changes.

## 008: Server-controlled approvals

Accepted. Trusted code verifies current state, authorization, manager assignment, totals, transitions, and atomic events; rules deny direct writes.

## 009: Standard 40-hour reporting

Accepted. Every eligible weekday expects eight classified hours. Employment and reporting dates live on the user, and submitted timesheets preserve historical expected totals.

## 010: Separate Authentication user base

Accepted. Employees are deliberately onboarded and never mixed or automatically linked with candidates/public users.

## 011: Separate private employee Storage

Accepted. Employee documents use portal-only buckets and private organization/employee paths; website résumé storage is never reused.
