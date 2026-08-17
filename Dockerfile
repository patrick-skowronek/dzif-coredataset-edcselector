FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN BASE_PATH=./ npm run build

FROM nginxinc/nginx-unprivileged:alpine

LABEL org.opencontainers.image.title="DZIF Core Dataset EDC Selector" \
      org.opencontainers.image.description="Select questions from the DZIF core dataset and export them for REDCap, LimeSurvey and other EDC systems." \
      org.opencontainers.image.source="https://github.com/patrick-skowronek/dzif-coredataset-edcselector" \
      org.opencontainers.image.licenses="Apache-2.0"

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
COPY LICENSE NOTICE /usr/share/nginx/html/

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
