# Cyber Neo Security Report

**Project:** ARFOODS (menu-ar)
**Path:** c:\Users\pc\OneDrive - Universidad EIA\Escritorio\ARFOOD\ARFOODS
**Date:** 2026-08-28
**Tech Stack:** pnpm monorepo — Next.js 15 (App Router) + React 19 + Supabase (`apps/web`, public menu + admin panel), Node/TypeScript worker with Puppeteer, Sharp, gltf-transform, Gradio client (`apps/worker`), shared Supabase Postgres schema with RLS (`packages/db`). Docker (worker only), GitHub Actions CI (present but empty).
**Scan Coverage:** ~100% of non-vendor source (115 files, small-tier full scan) — `apps/web/app`, `apps/web/components`, `apps/web/lib`, `apps/web/types`, `apps/worker/src`, `apps/worker/scripts`, `packages/db` (including all 5 SQL migrations), `apps/worker/Dockerfile`, `.github/workflows/ci.yml`, all 4 `package.json` manifests, `pnpm-lock.yaml`. Excluded: `node_modules`, `.next`, `.git`.

---

## Executive Summary

**Risk Score:** 81/100
**Overall Assessment:** Critical

| Severity | Count |
|----------|-------|
| Critical | 1 |
| High     | 3 |
| Medium   | 6 |
| Low      | 8 |
| Info     | 4 |

