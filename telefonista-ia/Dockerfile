FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY empresas ./empresas
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
CMD ["node", "src/servidor.ts"]
