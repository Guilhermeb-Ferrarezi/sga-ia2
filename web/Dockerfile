FROM oven/bun:1.3.5 AS build

WORKDIR /app

COPY package.json ./
RUN bun install --frozen-lockfile

COPY . .

ARG VITE_API_BASE=/api
ENV VITE_API_BASE=$VITE_API_BASE

RUN bun run build

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
