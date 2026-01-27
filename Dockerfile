FROM node:22-alpine

RUN npm install -g pnpm@latest

WORKDIR /app

COPY package.json /app

COPY package-lock.json /app

RUN pnpm install

COPY . /app

RUN pnpm build

EXPOSE 8005

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -q --spider http://localhost:8005/ || exit 1

CMD ["npm", "run", "dev"]
