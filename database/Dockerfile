FROM postgres:17-alpine

COPY database/banco_peludinhos.sql /opt/peludinhos/banco_peludinhos.sql
COPY database/migrations/ /opt/peludinhos/migrations/
COPY --chmod=755 database/docker-init/01-schema-and-migrations.sh /docker-entrypoint-initdb.d/01-schema-and-migrations.sh
