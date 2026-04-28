# Release Process

    Component   How to release                  Where it goes
    ---------   --------------                  -------------
    CLI         yarn release orbit-cli           npm (orbit)
    Mobile      yarn release (from orbit-app)    Orbit mobile variants
    Web         Vercel / static hosting          Orbit web app
    Server      Docker / self-host / cloud       Orbit sync backend


## CLI

    Package          packages/orbit-cli
    npm name         orbit (install via "npm i -g orbit")
    Versioning       release-it, tags v{version}, branches: main or beta
    npm dist-tag     beta

    yarn release                   Interactive workspace picker
    yarn release orbit-cli         Release CLI directly

Flow: build (pkgroll) -> test (vitest) -> bump version -> commit -> tag -> npm publish -> GitHub release

CI: GitHub Actions `cli-smoke-test.yml` runs on push/PR to main (Linux + Windows, Node 20/24).
Release notes are AI-generated via `.release-it.notes.js`.


## Mobile

    Package          packages/orbit-app (Expo SDK 54 / React Native 0.81.4)
    3 variants       development (com.orbit.app.dev)
                     preview     (com.orbit.app.preview)
                     production  (com.orbit.app)

### Commands

    yarn release                       Interactive menu with all options below
    yarn release:build:developer       Dev + preview builds (6 total, iOS + Android)
    yarn release:build:appstore        Production builds with auto-submit
    yarn ota                           OTA update to preview channel
    yarn ota:production                OTA update to production channel (via EAS workflow)

### EAS Build Profiles

    Profile              Distribution   Channel
    -------              ------------   -------
    development          internal       development
    development-store    store          development
    preview              internal       preview
    preview-store        store          preview
    production           store          production

Version source is remote (EAS manages build numbers, auto-incremented).
Runtime version "20" - bump when native code changes to invalidate OTA.

### Automated Workflows

    preview.yaml         Push to main -> OTA to preview channel
    ota.yaml             Manual trigger -> OTA to production channel

### App Store Connect

    Team ID        466DQWDR8C


## Web

    Package          packages/orbit-app (same Expo app, web export)
    Dockerfile       Dockerfile.webapp
    Image            orbit web container
    K8s              deployment target TBD

Build: `expo export --platform web` -> nginx:alpine static serve.
Build args: `POSTHOG_API_KEY`, `REVENUE_CAT_STRIPE`.

CI/CD: build static web assets from the Expo app and deploy them to the current Orbit web host.
GitHub Actions `typecheck.yml` runs typecheck on push/PR to main.


## Server

    Package          packages/orbit-server
    Dockerfile       Dockerfile.server (production), Dockerfile (standalone w/ PGlite)
    Image            orbit-server:{version}
    K8s              deployment target TBD

Build: node:20 + ffmpeg, builds @orbit/wire + orbit-server.
Secrets and infrastructure are environment-specific.
Redis is optional depending on the deployment profile.
Metrics: Prometheus on port 9090 at /metrics.

CI/CD: build the server image and deploy it to the selected Orbit environment.


## Docs

    Site             current Orbit documentation entrypoint
    Repo             github.com/wwq20030329-oss/orbit

Docs currently live in this monorepo under `docs/`.
