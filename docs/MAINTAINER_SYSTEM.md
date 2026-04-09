# Maintainer System

This repository uses a simple local-first maintainer knowledge model.

## Document Roles

- `AGENTS.md`
  Repository-wide operating rules and safety constraints.
- `docs/CODEX_FIRST_PROMPT.md`
  New-session bootstrap prompt for Codex.
- `docs/PROJECT_KNOWLEDGE.md`
  Static project truths and durable conventions. Update when a rule or invariant becomes intentional.
- `docs/PROJECT_MEMORY.md`
  Earned learnings from implementation and debugging. Update only with observations backed by real work.
- `docs/PROJECT_PRIORITIES.md`
  Current focus areas, parked items, and short-term direction.

## Update Rules

- Put stable rules in `PROJECT_KNOWLEDGE.md`.
- Put observed behavior, pitfalls, and debugging lessons in `PROJECT_MEMORY.md`.
- Put temporary direction and likely-next work in `PROJECT_PRIORITIES.md`.
- Keep `CODEX_FIRST_PROMPT.md` short. It should point to the right documents, not duplicate all of them.

## Knowledge vs Memory

### Knowledge
Use for:
- repository structure
- intentional workflow conventions
- user-specific operating rules that should persist
- architectural invariants

Do not use for:
- temporary bugs
- one-off observations
- speculative future ideas

### Memory
Use for:
- bugs that were reproduced and understood
- implementation traps
- cross-file behavior that caused regressions
- debugging conclusions that should influence future changes

Do not use for:
- guesses
- aspirational design notes
- repeated copies of rules already in `AGENTS.md`

## Review Checklist

When a change is significant, ask:

1. Did this reveal a stable rule? Add it to `PROJECT_KNOWLEDGE.md`.
2. Did this reveal a hard-won lesson? Add it to `PROJECT_MEMORY.md`.
3. Did this change what should be worked on next? Update `PROJECT_PRIORITIES.md`.

