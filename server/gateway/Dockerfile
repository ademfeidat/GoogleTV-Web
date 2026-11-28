FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends adb ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json ./package.json
COPY src ./src

USER node
EXPOSE 8080
CMD ["node", "src/server.js"]
