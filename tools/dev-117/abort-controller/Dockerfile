FROM node:24.20.0-alpine@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf

WORKDIR /app
COPY package.json package-lock.json server.mjs ./
USER node
ENV NODE_ENV=production
CMD ["node", "server.mjs"]
