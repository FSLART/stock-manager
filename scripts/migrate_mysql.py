#!/usr/bin/env python3
"""Copy SQLite stock into an empty MySQL 8 database; never modify the source."""
import argparse
import os
from pathlib import Path
import sqlite3
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

TABLE_COLUMNS = {
    'categories': ('id', 'name', 'props', 'image_enabled'),
    'items': ('id', 'cat_id', 'props', 'key', 'qty', 'image', 'location'),
    'meta': ('key', 'value'),
}


def migrate(source):
    # Force MySQL before importing the app; do not seed the migration target.
    os.environ['DB_BACKEND'] = 'mysql'
    from backend import app as stock

    source = Path(source).resolve(strict=True)
    rows = {}
    with sqlite3.connect(source.as_uri() + '?mode=ro', uri=True) as connection:
        connection.execute('BEGIN')  # Consistent read snapshot of all three tables.
        for table, columns in TABLE_COLUMNS.items():
            present = {row[1] for row in connection.execute(f'PRAGMA table_info({table})')}
            expressions = []
            for column in columns:
                if column in present:
                    expressions.append(f'`{column}`')
                elif column == 'image_enabled':
                    expressions.append('0')
                elif column in ('image', 'location'):
                    expressions.append("''")
                else:
                    raise ValueError(f'Source is missing {table}.{column}')
            rows[table] = connection.execute(
                f'SELECT {", ".join(expressions)} FROM {table} ORDER BY `{columns[0]}`'
            ).fetchall()

    stock.init_db(seed=False)
    with stock.db_connection() as connection:
        for table in TABLE_COLUMNS:
            engine = connection.execute(
                'SELECT ENGINE AS engine FROM information_schema.tables '
                'WHERE table_schema = DATABASE() AND table_name = ?', (table,)
            ).fetchone()
            if not engine or engine['engine'] != 'InnoDB':
                raise ValueError(f'Target table {table} must use InnoDB for safe rollback')
            if connection.execute(f'SELECT 1 FROM {table} LIMIT 1').fetchone():
                raise ValueError('Target database is not empty; use a new database. No data copied.')
        for table, columns in TABLE_COLUMNS.items():
            names = ', '.join(f'`{column}`' for column in columns)
            placeholders = ', '.join('?' for _ in columns)
            if rows[table]:
                connection.executemany(
                    f'INSERT INTO {table} ({names}) VALUES ({placeholders})', rows[table]
                )
            copied = connection.execute(
                f'SELECT {names} FROM {table} ORDER BY `{columns[0]}`'
            ).fetchall()
            if [tuple(row[column] for column in columns) for row in copied] != rows[table]:
                raise ValueError(f'Verification failed for {table}; rolling back copied data')
        # Older sources may lack this flag; avoid adding default categories after migration.
        if not any(row[0] == 'defaults_seeded' for row in rows['meta']):
            connection.execute("INSERT INTO meta (`key`, value) VALUES ('defaults_seeded', '1')")
    return {table: len(values) for table, values in rows.items()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=ROOT / 'data/stock.db',
                        help='SQLite file (default: data/stock.db)')
    args = parser.parse_args()
    try:
        counts = migrate(args.source)
    except Exception as exc:
        print(f'Migration failed: {exc}', file=sys.stderr)
        return 1
    print('Migration verified and committed: ' + ', '.join(
        f'{count} {table}' for table, count in counts.items()
    ))
    print('SQLite source unchanged. Copy backend/uploads separately before starting the app.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
