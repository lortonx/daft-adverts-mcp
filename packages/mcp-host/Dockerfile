# Build from monorepo root:
#   docker build -f packages/mcp-host/Dockerfile -t daft-mcp-host .
#   docker run --rm -p 3100:3100 --env-file .env \
#     -v daft-chrome:/data/daft-chrome \
#     daft-mcp-host
#
# Enquiry: headed Chrome + Xvfb (DAFT_ENQUIRY_MODE=chrome). No Tailscale.

FROM oven/bun:1

WORKDIR /app

COPY package.json bun.lock ./
COPY packages/daft-api/package.json packages/daft-api/
COPY packages/daft-mcp/package.json packages/daft-mcp/
COPY packages/adverts-api/package.json packages/adverts-api/
COPY packages/adverts-mcp/package.json packages/adverts-mcp/
COPY packages/mcp-host/package.json packages/mcp-host/

RUN bun install --frozen-lockfile

COPY packages/daft-api packages/daft-api
COPY packages/daft-mcp packages/daft-mcp
COPY packages/adverts-api packages/adverts-api
COPY packages/adverts-mcp packages/adverts-mcp
COPY packages/mcp-host packages/mcp-host

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    curl ca-certificates gnupg \
    xvfb \
    fonts-liberation fonts-noto-color-emoji \
    libasound2 libatk-bridge2.0-0 libatk1.0-0 libcups2 libdbus-1-3 \
    libdrm2 libgbm1 libgtk-3-0 libnspr4 libnss3 libxcomposite1 \
    libxdamage1 libxrandr2 libxshmfence1 libxss1 libxtst6 xdg-utils \
  && curl -fsSL https://dl.google.com/linux/linux_signing_key.pub \
    | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg \
  && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" \
    > /etc/apt/sources.list.d/google-chrome.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends google-chrome-stable \
  && rm -rf /var/lib/apt/lists/*

COPY packages/mcp-host/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh \
  && mkdir -p /data/daft-chrome

ENV MCP_HOST=0.0.0.0
ENV HOST=0.0.0.0
ENV PORT=3100
ENV MCP_HOST_PORT=3100
ENV CHROME_PATH=/usr/bin/google-chrome-stable
ENV DAFT_CHROME_XVFB=1
ENV DAFT_CHROME_DISPLAY=:99
ENV DAFT_CHROME_DATA_DIR=/data/daft-chrome
ENV DAFT_CHROME_IDLE_MS=90000
ENV DAFT_ENQUIRY_MODE=chrome

EXPOSE 3000 3100

HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT:-${MCP_HOST_PORT:-3100}}/health" || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
