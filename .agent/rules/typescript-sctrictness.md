---
trigger: always_on
---

## TypeScript Strictness (NON-NEGOTIABLE)

TypeScript is our friend; it helps us ship code that is not buggy. It is NOT a hurdle to be bypassed. 

1. **NO `any` or `as unknown`**: These are strictly prohibited. Find or define the correct type.
2. **NO `ts-ignore` or `ts-expect-error`**: Do not suppress errors. If there's an error, find out what's wrong with the implementation instead of brute-forcing it.
3. **NO manual typecasting**:
   - Avoid `as SomeType` if TypeScript can infer the type correctly.
   - **How to avoid casting**: Use **Generic Typing** (e.g., `useLocalDb<Team>(...)`) so the API returns the correct type natively.
   - Use manual casting only as a last resort when working with external libraries that have poor typing, and always provide a detailed comment.
4. **Fix implementation, don't ignore types**: On any type error, the primary goal is to fix the underlying implementation to match the expected types.
5. **Inference over Annotation**: Prefer inferred types for local variables to keep code clean while maintaining safety.
6. **Enforcement**:
   - **CI/Local Checks**: Always run `tsc --noEmit` or `nr build` to verify type integrity before committing.
   - **Static Analysis**: Use `grep "as any"` or `grep "as unknown"` periodically to find and eliminate bypasses.
   - **Generic-First Approach**: When writing shared utilities or hooks, ensure they support generics for end-to-end safety.
7. **Exceptional Workarounds**: In the rarest case where a workaround is truly unavoidable (e.g., severe library bug), you MUST provide a detailed comment explaining the reason.