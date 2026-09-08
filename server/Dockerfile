# OrbitPress Server Edition — all-in-one image.
# Build (from repo root):  docker build -f server/Dockerfile -t orbitpress-server .
# Run:                     docker run -d -p 8080:8080 -v orbitpress-data:/app/data \
#                            -e ORBITPRESS_TOKEN=choose-a-long-token orbitpress-server
FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /app

# Dependencies first for layer caching (package-lock.json is committed)
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

# Chromium with its OS dependencies (built-in scraper browser sessions)
RUN npx playwright install --with-deps chromium

COPY server/ .
# build stamp so the UI can always prove WHICH image is live
RUN date -u '+build %Y-%m-%d %H:%M UTC' > /app/public/build.txt

# Run as an unprivileged user; keep the data volume + browsers writable
RUN useradd --create-home --uid 1001 orbitpress \
 && mkdir -p /app/data \
 && chown -R orbitpress:orbitpress /app /ms-playwright
USER orbitpress

EXPOSE 8080
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/ping').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "index.js"]
