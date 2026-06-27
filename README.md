# DUDesign

DUDesign is a hosted AI front-end design platform. It lets users create or refine HTML pages through conversation, generate multiple design variations in parallel, preview the results, refine a selected variation with prompts and annotations, then export or share the final HTML.

The project is designed around a four-layer architecture:

1. User experience layer.
2. Admin and developer console layer.
3. Application service layer.
4. Runtime compatibility layer for BabeL-O.

BabeL-O is treated as an external runtime kernel. DUDesign does not expose BabeL-O internals directly to the frontend; product code talks through stable DUDesign contracts and a runtime gateway.

## Current Status

This repository currently contains the contract-first MVP scaffold:

- Monorepo workspace structure.
- User web app shell.
- Admin console placeholder.
- Application service API with an in-memory mock flow.
- DUDesign event and API contracts.
- Runtime gateway interface and mock runtime.
- Domain model definitions.
- Artifact storage abstraction.
- Architecture and module planning docs.

The mock flow already covers:

```text
create session
  -> create design job
  -> generate multiple variations
  -> stream job events
  -> preview a variation
  -> refine a variation
  -> submit annotations
  -> serve updated preview HTML
```

## Repository Layout

```text
apps/
  web/                 # User-facing web app
  admin/               # Admin and developer console
  api/                 # Application service API

packages/
  contracts/           # Stable DUDesign API and event contracts
  domain/              # Business models and statuses
  runtime-gateway/     # BabeL-O compatibility boundary
  artifact-store/      # Artifact storage abstraction

docs/
  online-design-platform-plan.md
  architecture-governance-plan.md
  modules/             # Per-module TODO and worklog docs
```

## Requirements

- Node.js >= 22
- npm

## Getting Started

Install dependencies:

```bash
npm install
```

Run type checks:

```bash
npm run typecheck
```

Run tests:

```bash
npm test
```

Start the API:

```bash
npm run dev:api
```

Start the user web app:

```bash
npm run dev:web
```

Default local URLs:

- API: `http://127.0.0.1:4000`
- Web: `http://localhost:3001`

If the web app needs a different API URL, set:

```bash
NEXT_PUBLIC_DUDESIGN_API_URL=http://127.0.0.1:4000
```

## Key Scripts

| Script | Description |
| --- | --- |
| `npm run typecheck` | Type-check all packages and apps. |
| `npm test` | Run default non-service-dependent unit/integration gates. |
| `npm run test:ux` | Run the UX HTTP smoke; requires API and Web servers to already be running. |
| `npm run test:ux:e2e` | Run browser E2E; requires API and Web servers to already be running. |
| `npm run dev:api` | Type-check, then run the API in watch mode. |
| `npm run dev:web` | Start the Next.js user web app on port 3001. |
| `npm run start:api` | Type-check, then start the built API. |
| `npm run start:web` | Start the built web app on port 3001. |

## Architecture Notes

DUDesign keeps a strict boundary between product logic and the BabeL-O runtime:

- Frontend code consumes DUDesign standard events, not raw BabeL-O `NexusEvent` values.
- Business data uses DUDesign IDs as primary identifiers.
- BabeL-O session and agent IDs are stored only as external runtime references.
- The runtime gateway is the only layer that understands BabeL-O protocol details.
- Generated artifacts must remain usable even if the runtime is unavailable.

See:

- [Online Design Platform Plan](docs/online-design-platform-plan.md)
- [Architecture Governance Plan](docs/architecture-governance-plan.md)
- [Module Planning Index](docs/modules/README.md)

## Development Priorities

Recommended next milestones:

1. Implement a local artifact store and make previews read from stored artifacts.
2. Add the minimal admin Job Monitor and Runtime Health views.
3. Replace the mock runtime with a single-variation BabeL-O adapter.
4. Extend the adapter to parallel variation generation.
5. Move from in-memory state to durable PostgreSQL/object storage.

## License

MIT. See [LICENSE](LICENSE).
