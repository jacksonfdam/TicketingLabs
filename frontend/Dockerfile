# Multi-stage: build the SPA with Node, serve the static bundle with nginx. The typed
# client (src/api/schema.d.ts) is generated from the contract and committed, so this
# build does not need the contract directory in its context.

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:stable-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
