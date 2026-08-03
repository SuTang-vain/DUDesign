<div align="center">

<img src="docs/banner.svg" width="100%" alt="DUDesign banner — AI front-end design platform"/>

<br/>

<a href="https://kezhongke.cn/projects/dudesign/"><img src="https://img.shields.io/badge/product-landing%20page-6487FA?style=flat-square" alt="Product landing page"/></a>
<a href="http://49.233.190.201/dudesign"><img src="https://img.shields.io/badge/live%20preview-0891B2?style=flat-square" alt="Live preview"/></a>
<a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-6FA586?style=flat-square" alt="MIT license"/></a>
<img src="https://img.shields.io/badge/node-%3E%3D22-23252B?style=flat-square" alt="Node.js >= 22"/>

**DUDesign** is a hosted AI front-end design platform: describe a page in plain language —
or bring an existing HTML page — and DUDesign generates multiple design variations in
parallel, lets you preview, refine and annotate each one, then export or share the result.

[English](README.md) · [中文](README.zh-CN.md)

</div>

---

## How it works

The product is one pipeline: describe, generate, review, refine, ship.

### 01 · Describe & start

<img align="right" src="docs/steps/step-1.svg" width="340" alt="Step 1 — describe and start"/>

Start a session with a plain-language prompt, or upload an existing HTML page as the source.
Sessions and workspaces keep every project organized and resumable — refresh the browser and
pick up where you left off.

```
"Build a landing page for a smart coffee machine"
→ session created → design job queued
```

<br clear="all"/>

### 02 · Parallel variations

<img align="left" src="docs/steps/step-2.svg" width="340" alt="Step 2 — parallel variations"/>

One brief, N variations. Each variation runs on its own runtime lane in parallel, and job
events stream live to the browser — you watch the designs take shape instead of waiting on a
spinner.

<br clear="all"/>

### 03 · Preview & compare

<img align="right" src="docs/steps/step-3.svg" width="340" alt="Step 3 — preview and compare"/>

Finished variations land on a result wall with desktop / tablet / phone previews. Compare
before-and-after states of a refinement side by side, then open any variation in the editor.

<br clear="all"/>

### 04 · Refine & annotate

<img align="left" src="docs/steps/step-4.svg" width="340" alt="Step 4 — refine and annotate"/>

Drive the next iteration with a prompt, or circle parts of the rendered page to annotate what
to change. An artifact quality gate checks generated output and an automation loop repairs
issues automatically — review modes range from fully manual to fully automatic.

<br clear="all"/>

### 05 · Export & share

<img align="right" src="docs/steps/step-5.svg" width="340" alt="Step 5 — export and share"/>

Export the final standalone HTML, or publish a share link. Generated artifacts remain usable
even if the runtime is unavailable — the product never holds your output hostage.

<br clear="all"/>

## Key capabilities

| | | |
|---|---|---|
| <img src="docs/icons/design-direction.svg" width="26" alt="Design direction system"/> **Design direction system** | <img src="docs/icons/automation-loop.svg" width="26" alt="Automation loop"/> **Automation loop** | <img src="docs/icons/hosted-workspace.svg" width="26" alt="Hosted workspace"/> **Hosted workspace** |
| Scene templates, visual aesthetics, color palettes, brand references and template packs shape every generation. | Built-in quality gates, repair loop and review modes (off / semi-auto / auto). | Sessions, workspaces and user memory — everything is resumable and per-user. |
| <img src="docs/icons/stable-contracts.svg" width="26" alt="Stable contracts"/> **Stable contracts, clean boundary** | <img src="docs/icons/admin-console.svg" width="26" alt="Admin console"/> **Admin console** | <img src="docs/icons/monorepo.svg" width="26" alt="Monorepo"/> **Monorepo with governance** |
| Product code talks to the runtime only through versioned contracts and a runtime gateway. | Capability governance, template library, runtime health, usage and audit views. | Type-safe packages, contract tests, staging deployment tooling and ADR-tracked decisions. |

## Architecture

DUDesign treats BabeL-O as an **external runtime kernel**. Product logic never imports or
exposes BabeL-O internals; the runtime gateway is the only layer that understands BabeL-O
protocol details.

<img src="docs/architecture.svg" width="100%" alt="DUDesign four-layer architecture"/>

- **User experience** — web app (workspace, variation wall, editor) and admin console.
- **Application service** — sessions, jobs, variations, artifacts, shares, permissions and automation loops.
- **Runtime compatibility** — a gateway with stable DUDesign contracts and an adapter for lane scheduling, retries and event bridging.
- **BabeL-O runtime kernel** — external; agent loop, tool execution, session resume and memory retrieval.

## Repository layout

```text
apps/
  web/                # User-facing web app (Next.js)
  admin/              # Admin & developer console (Next.js)
  api/                # Application service API
  runtime-adapter/    # BabeL-O runtime adapter

packages/
  contracts/          # Stable DUDesign API and event contracts
  domain/             # Business models and statuses
  runtime-gateway/    # BabeL-O compatibility boundary
  artifact-store/     # Artifact storage abstraction

deploy/staging/       # Docker Compose staging stack, release scripts, nginx config
docs/                 # Architecture plans, ADRs, module worklogs
```

## Quick start

Requirements: **Node.js >= 22** and npm.

<img src="docs/terminal.svg" width="100%" alt="Quick start terminal"/>

```bash
npm install          # install all workspace dependencies
npm run typecheck    # type-check all packages and apps
npm test             # unit / integration gates (no external services needed)
```

Run the stack locally:

```bash
npm run dev:api      # API on http://127.0.0.1:4000
npm run dev:web      # web app on http://localhost:3001
npm run dev:admin    # admin console on http://localhost:3002
```

Point the web app at a different API if needed:

```bash
NEXT_PUBLIC_DUDESIGN_API_URL=http://127.0.0.1:4000
```

## Key scripts

| Script | Description |
| --- | --- |
| `npm run typecheck` | Type-check all packages and apps. |
| `npm test` | Unit/integration gates (contracts, gateway, adapter, API). |
| `npm run test:ux` | UX HTTP smoke; requires API and Web servers running. |
| `npm run test:ux:e2e` | Browser E2E; requires API and Web servers running. |
| `npm run dev:api` | Type-check, then run the API in watch mode. |
| `npm run dev:web` | Start the Next.js user web app on port 3001. |
| `npm run start:api` | Type-check, then start the built API. |
| `npm run start:web` | Start the built web app on port 3001. |

## Links & docs

- 🌐 [Product landing page](https://kezhongke.cn/projects/dudesign/)
- 🚀 [Live preview](http://49.233.190.201/dudesign)
- [Online Design Platform Plan](docs/online-design-platform-plan.md)
- [Architecture Governance Plan](docs/architecture-governance-plan.md)
- [Architecture Decision Records](docs/adr/)
- [Module Planning Index](docs/modules/README.md)

## License

MIT. See [LICENSE](LICENSE).
