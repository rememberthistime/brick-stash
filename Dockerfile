FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# The server itself has no dependencies. Reading drawer photos needs Claude Code, and Python with Pillow for the
# photo tool, so the image carries those too.
FROM node:22-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-pil ca-certificates tzdata \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g @anthropic-ai/claude-code && npm cache clean --force
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/package.json ./
# The only program a photo reading may run. It belongs to root here, so a reading can't rewrite it and then run it.
COPY --from=build --chmod=755 /app/server/photo-tools.py /usr/local/bin/photo-tools
ENV BRICK_DATA_DIR=/data
ENV BRICK_PHOTOS_DIR=/data/photos
# Home is in the data volume, so signing in to Claude (run "claude" in the container's console, once) survives
# updates to the image. Crops and reference pictures from photo readings go in its work folder.
ENV HOME=/data/.brick-stash
ENV BRICK_WORK_DIR=/data/.brick-stash/work
ENV DISABLE_AUTOUPDATER=1
EXPOSE 5173
VOLUME /data
CMD ["node", "server/index.mjs"]
