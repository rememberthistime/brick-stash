FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# The server has no dependencies, so only the built app and the server itself are needed to run
FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/package.json ./
ENV BRICK_DATA_DIR=/data
ENV BRICK_PHOTOS_DIR=/data/photos
EXPOSE 5173
VOLUME /data
CMD ["node", "server/index.mjs"]
