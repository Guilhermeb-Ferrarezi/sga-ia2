FROM oven/bun:1.3.5 AS base

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src

RUN bun run prisma:generate

EXPOSE 5000

CMD ["bun", "run", "start"]
