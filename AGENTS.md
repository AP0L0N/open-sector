<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **open-sector** (2717 symbols, 9601 relationships, 218 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/open-sector/context` | Codebase overview, check index freshness |
| `gitnexus://repo/open-sector/clusters` | All functional areas |
| `gitnexus://repo/open-sector/processes` | All execution flows |
| `gitnexus://repo/open-sector/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

# Unit sprites (Narrow Front)

Before creating or replacing **unit** art (infantry, vehicles, turrets, hatch heads, stance sheets), read `narrow-front-sprite-agent-brief.md` and follow it.

- **16 faces, 22.5°.** `0001.png` = south (screen down), then clockwise through `0016.png`. A 17th file would equal `0001`. `UnitSpriteDef.dirs` must be `16`. Never ship an 8-dir unit sheet.
- **One look, one size.** Lock palette, outline, camera (2:1 isometric), cell size, and contact point from an existing unit in the same class. Every facing in a sheet must match that lock — no size pop, no style pop between rows.
- Buildings stay cardinal (4 faces). Tiles stay 1. Shared FX are not unit sheets.

How to build a sheet, cell sizes, row order, and the consistency check are in the brief.

# Developing the game

Follow `.grok/rules/open-sector.md`. The shared sim decides the match; the canvas client draws it. Select the `open-sector` agent (`.grok/agents/open-sector.md`) when this session is for the game.
