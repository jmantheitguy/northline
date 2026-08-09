FROM node:26-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN apk add --no-cache python3 make g++
RUN npm ci
COPY . .
RUN NORTHLINE_ADMIN_EMAIL=build-only@invalid.local NORTHLINE_ADMIN_PASSWORD=build-only-placeholder npm run build

FROM node:26-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
