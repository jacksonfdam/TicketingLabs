#!/usr/bin/env bash
# Generate a local dev CA and the certs for gateway <-> backend mutual TLS:
#   ca.crt / ca.key         the private CA that signs both sides
#   server.crt / server.key the backend's server cert (SAN: backend, localhost)
#   client.crt / client.key the gateway's client cert (it must present this to connect)
#
# Output goes to infra/tls/certs/, which is gitignored — private keys never enter the
# repository. Re-runnable; overwrites. Requires openssl.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p certs
cd certs

DAYS=825

# --- CA ---
openssl genrsa -out ca.key 4096 >/dev/null 2>&1
openssl req -x509 -new -nodes -key ca.key -sha256 -days "$DAYS" \
  -subj "/CN=Ticketing Labs Local Dev CA" -out ca.crt >/dev/null 2>&1

# --- backend server cert (SAN covers the compose service name and localhost) ---
openssl genrsa -out server.key 2048 >/dev/null 2>&1
openssl req -new -key server.key -subj "/CN=backend" -out server.csr >/dev/null 2>&1
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -days "$DAYS" -sha256 -out server.crt \
  -extfile <(printf "subjectAltName=DNS:backend,DNS:localhost") >/dev/null 2>&1

# --- gateway client cert ---
openssl genrsa -out client.key 2048 >/dev/null 2>&1
openssl req -new -key client.key -subj "/CN=gateway" -out client.csr >/dev/null 2>&1
openssl x509 -req -in client.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -days "$DAYS" -sha256 -out client.crt >/dev/null 2>&1

rm -f server.csr client.csr
echo "generated in infra/tls/certs/: $(ls *.crt *.key | tr '\n' ' ')"
