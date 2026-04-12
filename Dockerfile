# Standalone orbit-server: single container, no external dependencies
# Uses PGlite (embedded Postgres), local filesystem storage, no Redis

# Stage 1: install dependencies
FROM node:20 AS deps

RUN apt-get update && apt-get install -y python3 make g++ build-essential && rm -rf /var/lib/apt/lists/*

WORKDIR /repo

COPY package.json yarn.lock ./
COPY scripts ./scripts
COPY patches ./patches

RUN mkdir -p packages/orbit-app packages/orbit-server packages/orbit-cli packages/orbit-agent packages/orbit-wire

COPY packages/orbit-app/package.json packages/orbit-app/
COPY packages/orbit-server/package.json packages/orbit-server/
COPY packages/orbit-cli/package.json packages/orbit-cli/
COPY packages/orbit-agent/package.json packages/orbit-agent/
COPY packages/orbit-wire/package.json packages/orbit-wire/

# Workspace postinstall requirements
COPY packages/orbit-app/patches packages/orbit-app/patches
COPY packages/orbit-server/prisma packages/orbit-server/prisma
COPY packages/orbit-cli/scripts packages/orbit-cli/scripts
COPY packages/orbit-cli/tools packages/orbit-cli/tools

RUN SKIP_ORBIT_WIRE_BUILD=1 yarn install --frozen-lockfile --ignore-engines

# Stage 2: copy source and type-check
FROM deps AS builder

COPY packages/orbit-wire ./packages/orbit-wire
COPY packages/orbit-server ./packages/orbit-server

RUN yarn workspace @orbit/wire build
RUN yarn workspace orbit-server build

# Stage 3: runtime
FROM node:20-slim AS runner

WORKDIR /repo

RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV PGLITE_DIR=/data/pglite

COPY --from=builder /repo/node_modules /repo/node_modules
COPY --from=builder /repo/packages/orbit-wire /repo/packages/orbit-wire
COPY --from=builder /repo/packages/orbit-server /repo/packages/orbit-server

VOLUME /data
EXPOSE 3005

CMD ["sh", "-c", "node_modules/.bin/tsx packages/orbit-server/sources/standalone.ts migrate && exec node_modules/.bin/tsx packages/orbit-server/sources/standalone.ts serve"]
