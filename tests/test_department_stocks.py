import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from auth_helper import as_person

ROOT = Path(__file__).resolve().parents[1]


def load(db_path, name):
    with patch.dict(os.environ, {'DB_BACKEND': 'sqlite', 'STORAGE_MODE': 'local', 'DB_PATH': str(db_path), 'UPLOAD_DIR': str(db_path.parent / 'uploads')}):
        spec = importlib.util.spec_from_file_location(name, ROOT / 'backend/app.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
    return module


class DepartmentStocksTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.module = load(Path(self.temp.name) / 'stock.db', 'department_server')
        self.client = self.module.app.test_client()
        as_person(self, self.module)

    def add(self, department, qty=3, size='M3'):
        return self.client.post('/api/move', json={'cat': 'Parafusos', 'department': department, 'props': {'tamanho': size}, 'qty': qty, 'mode': 'in'})

    def test_old_database_migrates_without_losing_items(self):
        path = Path(self.temp.name) / 'old.db'
        with sqlite3.connect(path) as connection:
            connection.executescript("""
                CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL COLLATE NOCASE, props TEXT NOT NULL,
                    image_enabled INTEGER NOT NULL DEFAULT 0, section TEXT NOT NULL DEFAULT 'Componentes eletrónicos', parent_id INTEGER);
                CREATE TABLE items (id INTEGER PRIMARY KEY, cat_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
                    props TEXT NOT NULL, key TEXT NOT NULL, qty INTEGER NOT NULL DEFAULT 0, image TEXT NOT NULL DEFAULT '',
                    location TEXT NOT NULL DEFAULT '', UNIQUE (cat_id, key));
                INSERT INTO categories VALUES (1, 'LEDs', '["cor"]', 0, 'Componentes eletrónicos', NULL), (2, 'Fios', '["cor"]', 0, 'Cablagem', NULL);
                INSERT INTO items (id, cat_id, props, key, qty) VALUES (1, 1, '{"cor": "azul"}', 'azul', 7), (2, 2, '{"cor": "preto"}', 'preto', 2);
            """)
        old = load(path, 'old_server')
        old.init_db()
        self.assertEqual([(item['cat'], item['department'], item['qty']) for item in old.db_items()], [('LEDs', 'Electronics', 7), ('Fios', 'Electronics', 2)])
        with old.db_connection() as connection:
            sections = old.db_sections(connection)
            self.assertEqual(connection.execute('PRAGMA foreign_keys').fetchone()[0], 1)
        # The section already used by a category is kept, so no category is left without one.
        self.assertEqual(sections['Electronics'], ['Componentes eletrónicos', 'Harness', 'Não consumíveis', 'Cablagem'])
        self.assertEqual(sections['Powertrain'], ['Geral'])

    def test_same_category_name_in_two_departments(self):
        for department in ('Powertrain', 'Chassis and Structures'):
            response = self.client.post('/api/categories', json={'name': 'Parafusos', 'props': ['tamanho'], 'department': department})
            self.assertEqual(response.status_code, 200, response.json)
        self.assertEqual(self.client.post('/api/categories', json={'name': 'parafusos', 'props': ['x'], 'department': 'Powertrain'}).status_code, 400)
        self.assertEqual(self.client.post('/api/categories', json={'name': 'Novo', 'props': ['x'], 'department': 'Marketing'}).status_code, 400)
        self.add('Powertrain', 3)
        self.add('Chassis and Structures', 10)
        self.add('Powertrain', 2)
        stock = {(item['department'], item['cat']): item['qty'] for item in self.client.get('/api/data').json['items']}
        self.assertEqual(stock, {('Powertrain', 'Parafusos'): 5, ('Chassis and Structures', 'Parafusos'): 10})
        movements = self.client.get('/api/movements').json['movements']
        self.assertEqual([m['department'] for m in movements], ['Powertrain', 'Chassis and Structures', 'Powertrain'])
        # Deleting one leaves the other department's category and stock alone.
        self.assertEqual(self.client.delete('/api/categories/Parafusos?department=Powertrain').status_code, 200)
        self.assertEqual([(item['department'], item['qty']) for item in self.module.db_items()], [('Chassis and Structures', 10)])
        self.assertEqual([c['name'] for c in self.module.db_categories() if c['department'] == 'Chassis and Structures'], ['Parafusos'])

    def test_department_members_only_change_their_stock(self):
        self.client.post('/api/categories', json={'name': 'Parafusos', 'props': ['tamanho'], 'department': 'Powertrain'})
        self.client.post('/api/categories', json={'name': 'Parafusos', 'props': ['tamanho'], 'department': 'Aerodynamics'})
        self.add('Aerodynamics')
        rui = {'id': 2, 'name': 'Rui', 'admin': False, 'notion': True, 'department': 'Powertrain'}
        with patch.object(self.module, 'current_person', return_value=rui):
            self.assertEqual(self.add('Powertrain').status_code, 200)
            denied = self.add('Aerodynamics')
            self.assertEqual((denied.status_code, denied.json['error']), (403, 'Só o departamento de Aerodynamics pode alterar este stock'))
            self.assertEqual(self.client.post('/api/categories', json={'name': 'LEDs2', 'props': ['x']}).status_code, 403)
            aero = next(item for item in self.module.db_items() if item['department'] == 'Aerodynamics')
            self.assertEqual(self.client.post(f"/api/items/{aero['id']}/step", json={'delta': -1}).status_code, 403)
            self.assertEqual(self.client.post('/api/items/consume', json={'items': [{'id': aero['id'], 'qty': 1}], 'note': 'x'}).status_code, 403)
            self.assertEqual(self.client.post('/api/items/location', json={'ids': [aero['id']], 'location': 'A1'}).status_code, 403)
            self.assertEqual(self.client.post('/api/sections', json={'department': 'Electronics', 'name': 'Nova'}).status_code, 403)
            self.assertEqual(self.client.post('/api/sections', json={'department': 'Powertrain', 'name': 'Nova'}).status_code, 200)

    def test_sections_are_edited_per_department(self):
        post = lambda name, department='Powertrain': self.client.post('/api/sections', json={'department': department, 'name': name})
        sections = lambda: self.client.get('/api/data').json['sections']['Powertrain']
        self.assertEqual(post('Consumíveis').status_code, 200)
        self.assertEqual(post('consumíveis').status_code, 409)
        self.assertEqual(post('Consumíveis', 'Aerodynamics').status_code, 200)
        self.client.post('/api/categories', json={'name': 'Parafusos', 'props': ['tamanho'], 'department': 'Powertrain', 'section': 'Consumíveis'})
        self.assertEqual(self.client.post('/api/categories', json={'name': 'X', 'props': ['y'], 'department': 'Powertrain', 'section': 'Harness'}).status_code, 400)
        # Renaming and moving to the top carries the category with it.
        response = self.client.patch('/api/sections', json={'department': 'Powertrain', 'name': 'Consumíveis', 'newName': 'Fixação', 'position': 0})
        self.assertEqual(response.status_code, 200, response.json)
        self.assertEqual(sections(), ['Fixação', 'Geral'])
        self.assertEqual(next(c['section'] for c in self.module.db_categories() if c['department'] == 'Powertrain'), 'Fixação')
        delete = lambda name: self.client.delete('/api/sections', json={'department': 'Powertrain', 'name': name})
        self.assertEqual(delete('Fixação').status_code, 409)
        self.assertEqual(delete('Geral').status_code, 200)
        self.client.delete('/api/categories/Parafusos?department=Powertrain')
        self.assertEqual(delete('Fixação').status_code, 409)
        self.assertEqual(sections(), ['Fixação'])

    def test_requests_without_department_stay_electronics(self):
        response = self.client.post('/api/move', json={'cat': 'LEDs', 'props': {'cor': 'azul', 'tamanho (mm)': '5', 'tensão direta (V)': '3'}, 'qty': 1, 'mode': 'in'})
        self.assertEqual(response.status_code, 200, response.json)
        self.assertEqual(self.module.db_items()[0]['department'], 'Electronics')
        self.assertEqual(json.loads(json.dumps(self.client.get('/api/data').json['sections']['Electronics'])), ['Componentes eletrónicos', 'Harness', 'Não consumíveis'])


if __name__ == '__main__':
    unittest.main()