**Top 3 Priority Actions:**
1. Add a `.dockerignore` to `apps/worker/` (repo root) excluding `**/.env*` — the Docker build currently bakes the real Supabase **service-role key** and other secrets directly into image layers. Rotate all secrets in `apps/worker/.env`/`.env.local` if this image was ever built and shared.
2. Validate `sourcePhoto` in `POST /api/jobs` against an allowlist (must be the project's own Supabase Storage URL) — any self-registered user can currently point the worker's service-role-credentialed fetch at an internal address (SSRF).
3. Harden the worker's Docker image: run as a non-root `USER`, pin the `marlon360/usd-from-gltf:latest` base image to a digest, and stop disabling TLS verification during `apt-get`.

Overall, the application is **well-architected on the authorization side** — every mutating API route independently checks `supabase.auth.getUser()`, Row-Level-Security correctly scopes every tenant table to `owner_id = auth.uid()`, the service-role client is never reachable from client bundles, and no secrets are committed to git history. The issues found are concentrated in **infrastructure hardening** (Docker) and **two SSRF gaps** introduced by the self-service registration flow, plus a batch of dependency CVEs in dev-tooling and one production image-processing library.

---

## Findings

### Critical Findings

#### [CN-001] Docker build bakes real secrets (Supabase service-role key, HF/Meshy tokens) into image layers
- **Severity:** Critical (CVSS ~9.1)
- **CWE:** CWE-798 (Use of Hard-coded Credentials), CWE-200 (Exposure of Sensitive Information)
- **OWASP:** A02:2025 (Security Misconfiguration)
- **Location:** `apps/worker/Dockerfile:49` (build context = repo root; no `.dockerignore` exists anywhere in the repo)
- **Description:** The Dockerfile does `COPY apps/worker ./apps/worker` with no `.dockerignore` to exclude dotfiles. `apps/worker/.env` and `apps/worker/.env.local` exist on disk with real, populated values for `SUPABASE_SERVICE_ROLE_KEY` (bypasses all Row-Level-Security), `HF_TOKEN`, `MESHY_API_KEY`, and `REVALIDATE_SECRET`. These get copied verbatim into a permanent image layer, retrievable by anyone who can pull or inspect the image (`docker history`, `docker save`, or a registry pull), regardless of any later `ENV` override at runtime.
- **Evidence:**
  ```dockerfile
  WORKDIR /app
  COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
  COPY packages/db ./packages/db
  COPY apps/worker ./apps/worker     # copies apps/worker/.env and .env.local too — no .dockerignore anywhere
  ```
- **Remediation:**
  ```
  # apps/worker/.dockerignore (or repo-root .dockerignore, since build context is repo root)
  **/.env
  **/.env.*
  !**/.env.example
  **/node_modules
  **/.git
  ```
  Never rely on directory `COPY` to skip unwanted files — exclude explicitly. **Rotate `SUPABASE_SERVICE_ROLE_KEY`, `HF_TOKEN`, `MESHY_API_KEY`, and `REVALIDATE_SECRET`** if this image was ever built and pushed or shared before this fix lands. Inject secrets at runtime only (`docker run -e ...` or an orchestrator secret store).
- **References:** CWE-798, CWE-200, OWASP A02:2025

---

### High Findings

#### [CN-002] SSRF in worker photo-processing pipeline (service-role-credentialed fetch on attacker-controlled URL)
- **Severity:** High (CVSS ~8.2)
- **CWE:** CWE-918 (Server-Side Request Forgery)
- **OWASP:** A05:2025 (Injection)
- **Location:** `apps/web/app/api/jobs/route.ts:35-42`, `apps/worker/src/index.ts:45-57`, also read by `apps/worker/src/generators/{instantmesh,triposr,meshy}.ts`
- **Description:** `POST /api/jobs` accepts `sourcePhoto` as a free-form string and only checks it is non-empty — no URL scheme/host allowlist. It's stored verbatim and later fetched directly by the worker (`fetch(photoUrl)`), which runs with `SUPABASE_SERVICE_ROLE_KEY` and has broader network reach than the public web tier. Because `/registro` is self-service (any email can create an account and a restaurant), an attacker can register, own a `dishId`, and POST a `sourcePhoto` pointing at an internal address (cloud metadata endpoint, localhost, internal service) instead of a real Storage URL. The dish-ownership check under RLS proves nothing about `sourcePhoto` itself.
- **Evidence:**
  ```ts
  // apps/web/app/api/jobs/route.ts
  const { dishId, sourcePhoto } = (await request.json()) as CreateJobBody;
  if (!dishId || !sourcePhoto) { ... }              // no scheme/host validation
  ...
  .insert({ ..., source_photo: sourcePhoto, status: 'queued' })
  ```
  ```ts
  // apps/worker/src/index.ts
  async function stripExifAndReupload(photoUrl: string, dishId: string) {
    const response = await fetch(photoUrl);          // fetches attacker-controlled URL
  ```
- **Remediation:**
  ```ts
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const expectedPrefix = `${SUPABASE_URL}/storage/v1/object/public/dish-photos/`;
  if (!sourcePhoto.startsWith(expectedPrefix)) {
    return NextResponse.json({ error: 'sourcePhoto inválida', code: 'API_JOBS_INVALID_SOURCE' }, { status: 400 });
  }
  ```
  Add a second layer in the worker: resolve the hostname and reject private/loopback/link-local ranges (RFC1918, 127.0.0.0/8, 169.254.0.0/16, `::1`) before fetching.
- **References:** CWE-918, OWASP A05:2025

#### [CN-003] Worker Docker container runs as root
- **Severity:** High (CVSS ~7.5)
- **CWE:** CWE-250 (Execution with Unnecessary Privileges)
- **OWASP:** A02:2025 (Security Misconfiguration)
- **Location:** `apps/worker/Dockerfile:17-58` (entire final stage)
- **Description:** No `USER` directive anywhere in the final `node:22-slim` stage — the Node worker and its Chromium subprocess (Puppeteer, which parses attacker-influenceable image/model input) run as `root` for the container's full lifetime, widening the blast radius of any future container-escape or dependency compromise (e.g. combined with CN-002's SSRF or a future libvips/Chromium CVE).
- **Evidence:**
  ```dockerfile
  FROM node:22-slim
  ...
  WORKDIR /app/apps/worker
  RUN pnpm install --frozen-lockfile
  RUN pnpm run build
  CMD ["pnpm", "start"]   # no USER instruction anywhere — runs as root
  ```
- **Remediation:**
  ```dockerfile
  RUN groupadd -r worker && useradd -r -g worker -d /app worker \
      && chown -R worker:worker /app
  USER worker
  CMD ["pnpm", "start"]
  ```
  Verify Chromium still launches under the new UID.
- **References:** CWE-250, OWASP A02:2025

#### [CN-004] `sharp` in the worker bundles a vulnerable libvips (multiple CVEs) — production dependency
- **Severity:** High (CVSS ~7.5)
- **CWE:** CWE-1395 (Dependency on Vulnerable Third-Party Component)
- **OWASP:** A03:2025 (Software Supply Chain Failures)
- **Location:** `apps/worker/package.json:21` — `"sharp": "^0.33.5"` (resolved `0.33.5`)
- **Description:** `sharp <0.35.0` bundles a libvips affected by CVE-2026-33327, CVE-2026-33328, CVE-2026-35590, CVE-2026-35591 (GHSA-f88m-g3jw-g9cj). This is a **production** dependency: the worker processes user-supplied dish photos and generated textures through this exact image pipeline, so untrusted image bytes reach the vulnerable code. `apps/web`'s own `sharp` is already pinned to the safe `^0.35.3` — only the worker lags behind.
- **Evidence:** `pnpm audit` advisory 1124066; `apps/worker` resolves `sharp@0.33.5` directly and transitively via `@gltf-transform/cli`.
- **Remediation:** Bump `apps/worker/package.json` `sharp` to `^0.35.3`+ to match `apps/web`.
- **References:** CWE-1395, OWASP A03:2025

