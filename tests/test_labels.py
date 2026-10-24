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
        label = {'title': ' Armário 1 ', 'fields': [{'name': 'Posição', 'value': 'D20', 'extra': 1}], 'code': 'DataMatrix', 'location': 'Caixa 1', 'width': 60, 'height': 25, 'icon': 'nut', 'item': 3, 'html': '<b>'}
        response = self.client.post('/api/labels', json=label)
        self.assertEqual(response.status_code, 200, response.json)
        label_id = response.get_json()['id']
        self.assertEqual(self.labels(), [{'id': label_id, 'title': 'Armário 1', 'fields': [{'name': 'Posição', 'value': 'D20'}], 'code': 'DataMatrix', 'location': 'Caixa 1', 'width': 60, 'height': 25, 'icon': 'nut', 'item': 3, 'layout': 'drawer', 'screw': '', 'titleSize': None, 'fieldSize': None}])
        # Guardar sem mudar nada e depois mudar o título substitui a mesma etiqueta.
        self.assertEqual(self.client.post('/api/labels', json={**label, 'id': label_id}).status_code, 200)
        self.assertEqual(self.client.post('/api/labels', json={**label, 'id': label_id, 'title': 'Armário 2'}).status_code, 200)
        self.assertEqual([entry['title'] for entry in self.labels()], ['Armário 2'])
        screw = {**label, 'id': label_id, 'layout': 'bin', 'screw': 'screw-countersunk', 'titleSize': 14, 'fieldSize': ''}
        self.assertEqual(self.client.post('/api/labels', json=screw).status_code, 200)
        self.assertEqual({key: self.labels()[0][key] for key in ('layout', 'screw', 'titleSize', 'fieldSize')}, {'layout': 'bin', 'screw': 'screw-countersunk', 'titleSize': 14, 'fieldSize': None})
        self.assertEqual(self.client.post('/api/labels', json={**label, 'id': 999}).status_code, 404)
        self.assertEqual(self.client.delete('/api/labels', json={'ids': [label_id]}).status_code, 200)
        self.assertEqual(self.labels(), [])

    def test_creates_several_labels_at_once_or_none(self):
        screw = {'fields': [], 'code': '', 'location': '', 'width': 55, 'height': 12, 'icon': 'drive-hex', 'layout': 'bin', 'screw': 'screw-socket'}
        response = self.client.post('/api/labels', json={'labels': [{**screw, 'title': title} for title in ('M3x10', 'M4x16', 'M5x20')]})
        self.assertEqual(response.status_code, 200, response.json)
        self.assertEqual(len(response.get_json()['ids']), 3)
        self.assertEqual([(entry['title'], entry['screw']) for entry in self.labels()], [('M3x10', 'screw-socket'), ('M4x16', 'screw-socket'), ('M5x20', 'screw-socket')])
        # Uma etiqueta inválida no lote não deixa guardar nenhuma.
        for batch in [[], [{**screw, 'title': 'A'}] * 101, [{**screw, 'title': 'M6x10'}, {**screw, 'code': 'Aztec'}], ['x']]:
            self.assertEqual(self.client.post('/api/labels', json={'labels': batch}).status_code, 400)
        self.assertEqual(len(self.labels()), 3)

    def test_deletes_several_labels_at_once(self):
        base = {'title': 'A', 'fields': [], 'code': '', 'location': '', 'width': 55, 'height': 12}
        ids = self.client.post('/api/labels', json={'labels': [{**base, 'title': title} for title in 'ABC']}).get_json()['ids']
        for body in [{}, {'ids': []}, {'ids': ['1']}, {'ids': [True]}, {'ids': list(range(501))}]:
            self.assertEqual(self.client.delete('/api/labels', json=body).status_code, 400, body)
        self.assertEqual(self.client.delete('/api/labels', json={'ids': ids[:2]}).status_code, 200)
        self.assertEqual([entry['title'] for entry in self.labels()], ['C'])

    def test_rejects_invalid_labels(self):
        base = {'title': 'A', 'fields': [], 'code': 'QRCode', 'location': '', 'width': 60, 'height': 25}
        for change in [{'code': 'Aztec'}, {'width': 5}, {'height': '25'}, {'fields': [{}] * 5}, {'fields': ['x']}, {'id': 'x'}, {'item': '3'}, {'layout': 'grid'}, {'titleSize': 2}, {'fieldSize': '12'}]:
            self.assertEqual(self.client.post('/api/labels', json={**base, **change}).status_code, 400, change)
        self.assertEqual(self.labels(), [])


if __name__ == '__main__':
    unittest.main()
