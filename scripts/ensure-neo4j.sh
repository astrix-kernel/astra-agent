#!/usr/bin/env bash
# Auto-start Neo4j container kalau belum nyala
set -e

CONTAINER_NAME="astra-neo4j"
COMPOSE_FILE="$(dirname "$0")/../docker/docker-compose.knowledge.yml"

# Cek docker terinstall
if ! command -v docker &> /dev/null; then
  echo "❌ Docker tidak ditemukan. Install dulu: https://docs.docker.com/engine/install/"
  exit 1
fi

# Cek container status
if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "✅ Neo4j sudah jalan"
  exit 0
fi

# Cek container ada tapi stop
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "🔄 Start container yang udah ada..."
  docker start "${CONTAINER_NAME}"
else
  echo "🚀 Bikin container baru..."
  docker compose -f "${COMPOSE_FILE}" up -d
fi

# Tunggu sampai ready
echo "⏳ Nunggu Neo4j ready..."
for i in {1..30}; do
  if docker exec "${CONTAINER_NAME}" wget --no-verbose --tries=1 --spider localhost:7474 2>/dev/null; then
    echo "✅ Neo4j ready di bolt://localhost:7687 (user: neo4j, pass: astra-knowledge-2026)"
    exit 0
  fi
  sleep 2
done

echo "❌ Neo4j gagal ready dalam 60 detik"
exit 1
