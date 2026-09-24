FROM node:22-alpine AS base

RUN npm install --global pnpm@12.4.2
WORKDIR /workspace
COPY package.json pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --filter @sales-agent/web... --frozen-lockfile=false
COPY apps/web apps/web
WORKDIR /workspace/apps/web

EXPOSE 3000
CMD ["pnpm", "dev", "--hostname", "0.0.0.0"]
