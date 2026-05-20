#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -d ".venv" ]; then
  python -m venv .venv
fi

# shellcheck disable=SC1091
source .venv/bin/activate

pip install -r backend/requirements.txt

if [ -f "backend/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source backend/.env
  set +a
fi

if command -v docker >/dev/null 2>&1; then
  if ! docker info >/dev/null 2>&1; then
    if command -v systemctl >/dev/null 2>&1; then
      if systemctl is-active --quiet docker; then
        :
      else
        echo "Starting Docker daemon with systemctl..." 1>&2
        if ! systemctl start docker >/dev/null 2>&1; then
          sudo systemctl start docker
        fi
      fi
    else
      echo "systemctl not found; start Docker manually." 1>&2
    fi
  fi

  if docker info >/dev/null 2>&1; then
    if ! docker ps -a --format '{{.Names}}' | grep -q '^threed_db$'; then
      docker run -d --name threed_db \
        -e POSTGRES_USER=postgres \
        -e POSTGRES_PASSWORD=postgres \
        -e POSTGRES_DB=threed_manager \
        -p 5432:5432 \
        -v threed_db_data:/var/lib/postgresql/data \
        postgres:15
    else
      docker start threed_db >/dev/null
    fi
  else
    echo "Docker daemon not running; start it to use Postgres." 1>&2
  fi
else
  echo "Docker not found; continuing without Postgres." 1>&2
fi

if [ -z "${DATABASE_URL:-}" ]; then
  export DATABASE_URL="postgresql+psycopg://postgres:postgres@localhost:5432/threed_manager"
fi

uvicorn backend.app.main:app --reload --port 8000
