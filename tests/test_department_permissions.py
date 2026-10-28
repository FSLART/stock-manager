"""Authorization regressions using temporary databases and mocked Notion OAuth."""
import io
from pathlib import Path
import unittest
from unittest.mock import patch

import test_auth


class DepartmentPermissionsTest(unittest.TestCase):
    notion_login = test_auth.AuthTest.notion_login
    user = test_auth.AuthTest.user

    def setUp(self):
        test_auth.AuthTest.setUp(self)
        self.module.UPLOAD_DIR = Path(self.temp.name) / 'uploads'

    def permissions(self, role='Member', department='Powertrain'):
        with self.module.db_connection() as connection:
            connection.execute('UPDATE people SET role = ?, department = ?, notion_sync = 0 WHERE id = 2', (role, department))

    def test_notion_profile_name_cannot_grant_roles(self):
        self.notion_login(self.client, 'notion-rui', name='Board Member', members=[('Board Member', ['Board', 'Electronics'])])
        person = self.user(self.client)
        self.assertEqual((person['role'], person['department']), ('Member', ''))
        self.assertEqual(self.client.get('/api/purchases').status_code, 403)
        self.assertEqual(self.client.post('/api/parts', json={'mpn': 'NE555'}).status_code, 403)

    def test_old_automatic_grants_are_revoked_for_existing_sessions(self):
        self.notion_login(self.client, 'notion-rui')
        with self.module.db_connection() as connection:
            connection.execute("UPDATE people SET role = 'Board', department = 'Electronics', notion_sync = 1 WHERE id = 2")
        person = self.user(self.client)
        self.assertEqual((person['role'], person['department']), ('Member', ''))
        self.assertEqual(self.client.get('/api/purchases').status_code, 403)
        # Explicit administrator assignments survive initialization and profile-name changes.
        self.permissions('Department Leader', 'Electronics')
        self.module.init_db()
        self.notion_login(self.client, 'notion-rui', name='Different Name', members=[])
        self.assertEqual((self.user(self.client)['role'], self.user(self.client)['department']), ('Department Leader', 'Electronics'))

    def test_non_electronics_roles_cannot_change_locations(self):
        self.notion_login(self.client, 'notion-ana')
        self.assertEqual(self.client.patch('/api/locations', json={'name': 'Original'}).status_code, 200)
        for role in ('Member', 'Board', 'Department Leader'):
            with self.subTest(role=role):
                self.permissions(role)
                self.notion_login(self.client, 'notion-rui')
                self.assertEqual(self.client.patch('/api/locations', json={'name': 'Original', 'newName': 'Changed'}).status_code, 403)
                self.assertEqual(self.client.delete('/api/locations', json={'name': 'Original'}).status_code, 403)
                with self.module.db_connection() as connection:
                    self.assertIsNotNone(connection.execute("SELECT 1 FROM locations WHERE name = 'Original'").fetchone())
        self.permissions(department='Electronics')
        self.assertEqual(self.client.patch('/api/locations', json={'name': 'Original', 'newName': 'Changed'}).status_code, 200)
        self.assertEqual(self.client.delete('/api/locations', json={'name': 'Changed'}).status_code, 200)

    def test_non_electronics_cannot_create_or_change_even_owned_pcbs(self):
        self.permissions(department='Electronics')
        self.notion_login(self.client, 'notion-rui')
        project = {'id': 'owned', 'name': 'Original', 'items': [{'reference': 'R1', 'quantity': 1}]}
        self.assertEqual(self.client.post('/api/pcb-projects', json={'projects': [project]}).status_code, 200)
        for role in ('Member', 'Board', 'Department Leader'):
            with self.subTest(role=role):
                self.permissions(role)
                self.assertEqual(self.client.post('/api/pcb-projects', json={'projects': [{**project, 'id': 'new'}]}).status_code, 403)
                self.assertEqual(self.client.post('/api/pcb-projects', json={'projects': [{**project, 'name': 'Changed', 'items': [{'quantity': 99}]}]}).status_code, 403)
                self.assertEqual(self.client.delete('/api/pcb-projects/owned').status_code, 403)
                # Unauthorized uploads must be rejected before launching a converter.
                with patch.object(self.module, 'start_step_mesh'):
                    self.assertEqual(self.client.post('/api/pcb-step', data={'step': (io.BytesIO(b'ISO-10303-21;'), 'pcb.step')}).status_code, 403)
                saved = self.client.get('/api/pcb-projects').json['projects']
                self.assertEqual([(p['id'], p['name'], p['items'][0]['quantity']) for p in saved], [('owned', 'Original', 1)])
        self.permissions(department='Electronics')
        self.assertEqual(self.client.post('/api/pcb-projects', json={'projects': [{**project, 'name': 'Changed'}]}).status_code, 200)
        self.assertEqual(self.client.delete('/api/pcb-projects/owned').status_code, 200)

    def test_non_electronics_admin_can_manage_locations_and_pcbs(self):
        with self.module.db_connection() as connection:
            connection.execute("UPDATE people SET department = 'Powertrain', notion_sync = 0 WHERE id = 1")
        self.notion_login(self.client, 'notion-ana')
        self.assertEqual(self.client.patch('/api/locations', json={'name': 'Admin box'}).status_code, 200)
        self.assertEqual(self.client.delete('/api/locations', json={'name': 'Admin box'}).status_code, 200)
        project = {'id': 'admin-pcb', 'name': 'Admin PCB', 'items': []}
        self.assertEqual(self.client.post('/api/pcb-projects', json={'projects': [project]}).status_code, 200)
        self.assertEqual(self.client.delete('/api/pcb-projects/admin-pcb').status_code, 200)

    def test_admin_previews_the_site_with_the_permissions_of_the_view(self):
        self.notion_login(self.client, 'notion-ana')
        leds = {'cat': 'LEDs', 'props': {'cor': 'azul', 'tamanho (mm)': '5', 'tensão direta (V)': '3'}, 'qty': 1, 'mode': 'in'}
        self.assertEqual(self.client.post('/api/auth/view-as', json={'role': 'Member', 'departments': ['Marketing']}).status_code, 400)
        self.assertEqual(self.client.post('/api/auth/view-as', json={'role': 'Member', 'departments': ['Powertrain']}).status_code, 200)
        data = self.client.get('/api/data').json
        self.assertEqual((data['user']['admin'], data['user']['role'], data['user']['department']), (False, 'Member', 'Powertrain'))
        self.assertEqual(data['preview'], {'role': 'Member', 'department': 'Powertrain'})
        # The server enforces the view, not just the page.
        self.assertEqual(self.client.post('/api/move', json=leds).status_code, 403)
        self.assertEqual(self.client.get('/api/purchases').status_code, 403)
        self.assertEqual(self.client.get('/api/people').status_code, 403)
        self.client.post('/api/auth/view-as', json={'role': 'Department Leader', 'departments': ['Electronics']})
        self.assertEqual(self.client.post('/api/move', json=leds).status_code, 200)
        # As a guest the admin is signed out for every page, but can still switch back.
        self.client.post('/api/auth/view-as', json={'guest': True})
        data = self.client.get('/api/data').json
        self.assertEqual((data['user'], data['preview']), (None, {'guest': True}))
        self.assertEqual(self.client.post('/api/move', json=leds).status_code, 401)
        self.assertEqual(self.client.delete('/api/auth/view-as').status_code, 200)
        data = self.client.get('/api/data').json
        self.assertEqual((data['user']['admin'], data['preview']), (True, None))

    def test_only_admins_can_preview(self):
        self.permissions('Board', 'Electronics')
        self.notion_login(self.client, 'notion-rui')
        self.assertEqual(self.client.post('/api/auth/view-as', json={'guest': True}).status_code, 403)
        self.assertIsNone(self.client.get('/api/data').json['preview'])
        self.assertEqual(self.user(self.client)['name'], 'Rui')
