---
trigger: always_on
---

## Documentation Lifecycle (Bimodal System)

We use a bimodal documentation system: Human-friendly `README.md` and Machine/Agent-optimized `AGENTS.md`.

1. **3-Layer Structure**: Every `AGENTS.md` file MUST follow the 3-layer lifecycle:
   - **Blueprint**: Background context, high-level intent, and core stack.
   - **Active Task**: Current status, intent, and context (sync with commit messages).
   - **Decision Records**: Tabular logs of architectural decisions (`[ADR-XXX]`).
2. **High-Density Language**: Use token-efficient, concise language in `AGENTS.md`. Avoid fluff.
3. **Consistency**: Ensure path links and references use absolute paths or relative paths correctly within the monorepo context.
4. **Synchronization**: Update the `Active Task` section whenever starting a new major feature or refactor.