"""Run against a disposable database: MYSQL_TEST_PORT=13316 python -m unittest ..."""
import importlib.util
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from auth_helper import as_person

ROOT = Path(__file__).resolve().parents[1]


@unittest.skipUnless(os.getenv('MYSQL_TEST_PORT'), 'requires disposable MySQL database')
class MySQLStorageTest(unittest.TestCase):
    def setUp(self):
        import pymysql
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.env = {
            'DB_BACKEND': 'mysql', 'STORAGE_MODE': 'local',
            'MYSQL_HOST': '127.0.0.1', 'MYSQL_PORT': os.environ['MYSQL_TEST_PORT'],
            'MYSQL_USER': 'root', 'MYSQL_PASSWORD': 'stock-qa-only',
            'MYSQL_DATABASE': 'stock_qa',
            'DB_PATH': str(Path(self.temp.name) / 'stock.db'),
            'UPLOAD_DIR': str(Path(self.temp.name) / 'uploads'),
        }
        self.raw = pymysql.connect(host='127.0.0.1', port=int(self.env['MYSQL_PORT']),
                                   user='root', password='stock-qa-only',
                                   database='stock_qa', autocommit=True)
        self.addCleanup(self.raw.close)
        with self.raw.cursor() as cursor:
            for table in ('items', 'categories', 'meta', 'people', 'movements'):
                cursor.execute(f'DROP TABLE IF EXISTS {table}')
        with patch.dict(os.environ, self.env):
            spec = importlib.util.spec_from_file_location('mysql_stock', ROOT / 'backend/app.py')
            self.module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(self.module)
        self.client = self.module.app.test_client()
        as_person(self, self.module)

    def test_mysql_crud_constraints_and_rollback(self):
        response = self.client.get('/api/data')
        self.assertEqual(response.status_code, 200, response.json)
        with self.raw.cursor() as cursor:
            cursor.execute('SHOW TABLES')
            self.assertEqual({row[0] for row in cursor}, {'categories', 'items', 'meta', 'people', 'movements'})
        self.assertFalse(Path(self.env['DB_PATH']).exists())
        self.assertEqual(self.client.post('/api/categories', json={
            'name': 'Teste µΩ', 'props': ['reference'], 'image': True,
        }).status_code, 200)
        long_reference = 'ÉΩ🙂%' + 'x' * 4000
        self.assertEqual(self.client.post('/api/move', json={
            'cat': 'Teste µΩ', 'props': {'reference': long_reference}, 'qty': 4, 'mode': 'in',
        }).status_code, 200)
        item = self.module.db_items()[0]
        self.assertEqual(item['props']['reference'], long_reference)
        self.assertEqual(self.client.post(f"/api/items/{item['id']}/step", json={'delta': 2}).status_code, 200)
        self.assertEqual(self.module.db_items()[0]['qty'], 6)
        with self.assertRaises(RuntimeError):
            with self.module.db_connection() as connection:
                connection.execute('UPDATE items SET qty = ? WHERE id = ?', (999, item['id']))
                raise RuntimeError('abort')
        self.assertEqual(self.module.db_items()[0]['qty'], 6)
        # Editing paths use reserved SQL column names and uniqueness constraints.
        edited = self.client.patch(f"/api/items/{item['id']}", json={
            'props': {'reference': 'B'}, 'qty': 7,
        })
        self.assertEqual(edited.status_code, 200, edited.json)
        rename = self.client.patch('/api/categories/Teste µΩ', json={
            'name': 'Renamed', 'image': True,
            'fields': [{'source': 'reference', 'name': 'code'}],
        })
        self.assertEqual(rename.status_code, 200, rename.json)
        self.assertEqual(self.module.db_items()[0]['props'], {'code': 'B'})
        self.assertEqual(self.client.post('/api/move', json={
            'cat': 'Renamed', 'props': {'code': 'C'}, 'qty': 1, 'mode': 'in',
        }).status_code, 200)
        collision = self.client.patch(f"/api/items/{item['id']}", json={
            'props': {'code': 'C'}, 'qty': 99,
        })
        self.assertEqual(collision.status_code, 409, collision.json)
        self.assertEqual(self.module.db_items()[0]['qty'], 7)
        self.assertEqual(self.client.delete('/api/categories/Renamed').status_code, 200)
        self.assertEqual(self.module.db_items(), [])

    def test_migration_preserves_data_and_refuses_nonempty_target(self):
        source = Path(self.temp.name) / 'source.db'
        with sqlite3.connect(source) as connection:
            connection.executescript('''
                CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT, props TEXT, image_enabled INTEGER);
                CREATE TABLE items (id INTEGER PRIMARY KEY, cat_id INTEGER, props TEXT, key TEXT, qty INTEGER, image TEXT);
                CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
                INSERT INTO categories VALUES (42, 'Resistências', '["valor"]', 1);
                INSERT INTO items VALUES (0, 42, '{"valor":"10 Ω"}', '10ω', 23, '/uploads/existing.png');
                INSERT INTO meta VALUES ('defaults_seeded', '1');
            ''')
        before = source.read_bytes()
        command = [sys.executable, str(ROOT / 'scripts/migrate_mysql.py'), '--source', str(source)]
        result = subprocess.run(command, env={**os.environ, **self.env}, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.module.db_items(), [{
            'id': 0, 'cat': 'Resistências', 'props': {'valor': '10 Ω'},
            'qty': 23, 'image': '/uploads/existing.png',
        }])
        self.assertEqual(self.module.db_categories(), [{
            'name': 'Resistências', 'props': ['valor'], 'image': True,
        }])
        self.assertEqual(source.read_bytes(), before)
        self.module.save_items(self.module.db_items())
        self.assertEqual(self.module.db_items()[0]['id'], 0)
        retry = subprocess.run(command, env={**os.environ, **self.env}, capture_output=True, text=True)
        self.assertNotEqual(retry.returncode, 0)
        self.assertIn('not empty', retry.stderr)
        self.assertEqual(self.module.db_items()[0]['qty'], 23)

    def test_invalid_source_rolls_back_inserted_categories(self):
        source = Path(self.temp.name) / 'invalid.db'
        with sqlite3.connect(source) as connection:
            connection.executescript('''
                CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT, props TEXT);
                CREATE TABLE items (id INTEGER PRIMARY KEY, cat_id INTEGER, props TEXT, key TEXT, qty INTEGER);
                CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
                INSERT INTO categories VALUES (42, 'Legacy', '["code"]');
                INSERT INTO items VALUES (1, 999, '{"code":"A"}', 'a', 1);
            ''')
        before = source.read_bytes()
        result = subprocess.run(
            [sys.executable, str(ROOT / 'scripts/migrate_mysql.py'), '--source', str(source)],
            env={**os.environ, **self.env}, capture_output=True, text=True,
        )
        self.assertNotEqual(result.returncode, 0)
        with self.raw.cursor() as cursor:
            for table in ('categories', 'items', 'meta'):
                cursor.execute(f'SELECT COUNT(*) FROM {table}')
                self.assertEqual(cursor.fetchone()[0], 0)
        self.assertEqual(source.read_bytes(), before)
        # The same legacy source can be retried after correcting the orphan.
        with sqlite3.connect(source) as connection:
            connection.execute('UPDATE items SET cat_id = 42')
        retry = subprocess.run(
            [sys.executable, str(ROOT / 'scripts/migrate_mysql.py'), '--source', str(source)],
            env={**os.environ, **self.env}, capture_output=True, text=True,
        )
        self.assertEqual(retry.returncode, 0, retry.stderr)
        self.assertEqual(self.module.db_items()[0]['image'], '')
        self.assertEqual(self.module.db_categories(), [{'name': 'Legacy', 'props': ['code'], 'image': False}])

    def test_migration_refuses_nontransactional_existing_tables(self):
        self.module.init_db(seed=False)
        with self.raw.cursor() as cursor:
            cursor.execute('ALTER TABLE meta ENGINE=MyISAM')
        source = Path(self.temp.name) / 'source.db'
        with sqlite3.connect(source) as connection:
            connection.executescript('''
                CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT, props TEXT);
                CREATE TABLE items (id INTEGER PRIMARY KEY, cat_id INTEGER, props TEXT, key TEXT, qty INTEGER);
                CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
                INSERT INTO meta VALUES ('defaults_seeded', '1');
            ''')
        result = subprocess.run(
            [sys.executable, str(ROOT / 'scripts/migrate_mysql.py'), '--source', str(source)],
            env={**os.environ, **self.env}, capture_output=True, text=True,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('InnoDB', result.stderr)
        with self.raw.cursor() as cursor:
            cursor.execute('SELECT COUNT(*) FROM meta')
            self.assertEqual(cursor.fetchone()[0], 0)


if __name__ == '__main__':
    unittest.main()
