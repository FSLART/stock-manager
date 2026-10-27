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
        self.assertEqual(self.labels(), [{'id': label_id, 'title': 'Armário 1', 'fields': [{'name': 'Posição', 'value': 'D20'}], 'code': 'DataMatrix', 'location': 'Caixa 1', 'width': 60, 'height': 25, 'icon': 'nut', 'item': 3, 'layout': 'drawer', 'screw': '', 'titleSize': None, 'fieldSize': None, 'borderWidth': None, 'borderRadius': None, 'borderInset': None}])
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
        # Quem apagou e o quê fica no histórico de movimentos.
        [movement] = self.client.get('/api/movements').get_json()['movements']
        self.assertEqual((movement['type'], movement['person'], movement['props'], movement['note']),
                         ('label', 'Tester', {'Etiqueta': 'Armário 1', 'Campos': 'Posição: D20'}, f'etiqueta #{label_id} apagada'))

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
        for change in [{'code': 'Aztec'}, {'width': 5}, {'height': '25'}, {'fields': [{}] * 5}, {'fields': ['x']}, {'id': 'x'}, {'item': '3'}, {'layout': 'grid'}, {'titleSize': 2}, {'fieldSize': '12'},
                       {'borderWidth': 0}, {'borderWidth': 6}, {'borderRadius': '2'}, {'borderInset': -1}, {'template': True}, {'template': True, 'templateName': ' '}]:
            self.assertEqual(self.client.post('/api/labels', json={**base, **change}).status_code, 400, change)
        self.assertEqual(self.labels(), [])

    def test_saves_a_black_border_and_named_templates(self):
        base = {'title': 'A1', 'fields': [], 'code': '', 'location': '', 'width': 55, 'height': 25}
        self.assertEqual(self.client.post('/api/labels', json={**base, 'borderWidth': 0.5, 'borderRadius': 2, 'borderInset': ''}).status_code, 200)
        self.assertEqual({key: self.labels()[0][key] for key in ('borderWidth', 'borderRadius', 'borderInset')}, {'borderWidth': 0.5, 'borderRadius': 2, 'borderInset': None})
        self.assertNotIn('template', self.labels()[0])
        # So template: true (e nao "true") faz um modelo, e o nome fica aparado.
        self.assertEqual(self.client.post('/api/labels', json={**base, 'template': True, 'templateName': ' Gaveta grande '}).status_code, 200)
        self.assertEqual(self.client.post('/api/labels', json={**base, 'template': 'true', 'templateName': 'X'}).status_code, 200)
        self.assertEqual([(entry.get('template'), entry.get('templateName')) for entry in self.labels()], [(None, None), (True, 'Gaveta grande'), (None, None)])


class PcbProjectsTest(unittest.TestCase):
    # Os projetos PCB guardam-se como as etiquetas (JSON por linha), por isso partilham o setUp.
    setUp = LabelsTest.setUp

    def projects(self):
        return self.client.get('/api/pcb-projects').get_json()['projects']

    def test_projects_are_shared_and_upserted_by_browser_id(self):
        line = {'reference': 'R1', 'value': '10k', 'description': '—', 'footprint': '0603', 'partNumber': '—', 'quantity': 2, 'extra': 1}
        old = {'id': 'a-1', 'name': 'Motor', 'fileName': 'motor.csv', 'items': [line], 'createdAt': '2026-01-01T00:00:00Z', 'html': '<b>'}
        new = {'id': 'b-2', 'name': 'BMS', 'fileName': 'bms.csv', 'items': [], 'createdAt': '2026-02-01T00:00:00Z', 'step': {'name': 'bms.step', 'url': '/uploads/x.step'}}
        self.assertEqual(self.client.post('/api/pcb-projects', json={'projects': [old, new]}).status_code, 200)
        self.assertEqual([project['name'] for project in self.projects()], ['BMS', 'Motor'])
        self.assertEqual(self.projects()[1]['items'], [{k: v for k, v in line.items() if k != 'extra'}])
        self.assertNotIn('html', self.projects()[1])
        # O mesmo id substitui (migrar duas vezes do mesmo browser nao duplica).
        self.assertEqual(self.client.post('/api/pcb-projects', json={'projects': [{**old, 'name': 'Motor V2'}]}).status_code, 200)
        self.assertEqual([project['name'] for project in self.projects()], ['BMS', 'Motor V2'])
        self.assertEqual(self.client.delete('/api/pcb-projects/a-1').status_code, 200)
        self.assertEqual([project['id'] for project in self.projects()], ['b-2'])

    def test_rejects_invalid_projects(self):
        valid = {'id': 'p1', 'name': 'Placa', 'items': []}
        for bad in ({**valid, 'id': '../x'}, {**valid, 'items': 'R1'}, {**valid, 'items': [{'quantity': -1}]},
                    {**valid, 'step': {'url': 'javascript:alert(1)'}}, {**valid, 'image': 'javascript:x'}, {**valid, 'name': ''}):
            self.assertEqual(self.client.post('/api/pcb-projects', json={'projects': [bad]}).status_code, 400, bad)
        self.assertEqual(self.client.post('/api/pcb-projects', json={'projects': []}).status_code, 400)
        self.assertEqual(self.projects(), [])

    def test_only_the_creator_or_an_admin_changes_a_project(self):
        project = {'id': 'p1', 'name': 'Motor', 'items': [], 'createdBy': {'id': 99, 'name': 'Falso'}}
        saved = self.client.post('/api/pcb-projects', json={'projects': [project]}).get_json()['projects'][0]
        # O dono vem da sessao (Tester, id 1), nunca do que o browser manda.
        self.assertEqual(saved['createdBy'], {'id': 1, 'name': 'Tester'})
        as_person(self, self.module, {'id': 2, 'name': 'Rui', 'admin': False, 'notion': False, 'department': 'Electronics'})
        self.assertEqual(self.client.post('/api/pcb-projects', json={'projects': [{**project, 'step': {'name': 'x.step', 'url': '/uploads/x.step'}}]}).status_code, 403)
        self.assertEqual(self.client.delete('/api/pcb-projects/p1').status_code, 403)
        mine = self.client.post('/api/pcb-projects', json={'projects': [{**project, 'id': 'p2', 'name': 'BMS'}]}).get_json()['projects'][0]
        self.assertEqual(mine['createdBy'], {'id': 2, 'name': 'Rui'})
        self.assertEqual(self.client.post('/api/pcb-projects', json={'projects': [{**mine, 'name': 'BMS V2'}]}).status_code, 200)
        self.assertEqual(self.client.delete('/api/pcb-projects/p2').status_code, 200)
        self.assertEqual([p['name'] for p in self.projects()], ['Motor'])


if __name__ == '__main__':
    unittest.main()
