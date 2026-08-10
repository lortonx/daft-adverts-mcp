# Build from monorepo root:
#   docker build -f packages/mcp-host/Dockerfile -t daft-mcp-host .
#   docker run --rm -p 3100:3100 --env-file .env daft-mcp-host

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

# Bind all interfaces. Prefer Coolify's PORT when set; default 3100 locally.
ENV MCP_HOST=0.0.0.0
ENV HOST=0.0.0.0
ENV PORT=3100
ENV MCP_HOST_PORT=3100

EXPOSE 3000 3100

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:'+(process.env.PORT||process.env.MCP_HOST_PORT||'3100')+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["bun", "packages/mcp-host/src/index.ts"]
