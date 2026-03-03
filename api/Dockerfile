FROM oven/bun:1.3.5 AS base

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY tsconfig.json ./
COPY tsconfig.build.json ./
COPY prisma ./prisma
RUN bun run prisma:generate

COPY src ./src

RUN bun run build

EXPOSE 5000

CMD ["bun", "dist/index.js"]