---

### Medium Findings

#### [CN-005] SSRF in QR-code logo compositing route
- **Severity:** Medium (CVSS ~5.9)
- **CWE:** CWE-918 (Server-Side Request Forgery)
- **OWASP:** A05:2025 (Injection)
- **Location:** `apps/web/app/api/qr/route.ts:121`, `apps/web/components/admin/RestaurantSettingsForm.tsx:117-124`, `packages/db/migrations/0001_initial_schema.sql:12`
- **Description:** `logo_url` is set via a client-side `<input type="url">` with no server-side or DB-level scheme constraint (unlike `website_url`, which does have a `CHECK (website_url ~* '^https?://')` constraint). `GET /api/qr` fetches the owner's `logo_url` server-side to composite it into the QR PNG. A self-registered attacker can set `logo_url` to an internal address and use the response (present/absent logo, timing) as a blind SSRF / internal-port-scanning primitive.
- **Evidence:**
  ```ts
  // apps/web/app/api/qr/route.ts
  const logoResponse = await fetch(logoUrl);   // no host/scheme validation
  ```
- **Remediation:** Add the same scheme constraint already used for `website_url`:
  ```sql
  alter table public.restaurants
    add constraint restaurants_logo_url_scheme
    check (logo_url is null or logo_url ~* '^https?://');
  ```
  Then validate the resolved hostname against private/loopback/link-local ranges before fetching in `buildQrPng`.
- **References:** CWE-918, OWASP A05:2025

#### [CN-006] `extract-zip` (via Puppeteer) — unvalidated symlink path traversal, no fix released yet
- **Severity:** Medium (CVSS ~5.5 — downgraded from upstream Critical rating given limited real-world reachability)
- **CWE:** CWE-22 (Path Traversal)
- **OWASP:** A03:2025 (Software Supply Chain Failures)
- **Location:** `apps/worker/package.json:20` — `"puppeteer": "^23.6.0"` → `@puppeteer/browsers` → `extract-zip@2.0.1`
- **Description:** `extract-zip <=2.0.1` doesn't validate symlink targets during extraction (CVE-2026-56876, GHSA-jmr9-qjv8-65gv). No patched release exists upstream yet. In this codebase the path is used by Puppeteer to unpack its own downloaded Chromium binary, not an attacker-supplied archive, which limits practical exploitability — but should be tracked.
- **Evidence:** `pnpm audit` advisory 1139346, reached via `apps/worker > puppeteer@23.11.1 > @puppeteer/browsers@2.6.1 > extract-zip@2.0.1`.
- **Remediation:** No upstream fix yet — track the advisory. Confirm no worker code path feeds user-controlled zip files through this dependency (current review found none).
- **References:** CWE-22, OWASP A03:2025

#### [CN-007] Unpinned, unverified third-party Docker base image
- **Severity:** Medium (CVSS ~5.3)
- **CWE:** CWE-1104 (Use of Unmaintained Third-Party Components), CWE-829
- **OWASP:** A03:2025 (Software Supply Chain Failures)
- **Location:** `apps/worker/Dockerfile:12`
- **Description:** `FROM marlon360/usd-from-gltf:latest` pulls an individual (non-verified-publisher) Docker Hub image by a floating tag. A future build can silently pull different content if the tag moves (maintainer action or account compromise), and the binaries it provides (`USDinst`, `ufg`, `libpython2.7.so`) are copied straight into the final image.
- **Evidence:**
  ```dockerfile
  FROM marlon360/usd-from-gltf:latest AS usdtools
  ...
  COPY --from=usdtools /usr/src/app/USDinst /usr/src/app/USDinst
  ```
- **Remediation:** Pin to an immutable digest: `FROM marlon360/usd-from-gltf@sha256:<digest> AS usdtools`. Consider vendoring/re-hosting these specific binaries in a controlled registry.
- **References:** CWE-1104, OWASP A03:2025

