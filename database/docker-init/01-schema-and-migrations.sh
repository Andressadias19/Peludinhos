#!/usr/bin/env bash
set -Eeuo pipefail

psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set ON_ERROR_STOP=1 \
  --file=/opt/peludinhos/banco_peludinhos.sql

for migration in /opt/peludinhos/migrations/*.sql; do
  psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
    --set ON_ERROR_STOP=1 \
    --file="$migration"
done

echo "Estrutura Peludinhos criada com $(find /opt/peludinhos/migrations -maxdepth 1 -name '*.sql' | wc -l) migrações."
