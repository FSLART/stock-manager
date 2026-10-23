import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from werkzeug.security import generate_password_hash

ROOT = Path(__file__).resolve().parents[1]


class AuthTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        with patch.dict(os.environ, {'DB_BACKEND': 'sqlite', 'STORAGE_MODE': 'local', 'DB_PATH': str(Path(self.temp.name) / 'stock.db'),
                                     'PUBLIC_BASE_URL': 'http://localhost', 'NOTION_CLIENT_ID': 'cid', 'NOTION_CLIENT_SECRET': 'secret'}):
            spec = importlib.util.spec_from_file_location('auth_server', ROOT / 'backend/app.py')
            self.module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(self.module)
        self.client = self.module.app.test_client()
        self.module.init_db()
        with self.module.db_connection() as connection:
            connection.executemany('INSERT INTO people (id, name, pin_hash, notion_id, is_admin) VALUES (?, ?, ?, ?, ?)', [
                (1, 'Ana', generate_password_hash('AB12'), None, 1),
                (2, 'Rui', generate_password_hash('9999'), 'notion-rui', 0),
            ])

    def login(self, person_id=1, pin='ab12'):
        return self.client.post('/api/auth/login', json={'person_id': person_id, 'pin': pin})

    def test_writes_need_login_and_are_recorded_with_the_person(self):
        move = {'cat': 'LEDs', 'props': {'cor': 'azul', 'tamanho (mm)': '5', 'tensão direta (V)': '3'}, 'qty': 4, 'mode': 'in'}
        response = self.client.post('/api/move', json=move)
        self.assertEqual((response.status_code, response.json['login']), (401, True))
        self.assertIsNone(self.client.get('/api/data').json['user'])
        self.assertEqual(self.login().status_code, 200)
        self.assertEqual(self.client.get('/api/data').json['user']['name'], 'Ana')
        self.assertEqual(self.client.post('/api/move', json=move).status_code, 200)
        self.assertEqual(self.client.post('/api/items/1/step', json={'delta': -10}).status_code, 200)
        self.assertEqual(self.client.delete('/api/items/1').status_code, 200)
        self.client.post('/api/auth/logout')
        self.assertEqual(self.client.post('/api/move', json=move).status_code, 401)
        movements = self.module.app.test_client().get('/api/movements').json['movements']
        self.assertEqual([(m['person'], m['type'], m['delta'], m['before'], m['after']) for m in movements],
                         [('Ana', 'delete', 0, 0, 0), ('Ana', 'out', -4, 4, 0), ('Ana', 'in', 4, 0, 4)])
        self.assertEqual(movements[-1]['props']['cor'], 'azul')

    def test_wrong_pin_is_rejected_and_throttled(self):
        for _ in range(5):
            self.assertEqual(self.login(pin='0000').status_code, 401)
        self.assertEqual(self.login().status_code, 429)
        self.assertEqual(self.login(person_id=2, pin='9999').status_code, 200)
        self.assertEqual(self.login(person_id='1').status_code, 400)

    def test_only_admins_manage_people(self):
        self.login(person_id=2, pin='9999')
        self.assertEqual(self.client.get('/api/people').status_code, 403)
        self.assertEqual(self.client.post('/api/people', json={'name': 'Zé', 'pin': '1234'}).status_code, 403)
        self.login()
        self.assertEqual(self.client.post('/api/people', json={'name': 'Zé', 'pin': '12'}).status_code, 400)
        self.assertEqual(self.client.post('/api/people', json={'name': 'Zé', 'pin': 'x9Y1'}).status_code, 200)
        self.assertEqual(self.client.post('/api/people', json={'name': 'zé', 'pin': '1234'}).status_code, 409)
        people = {p['name']: p for p in self.client.get('/api/people').json['people']}
        self.assertEqual(self.client.patch(f"/api/people/{people['Zé']['id']}", json={'pin': '4321'}).status_code, 200)
        self.assertEqual(self.client.patch('/api/people/1', json={'admin': False}).status_code, 400)
        self.assertEqual(self.client.delete('/api/people/1').status_code, 400)
        self.assertEqual(self.client.delete(f"/api/people/{people['Rui']['id']}").status_code, 200)
        self.assertEqual([p['name'] for p in self.client.get('/api/auth/people').json['people']], ['Ana', 'Zé'])
        other = self.module.app.test_client()
        self.assertEqual(other.post('/api/auth/login', json={'person_id': people['Zé']['id'], 'pin': '4321'}).status_code, 200)

    def notion_callback(self, client, notion_id):
        client.get('/api/auth/notion')
        with client.session_transaction() as session:
            state = session['notion_state']
        body = io.BytesIO(json.dumps({'access_token': 't', 'owner': {'type': 'user', 'user': {'id': notion_id, 'name': 'X'}}}).encode())
        with patch.object(self.module.urllib.request, 'urlopen', return_value=body) as urlopen:
            response = client.get(f'/api/auth/notion/callback?code=c&state={state}')
        self.assertEqual(urlopen.call_args.args[0].get_header('Authorization'), 'Basic Y2lkOnNlY3JldA==')
        return response

    def test_notion_login_matches_known_accounts_and_links_pin_sessions(self):
        redirect = self.client.get('/api/auth/notion')
        self.assertIn('owner=user', redirect.headers['Location'])
        self.assertEqual(self.client.get('/api/auth/notion/callback?code=c&state=wrong').status_code, 400)
        self.assertEqual(self.notion_callback(self.client, 'notion-rui').headers['Location'], '/#/stock')
        self.assertEqual(self.client.get('/api/data').json['user']['name'], 'Rui')
        stranger = self.module.app.test_client()
        self.assertEqual(self.notion_callback(stranger, 'notion-unknown').status_code, 400)
        self.assertIsNone(stranger.get('/api/data').json['user'])
        # Ana entra com PIN e liga a sua conta Notion; a partir dai o Notion chega.
        linking = self.module.app.test_client()
        linking.post('/api/auth/login', json={'person_id': 1, 'pin': 'AB12'})
        self.notion_callback(linking, 'notion-ana')
        fresh = self.module.app.test_client()
        self.notion_callback(fresh, 'notion-ana')
        self.assertEqual(fresh.get('/api/data').json['user']['name'], 'Ana')


if __name__ == '__main__':
    unittest.main()
