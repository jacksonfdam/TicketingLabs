# Multi-stage build: compile a static binary, ship it on a tiny base.
FROM golang:1.25-alpine AS build

WORKDIR /src
# Cache modules separately from source so code changes do not re-download the world.
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /out/server ./cmd/server

FROM alpine:3.20
RUN apk add --no-cache ca-certificates wget && adduser -D -u 10001 appuser
USER appuser
COPY --from=build /out/server /usr/local/bin/server

EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
    CMD wget -qO- http://localhost:8080/health || exit 1

ENTRYPOINT ["server"]