#### [CN-008] TLS certificate verification disabled during Docker build (`apt-get`)
- **Severity:** Medium (CVSS ~5.9)
- **CWE:** CWE-295 (Improper Certificate Validation)
- **OWASP:** A03:2025 (Software Supply Chain Failures)
- **Location:** `apps/worker/Dockerfile:23-28`
- **Description:** The build disables HTTPS peer verification (`Acquire::https::Verify-Peer=false`) for the `apt-get` that installs `chromium`. Per the inline comment this was a workaround for a local network issue, but as written it runs identically in CI/production builds, making every build of this image susceptible to MITM injection of a malicious `chromium` package.
- **Evidence:**
  ```dockerfile
  RUN apt-get -o Acquire::https::Verify-Peer=false update \
      && apt-get -o Acquire::https::Verify-Peer=false install -y --no-install-recommends chromium ca-certificates
  ```
- **Remediation:** Remove the verification bypass; `node:22-slim` already ships working CA certs before this `RUN` executes. If a specific network genuinely requires the bypass, scope it to a documented, isolated dev script — never the checked-in Dockerfile used for all builds including production/CI.
- **References:** CWE-295, OWASP A03:2025

#### [CN-009] No multi-stage Docker build — dev toolchain and source ship in the runtime image
- **Severity:** Medium (CVSS ~4.8)
- **CWE:** CWE-1104
- **OWASP:** A02:2025 (Security Misconfiguration)
- **Location:** `apps/worker/Dockerfile:44-58`
- **Description:** `pnpm install --frozen-lockfile` (including devDependencies) and `pnpm run build` both run in the single stage that ships. TypeScript source, dev dependencies, and the full pnpm store remain in the shipped image — unnecessary attack surface.
- **Evidence:**
  ```dockerfile
  WORKDIR /app/apps/worker
  RUN pnpm install --frozen-lockfile
  RUN pnpm run build
  CMD ["pnpm", "start"]
  ```
- **Remediation:** Split into a `builder` stage (full install + build) and a final stage that copies only `dist/` and production-pruned `node_modules` (`pnpm install --prod --frozen-lockfile`). Validate native bindings (sharp, gltf-transform) survive the prune before switching.
- **References:** CWE-1104, OWASP A02:2025

