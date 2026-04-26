---
name: code-reviewer
description: Specialized skill for reviewing staged code changes. Focuses on edge cases, resiliency, and reducing redundancy.
---

# Code Reviewer

This skill provides a structured approach to reviewing code changes before they are committed.

## Review Objectives

### 1. Edge-Cases & Gotchas
- **Boundary Conditions**: Identify potential issues at the edges (empty arrays, nulls, long strings).
- **Storage/IO**: Check for storage eviction, disk full, or network failures.
- **Async Races**: Identify potential race conditions or unhandled promises.
- **Concurrency**: Ensure state updates are thread-safe (especially in workers).

### 2. Resiliency & Self-Healing
- **Fail-Safe**: Does the code fail gracefully? Is there error handling at critical boundaries?
- **Self-Healing**: Can the system recover from a partial failure or corrupted state?
- **Idempotency**: Are mutations (especially sync/upload) idempotent?
- **Monitoring**: Are errors logged with enough context for debugging?

### 3. Simplicity & Standardization
- **Redundancy**: Look for duplicated logic, redundant worker calls, or unnecessary state.
- **Standard Patterns**: Does it follow the established monorepo patterns (Proxy pattern, direct imports, worker isolation)?
- **Maintainability**: Is the logic easy to follow? Are variable names descriptive?
- **Simplification**: Can complex logic be simplified using standard utilities or hooks?

## Guidelines

- **Review the diff**: Always base the review on the output of `git diff --staged`.
- **Provide Actionable Feedback**: Suggestions should be concrete and easy to implement.
- **Focus on High-Impact Issues**: Prioritize architectural flaws and data integrity over styling nitpicks.
- **Reference Project Rules**: Ensure compliance with `TypeScript Strictness`, `Worker Isolation`, `Bundle Excellence`, `Code Quality`, and `Database Migrations`.
