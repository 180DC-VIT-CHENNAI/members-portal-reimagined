# 🚀 180 Degrees Consulting VIT Chennai — Monorepo

This repository contains the complete codebase for the **180 Degrees Consulting VIT Chennai** platform. It is structured as a Turborepo and consists of multiple Cloudflare Worker applications and shared packages.

For the agent-first guide, project mode, authoritative sources, commands, and hazards, see [AGENTS.md](./AGENTS.md). For a navigation index of all documentation, see [docs/INDEX.md](./docs/INDEX.md).

## 📦 Tech Stack

- **Turborepo** – Monorepo management
- **pnpm** – Package manager
- **Cloudflare Workers** – Backend services
- **TypeScript**
- **Vite** – Frontend
- **Hono** – Worker framework

---

# 📁 Repository Structure

```text
.
├── apps/
│   ├── frontend/         # Vite + React SPA
│   ├── admin-api/        # Admin API Worker (production backend)
│   ├── public-api/       # Public API Worker (placeholder)
│   └── job-processor/    # Queue consumer (placeholder)
│
├── packages/
│   └── db/               # Placeholder: do not use schema.sql as authoritative
│
├── docs/                 # Agent-first documentation
│   ├── INDEX.md
│   ├── product/
│   ├── domain/
│   ├── architecture/
│   ├── contracts/
│   ├── design/
│   ├── execution/
│   ├── compatibility/
│   ├── quality/
│   └── operations/
│
├── AGENTS.md
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

---

# 📋 Prerequisites

Ensure the following tools are installed before getting started:

- Node.js **18+**
- pnpm
- Git
- Wrangler CLI

Install Wrangler globally:

```bash
npm install -g wrangler
```

Verify installations:

```bash
node -v
pnpm -v
wrangler --version
```

---

# ⚙️ Installation

Clone the repository:

```bash
git clone https://github.com/180DC-VIT-CHENNAI/180dc-admin-website.git
```

Move into the project:

```bash
cd 180dc-admin-website
```

Install dependencies:

```bash
pnpm install
```

---

# 🏗️ Build the Monorepo

Build every application and package:

```bash
pnpm turbo run build
```

Or using npx:

```bash
npx turbo run build
```

---

# 💻 Development

Start an individual Cloudflare Worker.

## Public API

```bash
cd apps/public-api
pnpm wrangler dev
```

## Admin API

```bash
cd apps/admin-api
pnpm wrangler dev
```

## Job Processor

```bash
cd apps/job-processor
pnpm wrangler dev
```

## Frontend

```bash
cd apps/frontend
pnpm dev
```

---

# 🚀 Deployment

Authenticate with Cloudflare:

```bash
wrangler login
```

Deploy an application:

```bash
pnpm wrangler deploy
```

Or deploy from an individual app directory:

```bash
cd apps/admin-api
pnpm wrangler deploy
```

Refer to each application's `BUILD_AND_DEPLOY.md` for service-specific deployment instructions.

---

# 📜 Available Commands

| Command | Description |
|----------|-------------|
| `pnpm install` | Install all dependencies |
| `pnpm turbo run build` | Build all apps and packages (currently frontend only) |
| `pnpm turbo run dev` | Run development tasks (frontend only) |
| `pnpm wrangler dev` | Start a Worker locally |
| `pnpm wrangler deploy` | Deploy a Worker |

Note: `lint` and `test` scripts are not yet configured. See `docs/quality/testing-strategy.md`.

---

# 🌐 Environment Variables

Each Worker may require its own environment configuration.

For local development, create a `.dev.vars` file inside `apps/admin-api`:

```env
CLERK_SECRET_KEY=sk_test_...
ENVIRONMENT=development
SPACEMAIL_SMTP_USER=technical@180dcvitc.org
SPACEMAIL_SMTP_PASS=
```

For the frontend, create `apps/frontend/.env.local`:

```env
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_API_BASE_URL=http://127.0.0.1:8787
```

For production, store secrets securely using Wrangler:

```bash
wrangler secret put CLERK_SECRET_KEY
wrangler secret put SPACEMAIL_SMTP_USER
wrangler secret put SPACEMAIL_SMTP_PASS
```

See `docs/operations/deployment.md` for full environment setup.

---

# 📚 Documentation

For agent and contributor guidance, see [AGENTS.md](./AGENTS.md) and [docs/INDEX.md](./docs/INDEX.md).

Documentation lives under `docs/`:

- `docs/design/DESIGN.md` — visual and UX design constraints
- `docs/design/plan.md` — frontend design plan
- `docs/product/REPORT.md` — feature inventory and product narrative
- `docs/operations/NEWSLETTER_EDITOR.md` — newsletter editor operational guide
- `docs/operations/SPACEMAIL_SETUP.md` — Spacemail migration (DNS fix, SMTP, Ken-style newsletter plan)
- `docs/operations/SES_SETUP.md` — earlier Amazon SES plan (superseded)
- `docs/operations/BUILD_AND_DEPLOY.md` — build and deployment instructions
- `docs/architecture/decisions/README.md` — architecture decision record index
- `docs/architecture/backend-architecture-cloudflare.txt` — historical/aspirational design (not current)

---

# 🤝 Contributing

1. Create a feature branch.

```bash
git checkout -b feature/my-feature
```

2. Commit your changes.

```bash
git commit -m "feat: add new feature"
```

3. Push your branch.

```bash
git push origin feature/my-feature
```

4. Open a Pull Request.

---

# 📄 License

This repository is maintained by **180 Degrees Consulting VIT Chennai**.

For licensing information, please refer to the project's LICENSE file.
