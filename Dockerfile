# Tank You Again — server (Fastify + WS) container for Fly.io.
# Built from the monorepo root so it can access shared/ and server/.

# ---------- Stage 1: build ----------
FROM node:22-slim AS build
WORKDIR /app

# OpenSSL is required by Prisma at install time on slim images.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy manifests first so docker can cache the install layer.
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/

# Install all workspaces (prisma generate runs in server's postinstall path
# but needs the schema, so we copy that before install).
COPY server/prisma server/prisma
RUN npm ci --no-audit --no-fund

# Copy source and build the server bundle via esbuild.
COPY tsconfig.json ./
COPY shared/ shared/
COPY server/ server/

RUN npx prisma generate --schema=server/prisma/schema.prisma
RUN npm run build --workspace=server

# ---------- Stage 2: runtime ----------
FROM node:22-slim AS runtime
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

# Only the artefacts the runtime needs: bundled server, generated prisma
# client, and the schema (for prisma migrate / db push at boot if you wire it).
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/server/dist /app/server/dist
COPY --from=build /app/server/prisma /app/server/prisma
COPY --from=build /app/package.json /app/server/package.json /app/

EXPOSE 3001

CMD ["node", "server/dist/index.js"]
