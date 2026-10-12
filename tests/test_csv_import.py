import importlib.util
import os
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]

class CsvImportTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        with patch.dict(os.environ, {'DB_BACKEND': 'sqlite', 'STORAGE_MODE': 'local', 'DB_PATH': str(Path(self.temp.name) / 'stock.db')}):
            spec = importlib.util.spec_from_file_location('csv_server', ROOT / 'backend/app.py')
            self.module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(self.module)
        self.client = self.module.app.test_client()
        self.client.post('/api/categories', json={'name': 'CSV test', 'props': ['code', 'size'], 'image': True})

    def test_import_sums_duplicates_and_preserves_existing_id_and_image(self):
        self.client.post('/api/move', json={'cat': 'CSV test', 'props': {'code': 'A', 'size': 'small'}, 'qty': 4, 'mode': 'in', 'image': '/uploads/photo.jpg'})
        original = self.module.db_items()[0]
        response = self.client.post('/api/items/import', json={'items': [
            {'cat': 'CSV test', 'props': {'size': 'small', 'code': ' a '}, 'qty': 2},
            {'cat': 'CSV test', 'props': {'code': 'A', 'size': 'small'}, 'qty': 3},
            {'cat': 'CSV test', 'props': {'code': 'B', 'size': 'large'}, 'qty': 7},
        ]})
        self.assertEqual(response.status_code, 200, response.json)
        self.assertEqual(response.json['units'], 12)
        items = self.module.db_items()
        self.assertEqual(len(items), 2)
        self.assertEqual((items[0]['id'], items[0]['qty'], items[0]['image']), (original['id'], 9, original['image']))
        self.assertEqual(items[1]['qty'], 7)

    def test_invalid_row_rejects_entire_import(self):
        valid = {'cat': 'CSV test', 'props': {'code': 'A', 'size': 'small'}, 'qty': 2}
        for invalid in [
            {**valid, 'cat': 'Unknown'}, {**valid, 'qty': -1}, {**valid, 'qty': 1.5},
            {**valid, 'qty': True}, {**valid, 'props': {'code': 'A'}},
            {**valid, 'props': {'code': 'A', 'size': '', 'extra': 'x'}},
        ]:
            response = self.client.post('/api/items/import', json={'items': [valid, invalid]})
            self.assertEqual(response.status_code, 400, response.json)
            self.assertEqual(self.module.db_items(), [])

    def test_import_is_not_supported_by_external_storage_and_rejects_empty_input(self):
        for payload in [{}, {'items': []}, {'items': 'bad'}, {'items': [None]}]:
            self.assertEqual(self.client.post('/api/items/import', json=payload).status_code, 400)
        with patch.object(self.module, 'STORAGE_MODE', 'google'):
            self.assertEqual(self.client.post('/api/items/import', json={'items': []}).status_code, 400)

    def test_concurrent_movement_cannot_erase_imported_components(self):
        self.client.post('/api/move', json={'cat': 'CSV test', 'props': {'code': 'A', 'size': 'small'}, 'qty': 1, 'mode': 'in'})
        original_read = self.module.read_items
        snapshot_read = threading.Event()
        resume_move = threading.Event()
        import_done = threading.Event()
        responses = {}

        def paused_read():
            result = original_read()
            if threading.current_thread().name == 'regular-movement':
                snapshot_read.set()
                resume_move.wait(2)
            return result

        def move():
            with self.module.app.test_client() as client:
                responses['move'] = client.post('/api/move', json={'cat': 'CSV test', 'props': {'code': 'A', 'size': 'small'}, 'qty': 1, 'mode': 'in'}).status_code

        def import_csv():
            with self.module.app.test_client() as client:
                responses['import'] = client.post('/api/items/import', json={'items': [{'cat': 'CSV test', 'props': {'code': 'B', 'size': 'large'}, 'qty': 7}]}).status_code
            import_done.set()

        with patch.object(self.module, 'read_items', side_effect=paused_read):
            moving = threading.Thread(target=move, name='regular-movement')
            importing = threading.Thread(target=import_csv)
            moving.start()
            self.assertTrue(snapshot_read.wait(2))
            importing.start()
            import_done.wait(0.3)
            resume_move.set()
            moving.join(3)
            importing.join(3)
        self.assertEqual(responses, {'move': 200, 'import': 200})
        self.assertEqual({item['props']['code']: item['qty'] for item in self.module.db_items()}, {'A': 2, 'B': 7})

    def test_overflow_rolls_back_all_changes(self):
        self.client.post('/api/move', json={'cat': 'CSV test', 'props': {'code': 'A', 'size': 'small'}, 'qty': 9007199254740991, 'mode': 'in'})
        original = self.module.db_items()
        response = self.client.post('/api/items/import', json={'items': [
            {'cat': 'CSV test', 'props': {'code': 'B', 'size': 'small'}, 'qty': 1},
            {'cat': 'CSV test', 'props': {'code': 'A', 'size': 'small'}, 'qty': 1},
        ]})
        self.assertEqual(response.status_code, 400, response.json)
        self.assertEqual(self.module.db_items(), original)

if __name__ == '__main__':
    unittest.main()
