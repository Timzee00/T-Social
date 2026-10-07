#!/bin/sh
set -eu

mkdir -p /run/mysqld /var/lib/mysql
chown -R mysql:mysql /run/mysqld /var/lib/mysql

if [ ! -d /var/lib/mysql/mysql ]; then
  mariadb-install-db --user=mysql --datadir=/var/lib/mysql --skip-test-db >/dev/null
fi

mariadbd --user=mysql --datadir=/var/lib/mysql --bind-address=127.0.0.1 --port=3306 &
DB_PID=$!

cleanup() {
  kill "$DB_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

i=0
until mariadb-admin ping --socket=/run/mysqld/mysqld.sock --silent; do
  i=$((i + 1))
  if [ "$i" -gt 60 ]; then
    echo "MariaDB did not become ready" >&2
    exit 1
  fi
  sleep 1
done

mariadb --socket=/run/mysqld/mysqld.sock -uroot <<SQL
CREATE DATABASE IF NOT EXISTS t_social CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'tsocial'@'127.0.0.1' IDENTIFIED BY '${DB_PASSWORD}';
ALTER USER 'tsocial'@'127.0.0.1' IDENTIFIED BY '${DB_PASSWORD}';
GRANT ALL PRIVILEGES ON t_social.* TO 'tsocial'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL

npm run db:migrate
exec node dist/boot.js
