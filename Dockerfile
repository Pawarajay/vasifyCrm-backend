FROM node:22-alpine

WORKDIR /app

RUN addgroup -g 1001 nodejs && adduser -S nextjs -u 1001

RUN npm install -g pnpm@latest

COPY package.json /app

COPY package-lock.json /app

RUN pnpm install

COPY . /app

RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 8005

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -q --spider http://localhost:8005/ || exit 1

CMD ["npm", "start"]
