---
trigger: always_on
---

## TypeScript Strictness (NON-NEGOTIABLE)

TypeScript is our friend; it helps us ship code that is not buggy. It is NOT a hurdle to be bypassed. 

1. **NO `any` or `as unknown`**: These are strictly prohibited. Find or define the correct type.
2. **NO `ts-ignore` or `ts-expect-error`**: Do not suppress errors. If there's an error, find out what's wrong with the implementation instead of brute-forcing it.
3. **NO manual typecasting**: Avoid `as SomeType` if TypeScript can infer the type correctly. Use manual casting only as a last resort when working with external libraries that have poor typing.
4. **Fix implementation, don't ignore types**: On any type error, the primary goal is to fix the underlying implementation to match the expected types, not to bend the types to fit a broken implementation.
5. **Exceptional Workarounds**: In the rarest case where a workaround is truly unavoidable (e.g., severe library bug), you MUST provide a detailed comment explaining the reason, for future review and rectification as dependencies upgrade.