import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from auth_helper import as_person

ROOT = Path(__file__).resolve().parents[1]


class LabelsTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        with patch.dict(os.environ, {'DB_BACKEND': 'sqlite', 'STORAGE_MODE': 'local', 'DB_PATH': str(Path(self.temp.name) / 'stock.db'), 'UPLOAD_DIR': str(Path(self.temp.name) / 'uploads')}):
            spec = importlib.util.spec_from_file_location('labels_server', ROOT / 'backend/app.py')
            self.module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(self.module)
        self.client = self.module.app.test_client()
        as_person(self, self.module)

    def labels(self):
        return self.client.get('/api/data').get_json()['labels']

    def test_save_edit_and_delete_shared_labels(self):
        label = {'title': ' Armário 1 ', 'fields': [{'name': 'Posição', 'value': 'D20', 'extra': 1}], 'code': 'DataMatrix', 'location': 'Caixa 1', 'width': 60, 'height': 25, 'html': '<b>'}
        response = self.client.post('/api/labels', json=label)
        self.assertEqual(response.status_code, 200, response.json)
        label_id = response.get_json()['id']
        self.assertEqual(self.labels(), [{'id': label_id, 'title': 'Armário 1', 'fields': [{'name': 'Posição', 'value': 'D20'}], 'code': 'DataMatrix', 'location': 'Caixa 1', 'width': 60, 'height': 25}])
        # Guardar sem mudar nada e depois mudar o título substitui a mesma etiqueta.
        self.assertEqual(self.client.post('/api/labels', json={**label, 'id': label_id}).status_code, 200)
        self.assertEqual(self.client.post('/api/labels', json={**label, 'id': label_id, 'title': 'Armário 2'}).status_code, 200)
        self.assertEqual([entry['title'] for entry in self.labels()], ['Armário 2'])
        self.assertEqual(self.client.post('/api/labels', json={**label, 'id': 999}).status_code, 404)
        self.assertEqual(self.client.delete(f'/api/labels/{label_id}').status_code, 200)
        self.assertEqual(self.labels(), [])

    def test_rejects_invalid_labels(self):
        base = {'title': 'A', 'fields': [], 'code': 'QRCode', 'location': '', 'width': 60, 'height': 25}
        for change in [{'code': 'Aztec'}, {'width': 5}, {'height': '25'}, {'fields': [{}] * 5}, {'fields': ['x']}, {'id': 'x'}]:
            self.assertEqual(self.client.post('/api/labels', json={**base, **change}).status_code, 400, change)
        self.assertEqual(self.labels(), [])


if __name__ == '__main__':
    unittest.main()
