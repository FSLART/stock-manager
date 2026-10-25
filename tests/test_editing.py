import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from auth_helper import as_person

ROOT = Path(__file__).resolve().parents[1]


class EditingTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        with patch.dict(os.environ, {'DB_BACKEND': 'sqlite', 'STORAGE_MODE': 'local', 'DB_PATH': str(Path(self.temp.name) / 'stock.db'), 'UPLOAD_DIR': str(Path(self.temp.name) / 'uploads')}):
            spec = importlib.util.spec_from_file_location('editing_server', ROOT / 'backend/app.py')
            self.module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(self.module)
        self.client = self.module.app.test_client()
        as_person(self, self.module)
        self.client.post('/api/categories', json={'name': 'Test', 'props': ['code', 'size'], 'image': True})
        for code, size in [('A', 'small'), ('A', 'large')]:
            self.client.post('/api/move', json={'cat': 'Test', 'props': {'code': code, 'size': size}, 'qty': 4, 'mode': 'in'})

    def test_consume_pcb_and_revert_mass_delete(self):
        self.assertEqual(self.client.post('/api/items/consume', json={'items': [{'id': 1, 'qty': 5}], 'note': 'Placa'}).status_code, 400)
        self.assertEqual(self.client.post('/api/items/consume', json={'items': [{'id': 1, 'qty': 3}], 'note': ' '}).status_code, 400)
        response = self.client.post('/api/items/consume', json={'items': [{'id': 1, 'qty': 3}, {'id': 2, 'qty': 1}], 'note': ' Placa V1 '})
        self.assertEqual(response.status_code, 200, response.json)
        self.assertEqual([item['qty'] for item in self.module.db_items()], [1, 3])
        self.client.delete('/api/categories/Test')
        movements = self.client.get('/api/movements').get_json()['movements']
        self.assertEqual(movements[2]['note'], 'Placa V1')
        deletes = [m['id'] for m in movements if m['type'] == 'delete']
        response = self.client.post('/api/movements/revert', json={'ids': deletes})
        self.assertEqual(response.status_code, 200, response.json)
        self.assertEqual([(item['id'], item['qty'], item['props']) for item in self.module.db_items()],
                         [(1, 1, {'code': 'A', 'size': 'small'}), (2, 3, {'code': 'A', 'size': 'large'})])
        self.assertEqual(self.client.post('/api/movements/revert', json={'ids': deletes}).status_code, 409)
        self.assertTrue(all(m['reverted'] for m in self.client.get('/api/movements').get_json()['movements'] if m['id'] in deletes))
        # Reverter a saida da PCB devolve as pecas.
        self.assertEqual(self.client.post('/api/movements/revert', json={'ids': [movements[2]['id'], movements[3]['id']]}).status_code, 200)
        self.assertEqual([item['qty'] for item in self.module.db_items()], [4, 4])

    def test_only_admins_revert_movements(self):
        as_person(self, self.module, {'id': 2, 'name': 'Other', 'admin': False, 'notion': False})
        self.assertEqual(self.client.post('/api/movements/revert', json={'ids': [1]}).status_code, 403)

    def test_edit_item_preserves_identity_and_updates_stock(self):
        response = self.client.patch('/api/items/1', json={'props': {'code': 'B', 'size': 'small'}, 'qty': 0})
        self.assertEqual(response.status_code, 200, response.json)
        item = self.module.db_items()[0]
        self.assertEqual((item['id'], item['qty'], item['props']['code']), (1, 0, 'B'))

    def test_duplicate_and_invalid_item_edits_leave_original_untouched(self):
        original = self.module.db_items()
        for body, status in [
            ({'props': {'code': 'A', 'size': 'large'}, 'qty': 1}, 409),
            ({'props': {'code': 'B', 'size': 'small'}, 'qty': -1}, 400),
            ({'props': {'code': 'B', 'size': 'small'}, 'qty': 1.5}, 400),
            ({'props': {'code': ''}, 'qty': 1}, 400),
        ]:
            self.assertEqual(self.client.patch('/api/items/1', json=body).status_code, status)
            self.assertEqual(self.module.db_items(), original)

    def test_bulk_location_survives_stock_changes_and_rejects_bad_input(self):
        response = self.client.post('/api/items/location', json={'ids': [1, 2], 'location': ' Caixa 1 '})
        self.assertEqual(response.status_code, 200, response.json)
        self.client.post('/api/items/1/step', json={'delta': 1})
        self.assertEqual([item['location'] for item in self.module.db_items()], ['Caixa 1', 'Caixa 1'])
        # Repetir a mesma localização não é "não encontrado".
        self.assertEqual(self.client.post('/api/items/location', json={'ids': [1], 'location': 'Caixa 1'}).status_code, 200)
        self.client.post('/api/items/location', json={'ids': [2], 'location': ''})
        self.assertEqual(self.module.db_items()[1]['location'], '')
        for body, status in [({'ids': [], 'location': 'x'}, 400), ({'ids': ['1'], 'location': 'x'}, 400),
                             ({'ids': [1], 'location': 'x' * 256}, 400), ({'ids': [99], 'location': 'x'}, 404)]:
            self.assertEqual(self.client.post('/api/items/location', json=body).status_code, status)
        self.assertEqual(self.module.db_items()[0]['location'], 'Caixa 1')

    def test_location_rename_and_image(self):
        self.client.post('/api/items/location', json={'ids': [1, 2], 'location': 'Caixa 1'})
        self.assertEqual(self.client.patch('/api/locations', json={'name': 'Caixa 1', 'image': 'http://x/uploads/a.jpg'}).status_code, 200)
        self.assertEqual(self.client.patch('/api/locations', json={'name': 'Caixa 1', 'newName': ' Caixa A '}).status_code, 200)
        self.assertEqual([item['location'] for item in self.module.db_items()], ['Caixa A', 'Caixa A'])
        self.assertEqual(self.client.get('/api/data').get_json()['locations'], {'Caixa A': '/uploads/a.jpg'})
        for body in [{}, {'name': 'Caixa A', 'newName': ' '}, {'name': 'Caixa A', 'newName': 'x' * 256}, {'name': 'Caixa A', 'image': 3}]:
            self.assertEqual(self.client.patch('/api/locations', json=body).status_code, 400)
        # Caixa vazia: criada, sem foto, apagada; a que tem componentes fica.
        self.assertEqual(self.client.patch('/api/locations', json={'name': 'Caixa B', 'newName': 'Caixa B'}).status_code, 200)
        self.client.patch('/api/locations', json={'name': 'Caixa A', 'image': ''})
        self.assertEqual(self.client.get('/api/data').get_json()['locations'], {'Caixa A': '', 'Caixa B': ''})
        self.assertEqual(self.client.delete('/api/locations', json={'name': 'Caixa A'}).status_code, 409)
        self.assertEqual(self.client.delete('/api/locations', json={'name': 'Caixa B'}).status_code, 200)
        self.assertEqual(self.client.get('/api/data').get_json()['locations'], {'Caixa A': ''})

    def test_location_code_is_assigned_once_and_survives_rename(self):
        self.client.post('/api/items/location', json={'ids': [1], 'location': 'Caixa 1'})
        self.client.post('/api/items/location', json={'ids': [2], 'location': 'Caixa 2'})
        codes = self.client.get('/api/data').get_json()['location_codes']
        self.assertRegex(codes['Caixa 1'], r'^[A-HJ-NP-Z2-9]{6}$')
        self.assertNotEqual(codes['Caixa 1'], codes['Caixa 2'])
        self.assertEqual(self.client.get('/api/data').get_json()['location_codes'], codes)
        self.client.patch('/api/locations', json={'name': 'Caixa 1', 'newName': 'Gaveta A'})
        self.assertEqual(self.client.get('/api/data').get_json()['location_codes'], {'Gaveta A': codes['Caixa 1'], 'Caixa 2': codes['Caixa 2']})
        # Juntar numa caixa que já existe fica com o código dela: as etiquetas coladas nessa continuam certas.
        self.client.patch('/api/locations', json={'name': 'Gaveta A', 'newName': 'Caixa 2'})
        self.assertEqual(self.client.get('/api/data').get_json()['location_codes'], {'Caixa 2': codes['Caixa 2']})

    def test_category_rename_and_field_rename_preserve_values_and_ids(self):
        response = self.client.patch('/api/categories/Test', json={
            'name': 'Renamed', 'image': True,
            'fields': [{'source': 'size', 'name': 'dimension'}, {'source': 'code', 'name': 'reference'}, {'source': None, 'name': 'note'}],
        })
        self.assertEqual(response.status_code, 200, response.json)
        items = self.module.db_items()
        self.assertEqual(items[0], {'id': 1, 'cat': 'Renamed', 'props': {'dimension': 'small', 'reference': 'A', 'note': ''}, 'qty': 4, 'image': '', 'location': ''})
        self.assertEqual(items[1]['id'], 2)

    def test_category_edit_collision_rolls_back_everything(self):
        original = self.module.db_items()
        response = self.client.patch('/api/categories/Test', json={
            'name': 'Renamed', 'image': False, 'fields': [{'source': 'code', 'name': 'code'}],
        })
        self.assertEqual(response.status_code, 409, response.json)
        self.assertEqual(self.module.db_items(), original)
        self.assertTrue(any(c['name'] == 'Test' for c in self.module.db_categories()))

    def test_subcategories_nest_follow_section_and_move_up_on_delete(self):
        parents = lambda: {c['name']: (c['parent'], c['section']) for c in self.module.db_categories()}
        self.assertEqual(self.client.post('/api/categories', json={'name': 'Child', 'props': ['v'], 'parent': 'Test'}).status_code, 200)
        self.assertEqual(self.client.post('/api/categories', json={'name': 'Leaf', 'props': ['v'], 'parent': 'Child'}).status_code, 200)
        self.assertEqual(self.client.post('/api/categories', json={'name': 'X', 'props': ['v'], 'parent': 'Missing'}).status_code, 400)
        self.assertEqual(self.client.post('/api/categories', json={'name': 'X', 'props': ['v'], 'parent': 'Test', 'section': 'Harness'}).status_code, 400)
        fields = [{'source': 'code', 'name': 'code'}, {'source': 'size', 'name': 'size'}]
        # Uma categoria não pode ir para dentro de uma descendente.
        self.assertEqual(self.client.patch('/api/categories/Test', json={'name': 'Test', 'fields': fields, 'parent': 'Leaf'}).status_code, 400)
        self.assertEqual(self.client.patch('/api/categories/Test', json={'name': 'Test', 'fields': fields, 'section': 'Harness'}).status_code, 200)
        self.assertEqual(parents()['Leaf'], ('Child', 'Harness'))
        self.client.delete('/api/categories/Child')
        self.assertEqual(parents()['Leaf'], ('Test', 'Harness'))

    def test_category_name_conflict_and_missing_targets(self):
        self.client.post('/api/categories', json={'name': 'Other', 'props': ['code']})
        body = {'name': 'Other', 'image': True, 'fields': [{'source': 'code', 'name': 'code'}, {'source': 'size', 'name': 'size'}]}
        self.assertEqual(self.client.patch('/api/categories/Test', json=body).status_code, 409)
        self.assertEqual(self.client.patch('/api/categories/Missing', json=body).status_code, 404)
        self.assertEqual(self.client.patch('/api/items/999', json={'props': {}, 'qty': 0}).status_code, 404)

    def test_item_and_category_edits_preserve_images_unless_explicitly_removed(self):
        self.module.UPLOAD_DIR.mkdir()
        (self.module.UPLOAD_DIR / 'saved.jpg').write_bytes(b'test')
        with self.module.db_connection() as connection:
            connection.execute("UPDATE items SET image = '/uploads/saved.jpg' WHERE id = 1")
        body = {'props': {'code': 'B', 'size': 'small'}, 'qty': 2}
        self.assertEqual(self.client.patch('/api/items/1', json=body).status_code, 200)
        self.assertEqual(self.module.db_items()[0]['image'], '/uploads/saved.jpg')
        category = {'name': 'Test', 'image': False, 'fields': [{'source': p, 'name': p} for p in ['code', 'size']]}
        self.assertEqual(self.client.patch('/api/categories/Test', json=category).status_code, 200)
        self.assertEqual(self.module.db_items()[0]['image'], '/uploads/saved.jpg')
        self.assertEqual(self.client.patch('/api/items/1', json={**body, 'image': ''}).status_code, 200)
        self.assertEqual(self.module.db_items()[0]['image'], '')

    def test_uploaded_photo_is_shrunk_without_white_margins(self):
        from io import BytesIO
        from PIL import Image
        photo = BytesIO()
        Image.new('RGB', (4000, 3000), 'red').save(photo, format='JPEG')
        photo.seek(0)
        response = self.client.post('/api/images', data={'image': (photo, 'caixa.jpg')})
        self.assertEqual(response.status_code, 200, response.json)
        with Image.open(Path(self.temp.name) / 'uploads' / Path(response.json['url']).name) as saved:
            self.assertEqual(saved.size, (800, 600))
            self.assertGreater(saved.getpixel((0, 0))[0], 200)
            self.assertLess(saved.getpixel((0, 0))[1], 60)


    def test_image_link_is_downloaded_and_private_or_bad_links_are_refused(self):
        from io import BytesIO
        from PIL import Image
        png = BytesIO()
        Image.new('RGB', (10, 10), 'red').save(png, format='PNG')
        public = [(None, None, None, None, ('93.184.216.34', 443))]
        private = [(None, None, None, None, ('127.0.0.1', 80))]

        class Response(BytesIO):
            def __enter__(self): return self
            def __exit__(self, *args): self.close()

        with patch.object(self.module.socket, 'getaddrinfo', return_value=public), \
                patch.object(self.module.IMAGE_OPENER, 'open', return_value=Response(png.getvalue())):
            response = self.client.post('/api/images', data={'url': 'https://example.com/led.png'})
        self.assertEqual(response.status_code, 200, response.json)
        self.assertTrue((Path(self.temp.name) / 'uploads' / Path(response.json['url']).name).exists())

        with patch.object(self.module.socket, 'getaddrinfo', return_value=private), \
                patch.object(self.module.IMAGE_OPENER, 'open') as opener:
            for url in ['http://localhost/admin.png', 'file:///etc/passwd', 'ftp://example.com/a.png']:
                response = self.client.post('/api/images', data={'url': url})
                self.assertEqual((response.status_code, response.json['error']), (400, 'Link de imagem inválido'))
            opener.assert_not_called()

        # Um redirecionamento para a rede interna é verificado como qualquer outro link.
        redirect = self.module.urllib.error.HTTPError('https://example.com/a', 302, 'Found', {'Location': 'http://10.0.0.5/x.png'}, None)
        with patch.object(self.module.socket, 'getaddrinfo', side_effect=[public, private]), \
                patch.object(self.module.IMAGE_OPENER, 'open', side_effect=redirect) as opener:
            response = self.client.post('/api/images', data={'url': 'https://example.com/a'})
        self.assertEqual((response.status_code, opener.call_count), (400, 1))

        with patch.object(self.module.socket, 'getaddrinfo', return_value=public), \
                patch.object(self.module.IMAGE_OPENER, 'open', return_value=Response(b'<html>not an image</html>')):
            response = self.client.post('/api/images', data={'url': 'https://example.com/page'})
        self.assertEqual(response.status_code, 400)
        self.assertIn('Ctrl+V', response.json['error'])

    def test_pcb_step_upload_keeps_valid_step_files_above_the_image_limit(self):
        from io import BytesIO
        big = b'ISO-10303-21;\nHEADER;\n' + b'x' * (6 * 1024 * 1024)
        with patch.object(self.module.subprocess, 'Popen') as convert:
            response = self.client.post('/api/pcb-step', data={'step': (BytesIO(big), 'board.STEP')})
        self.assertEqual(response.status_code, 200, response.json)
        saved = Path(self.temp.name) / 'uploads' / Path(response.json['url']).name
        self.assertEqual(saved.read_bytes(), big)
        self.assertEqual(convert.call_args.args[0][-2:], [str(saved), str(saved.with_suffix('.mesh'))])
        for name, body in [('board.zip', big), ('board.step', b'not a step file')]:
            response = self.client.post('/api/pcb-step', data={'step': (BytesIO(body), name)})
            self.assertEqual(response.status_code, 400)
        too_big = b'ISO-10303-21;' + b'x' * self.module.MAX_STEP_SIZE
        self.assertEqual(self.client.post('/api/pcb-step', data={'step': (BytesIO(too_big), 'b.step')}).status_code, 413)

    def test_pcb_step_mesh_is_pending_until_converted_then_served(self):
        uploads = Path(self.temp.name) / 'uploads'
        uploads.mkdir(exist_ok=True)
        stem = 'a' * 32
        (uploads / f'{stem}.step').write_bytes(b'ISO-10303-21;')
        with patch.object(self.module.subprocess, 'Popen') as convert:
            self.assertEqual(self.client.get(f'/api/pcb-step/{stem}/mesh').status_code, 202)
            # A conversão em curso (.part) não arranca outra.
            self.assertEqual(self.client.get(f'/api/pcb-step/{stem}/mesh').status_code, 202)
        self.assertEqual(convert.call_count, 1)
        (uploads / f'{stem}.mesh.error').write_text('falhou')
        self.assertEqual(self.client.get(f'/api/pcb-step/{stem}/mesh').status_code, 422)
        (uploads / f'{stem}.mesh').write_bytes(b'mesh')
        self.assertEqual(self.client.get(f'/api/pcb-step/{stem}/mesh').data, b'mesh')
        self.assertEqual(self.client.get('/api/pcb-step/..%2Fstock/mesh').status_code, 404)
        self.assertEqual(self.client.get(f'/api/pcb-step/{"b" * 32}/mesh').status_code, 404)


if __name__ == '__main__':
    unittest.main()
