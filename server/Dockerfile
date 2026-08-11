# Build context is the repository root, not server/, because the image has to
# contain the built client as well:
#   docker build -f server/Dockerfile -t stockledger .

# The client is built first and thrown away except for its dist folder, so none
# of the frontend toolchain ends up in the image that runs.
FROM node:22-alpine AS client
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:22-alpine AS server-deps
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
# Generated after install because the client is built against the schema.
COPY server/prisma ./prisma
RUN npx prisma generate

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Runs as the image's unprivileged user rather than root.
RUN chown -R node:node /app
USER node

COPY --chown=node:node --from=server-deps /app/server/node_modules ./server/node_modules
COPY --chown=node:node --from=client /app/frontend/dist ./frontend/dist
COPY --chown=node:node server/ ./server/

WORKDIR /app/server
EXPOSE 5000

# Migrations run on boot rather than in the build, so the image does not need a
# database to be built and a rollback does not leave the schema ahead of the code.
CMD ["sh", "-c", "npx prisma migrate deploy && node index.js"]
