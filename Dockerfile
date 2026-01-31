FROM oven/bun:1.3.6-slim

WORKDIR /app

COPY package.json .

RUN bun update --production

RUN bun install --production

COPY . .

ENTRYPOINT [ "bun", "run", "start" ]