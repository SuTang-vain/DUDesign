# DUDesign

DUDesign is a hosted front-end design platform built around a four-layer architecture:

1. User experience layer.
2. Admin and developer console layer.
3. Application service layer.
4. Runtime compatibility layer for BabeL-O.

Planning documents live under `docs/`. The first implementation slice creates the contract-first monorepo skeleton so frontend, backend, and runtime-adapter work can proceed independently.

## Workspace Layout

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
```

