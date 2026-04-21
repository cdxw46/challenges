FROM node:22-bookworm

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json prisma.config.ts ./
COPY apps ./apps
COPY packages ./packages
COPY prisma ./prisma
COPY .env.example ./.env.example

RUN pnpm install --frozen-lockfile
RUN pnpm exec prisma generate
RUN pnpm --filter @smurfx/web build

EXPOSE 3000
CMD ["pnpm", "--filter", "@smurfx/web", "start"]
