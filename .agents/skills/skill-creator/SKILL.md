---
name: skill-creator
description: Create or improve project-local AI agent skills. Use when the user asks to add a SKILL.md, create a reusable Codex/ZCode skill, refine skill trigger wording, turn repeated DUDesign workflows into a skill, or evaluate whether something should be an agent skill versus a DUDesign DesignSkill/CapabilityPlugin.
---

# Skill Creator

Use this skill when authoring, reviewing, or iterating reusable agent skills for this repository.

## First Distinction

DUDesign has two different "skill" concepts. Decide which one the user means before editing:

- **Agent skill**: a `SKILL.md` discovered by Codex/ZCode under `.agents/skills/<name>/SKILL.md`, `.zcode/skills/<name>/SKILL.md`, or user-level skill folders. It teaches the coding agent how to work.
- **DUDesign DesignSkill**: a product capability registered in `apps/api/src/capabilities.ts` and exposed to end users through Capability Distribution. It teaches the design-generation runtime how to generate artifacts.

If the user provides a filesystem `SKILL.md` path, asks to add a skill "to the project", or mentions Codex/ZCode, prefer an **agent skill**. If they mention official plugins, template generation options, user-facing capabilities, MCP bindings, or `plug_` / `sk_` / `mcp_`, prefer a **DUDesign DesignSkill/CapabilityPlugin**.

When in doubt, inspect the target path and nearby docs before editing.

## Creation Loop

Use this practical loop:

1. Capture the intended workflow and trigger cases.
2. Draft or update the skill.
3. Add only files that directly support the skill.
4. Validate that the frontmatter is clear and the body is lean.
5. Try 2-3 realistic prompts when feasible.
6. Revise from observed behavior.

Keep the loop lightweight. If the user asks for a direct implementation and the intent is clear, implement first and summarize assumptions.

## Where Project Agent Skills Live

For DUDesign repository-specific agent skills, default to:

```text
.agents/skills/<skill-name>/SKILL.md
```

Use `.zcode/skills/<skill-name>/SKILL.md` only when the user explicitly wants a ZCode-priority override. User-level locations such as `~/.agents/skills/` or `~/.zcode/skills/` are for personal skills that should apply across repositories.

The skill directory name must match the `name` frontmatter.

## Required Structure

Every agent skill needs:

```text
skill-name/
└── SKILL.md
```

Optional directories are allowed only when useful:

```text
skill-name/
├── SKILL.md
├── references/
├── scripts/
└── assets/
```

Do not add extra README, changelog, installation notes, or marketing docs inside a skill directory unless the user explicitly asks. The skill itself is the instruction artifact.

## Frontmatter

Every `SKILL.md` must start with YAML frontmatter:

```markdown
---
name: my-skill
description: What this skill does and when to use it. Be explicit about trigger phrases and contexts.
---
```

Guidelines:

- `name` is lowercase kebab-case and should match the folder name.
- `description` is the main trigger signal. Make it concrete and slightly assertive.
- Include both the task and the contexts where it should trigger.
- Avoid vague descriptions like "helps with design"; prefer "Use when the user asks to create, lint, import, or refine DUDesign template packs."

## Body Style

Write for a capable coding agent:

- Prefer imperative instructions.
- Keep the body under 500 lines.
- Explain why a non-obvious rule matters.
- Use examples for expected structure or output.
- Remove repeated or generic advice that Codex already knows.
- Split long domain detail into `references/` and tell the agent exactly when to read each file.

Good skills give judgment, not a maze.

## DUDesign-Specific Guardrails

When creating a skill for this repo:

- Respect the four-layer governance model: user experience, admin/developer console, application service, runtime compatibility.
- Do not tell the agent to bypass `Design Runtime Gateway`, repository abstractions, artifact store, permission policy, or module TODO/WORKLOG conventions.
- If the skill relates to templates, plugins, MCP, automation loops, or dynamic encyclopedia cards, point the agent to the relevant docs under `docs/modules/capability-distribution/` and the registry in `apps/api/src/capabilities.ts`.
- If the skill changes project behavior, remind the agent to update the appropriate module `TODO.md` / `WORKLOG.md`.
- Do not include secrets, real server tokens, or private host-specific values in skill files.
- Do not encode arbitrary shell commands as automatic behavior unless they are safe validation commands and the user asked for that workflow.

## Evaluating a Draft

Use realistic prompts, not toy prompts. Good examples mention actual DUDesign areas:

- "Create a skill for adding a new official DesignTemplatePack and its tests."
- "Turn our staging deploy checklist into a reusable skill."
- "Improve this dynamic encyclopedia review skill so it catches hallucinated relationships."

For each prompt, check:

- Did the skill trigger from its description?
- Did it choose the right DUDesign layer?
- Did it avoid touching unrelated files?
- Did it update tests and docs when appropriate?
- Did it stay concise instead of generating ceremony?

If a skill causes repeated busywork, cut instructions. If it misses a critical safety or architecture boundary, reframe the rule with a short why.

## Updating an Existing Skill

When updating an installed skill:

- Preserve the original skill name unless the user asks for a rename.
- If the source is read-only or plugin-cached, copy it into a writable project or user skill folder and improve that copy.
- Keep same-name overrides intentional. `.zcode/skills` has higher discovery priority than `.agents/skills`.
- If importing from another tool's cache, adapt terminology to this repository instead of copying blindly.

## Output Expectations

When done, report:

- Skill path created or updated.
- Main behavior changes.
- Any assumptions about trigger scope.
- Validation performed or skipped.

If the skill should also become a user-facing DUDesign capability, say that separately and propose the needed `CapabilityPlugin` / `DesignSkill` / optional `McpToolBinding` changes.
