FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src
COPY tsconfig.json ./
EXPOSE 3004
HEALTHCHECK --interval=5s --timeout=3s --retries=10 CMD wget -qO- http://localhost:3004/health || exit 1
CMD ["npx", "tsx", "src/server.ts"]