#### [CN-010] No security headers configured on the Next.js app (CSP, HSTS, X-Frame-Options, etc.)
- **Severity:** Medium (CVSS ~5.4)
- **CWE:** CWE-1021 (Improper Restriction of Rendered UI Layers), CWE-693
- **OWASP:** A02:2025 (Security Misconfiguration)
- **Location:** `apps/web/next.config.ts:1-18`
- **Description:** `next.config.ts` only configures `images.remotePatterns` — no `headers()` function at all. The session-cookie-authenticated admin panel is therefore embeddable in an iframe from any origin (clickjacking against the owner's own restaurant-management actions), and there's no CSP to constrain the impact of any future XSS.
- **Evidence:**
  ```ts
  const nextConfig: NextConfig = { images: { remotePatterns: [ /* ... */ ] } };
  export default nextConfig;
  ```
- **Remediation:**
  ```ts
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ],
    }];
  }
  ```
  Add a CSP once script/style/image origins in use are enumerated. Verify whether Vercel already injects HSTS in production before assuming it's missing end-to-end.
- **References:** CWE-1021, CWE-693, OWASP A02:2025

---

### Low & Informational Findings

#### [CN-011] Vitest devDependency — arbitrary file read / code execution via UI server
- **Severity:** Low (downgraded from upstream Critical rating — dev-only tool, not exposed unless `vitest --ui` is explicitly run with network access, which is not part of this project's normal workflow)
- **CWE:** CWE-22, CWE-862 | **Location:** `apps/web/package.json:44`, `apps/worker/package.json:27`, `packages/db/package.json:18` (`vitest ^2.1.5`, resolved 2.1.9; CVE-2026-47429)
- **Remediation:** Bump `vitest` to `>=3.2.6` in all three workspaces.

#### [CN-012] PostCSS transitive dependency — path traversal / arbitrary `.map` disclosure / XSS (3 CVEs)
- **Severity:** Low (downgraded — build-time only, processes the developer's own CSS, not runtime/user input)
- **CWE:** CWE-22, CWE-200 | **Location:** `apps/web/package.json:23` → `next@15.5.23` → `postcss@8.4.31` (CVE-2026-45623, CVE-2026-73646, CVE-2026-41305)
- **Remediation:** No direct dependency to bump — add a pnpm `overrides` entry (`"postcss": ">=8.5.23"`) in the root `package.json`, or wait for a Next.js patch release.

#### [CN-013] Vite dev-server dependency cluster — 3 CVEs (not exposed in production)
- **Severity:** Low (downgraded — Next.js production build does not use the Vite dev server; only affects local development)
- **CWE:** CWE-22, CWE-73, CWE-346 | **Location:** transitive `vite@5.4.21` / `esbuild@0.21.5` via `@vitejs/plugin-react`, `vitest` (CVE-2026-53571 fs.deny bypass, CVE-2026-39365 `.map` path traversal, CVE-2026-53632 NTLMv2 hash disclosure on Windows, GHSA-67mh esbuild cross-origin)
- **Remediation:** Upgrading `vitest`/`@vitejs/plugin-react` to versions pulling `vite >=6.4.3` resolves all four in one pass.

#### [CN-014] `X-Powered-By: Next.js` header not disabled
- **Severity:** Low | **CWE:** CWE-200 | **Location:** `apps/web/next.config.ts`
- **Remediation:** Add `poweredByHeader: false`.

#### [CN-015] Persistent 1-year session cookie with no re-authentication or idle-timeout policy
- **Severity:** Low | **CWE:** CWE-613 | **Location:** `apps/web/middleware.ts:8,25-38`
- **Description:** `SESSION_MAX_AGE = 60 * 60 * 24 * 365` is a deliberate PWA-convenience tradeoff, but a stolen session cookie grants a full year of admin access with no forced re-auth.
- **Remediation:** Ensure the Supabase refresh token is server-side revocable (so a reported-stolen device can actually be killed); consider a "log out other devices" action.

#### [CN-016] Non-constant-time comparison for webhook shared secret
- **Severity:** Low | **CWE:** CWE-208 | **Location:** `apps/web/app/api/webhooks/job-done/route.ts:12-13`
- **Description:** `secret !== process.env.REVALIDATE_SECRET` is a timing side-channel in principle; low real-world risk since the endpoint only triggers an ISR revalidation (no data read/write).
- **Remediation:** Use `crypto.timingSafeEqual` on fixed-length (hashed) buffers.

#### [CN-017] Real credentials in untracked local `.env*` files (workspace hygiene, not a git exposure)
- **Severity:** Low | **CWE:** CWE-312 | **Location:** `.env.local`, `apps/web/.env.local`, `apps/worker/.env`, `apps/worker/.env.local`
- **Description:** All four files are correctly gitignored and were never committed (confirmed via `git log --all --full-history`). They contain real Supabase anon + **service-role** keys and a Vercel OIDC token. Since the project directory lives under OneDrive sync, the residual risk is careless sharing (screen share, zip, support ticket) rather than git exposure.
- **Remediation:** No code change needed; avoid pasting these files' contents anywhere, and rotate the service-role key if it's ever shared with a teammate outside a secrets manager.

#### [CN-018] CI workflow file exists but is completely empty
- **Severity:** Low | **CWE:** CWE-1104 | **Location:** `.github/workflows/ci.yml` (0 bytes, empty since the initial commit)
- **Description:** No jobs, no triggers — nothing runs. There's currently no automated lint/type-check/test gate, no `pnpm install --frozen-lockfile` enforcement, and no dependency scanning wired into CI.
- **Remediation:**
  ```yaml
  name: CI
  on:
    pull_request:
    push:
      branches: [main]
  permissions:
    contents: read
  jobs:
    build-test:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
        - uses: pnpm/action-setup@a7487c7e89a18df4991f7f222e4898a00d66ddda # v4.1.0
          with: { version: 9.15.0 }
        - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
          with: { node-version: '20', cache: 'pnpm' }
        - run: pnpm install --frozen-lockfile
        - run: pnpm -r lint
        - run: pnpm -r test
        - run: pnpm -r build
  ```

#### [CN-019] `.gitignore` has no key/certificate file patterns
- **Severity:** Info | **Location:** `.gitignore` — no `*.pem`/`*.key`/`*.p12`/`*.pfx` entries. No such files exist yet; forward-looking hardening only.

#### [CN-020] Missing `HEALTHCHECK` in worker Dockerfile
- **Severity:** Info | **Location:** `apps/worker/Dockerfile`. Low priority for a poll-loop worker with no HTTP endpoint.

#### [CN-021] `lucide-react` pinned at an unusual `^1.34.0` version line
- **Severity:** Info | **Location:** `apps/web/package.json:22`
- **Description:** This icon library has historically released under a `0.4xx+` versioning scheme rather than `1.x`. It resolves consistently in `pnpm-lock.yaml`, so this is **not** evidence of a dependency-confusion/hijack — version-number anomalies are simply one of the common tells worth a manual sanity check by the team.

#### [CN-022] Pre-1.0 (`^0.x`) dependency pins
- **Severity:** Info | **Location:** `apps/web/package.json:20` (`@supabase/ssr ^0.12.4`), `apps/web/package.json:28` (`sharp ^0.35.3`). Pre-1.0 packages can introduce breaking API changes on any minor bump — track upstream 1.0 releases.

---

## Dependency Vulnerabilities

`pnpm audit` (the correct tool for this project's `pnpm-lock.yaml`; `npm audit` is not usable here — it failed with `ENOLOCK` since there's no `package-lock.json`) found 9 distinct advisories across 919 resolved dependencies:

| Package | Current (resolved) | CVE / Advisory | Severity | Fix Version |
|---------|---------------------|-----------------|----------|-------------|
| vitest | 2.1.9 | CVE-2026-47429 | Critical (upstream) / Low (contextual) | ≥3.2.6 |
| vite (transitive) | 5.4.21 | CVE-2026-53571 | High (upstream) / Low (contextual) | ≥6.4.3 |
| sharp (apps/worker) | 0.33.5 | CVE-2026-33327/33328/35590/35591 | High | ≥0.35.3 |
| postcss (transitive via next) | 8.4.31 | CVE-2026-45623 | High (upstream) / Low (contextual) | ≥8.5.12 |
| extract-zip (via puppeteer) | 2.0.1 | CVE-2026-56876 | High (upstream) / Medium (contextual) | none yet |
| vite (transitive) | 5.4.21 | CVE-2026-39365 | Medium | ≥6.4.3 |
| vite/launch-editor (transitive) | 5.4.21 | CVE-2026-53632 | Medium | ≥6.4.3 |
| postcss (transitive via next) | 8.4.31 | CVE-2026-69153 | Medium | ≥8.5.23 |
| esbuild (transitive via vite) | 0.21.5 | GHSA-67mh-4wv8-2f99 | Medium | ≥0.25.0 |

Note: severities above are shown both as upstream-rated and as this report's contextually-adjusted rating (see CN-011/012/013) — dev-tooling-only CVEs were downgraded because they require conditions (exposed dev server, attacker-controlled build-time CSS) that don't apply to this app's actual runtime.

---

## Supply Chain Assessment

- **Lock file status:** `pnpm-lock.yaml` present and **committed to git** (verified via `git ls-files`) — provides real reproducible-install protection, contingent on CI actually enforcing it (see CN-018).
- **Dependency pinning:** All four `package.json` files use `^` (caret) ranges consistently — normal for a small team project, mitigated by the committed lockfile. No `*`/`latest` wildcards found.
- **Dependency confusion:** `@menu-ar/db` is referenced via pnpm's `workspace:*` protocol, which resolves purely locally and is never fetched from the public registry — not a real dependency-confusion risk despite the npm-scope-style name.
- **Typosquatting:** All dependency names across the four manifests were checked against known-popular package names — no suspicious 1-2 character variants found.
- **Known compromised packages:** None of `event-stream`, `ua-parser-js`, `node-ipc`, `colors`, `faker`, `coa`, `rc`, `request` are present.
- **CI/CD security:** `.github/workflows/ci.yml` is empty — no script-injection, permissions, or action-pinning surface exists today because nothing executes (see CN-018). Once populated, follow the pinned-SHA-actions / scoped-permissions template provided there.

---

## Scan Metadata
- **Scanner:** Cyber Neo v0.1.0
- **Duration:** ~35 minutes (5 parallel subagent phases + synthesis)
- **External tools used:** `pnpm audit` (dependency scanning), Cyber Neo's built-in `scan_secrets.py` and `check_lockfiles.py` scripts. Trivy, Semgrep, and Gitleaks were not available in this environment — `pnpm audit` was confirmed as the correct working substitute for this pnpm-based project.
- **Files scanned:** 115 non-vendor files (full scan, small-tier), plus `pnpm-lock.yaml` and all `.env*`/`.gitignore`/CI/Docker config.
- **Files skipped:** `node_modules`, `.next`, `.git` (vendor/build artifacts, not eligible for source review).
