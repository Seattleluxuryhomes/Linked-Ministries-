# Behavioral Health by Cross Universal on Railway (or any Docker host): one image, the server and its pages. No build step.
# Railway reads railway.json, which points here.
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY . .
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
USER node
CMD ["node", "server/index.mjs"]
