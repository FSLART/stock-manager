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
LART = '7f0ce478-90c2-81b0-a632-0003734e51bc'


class AuthTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        with patch.dict(os.environ, {'DB_BACKEND': 'sqlite', 'STORAGE_MODE': 'local', 'DB_PATH': str(Path(self.temp.name) / 'stock.db'), 'MEMBERS_PATH': str(Path(self.temp.name) / 'members.json'),
                                     'PUBLIC_BASE_URL': 'http://localhost', 'NOTION_CLIENT_ID': 'cid', 'NOTION_CLIENT_SECRET': 'secret',
                                     'NOTION_WORKSPACE_ID': LART}):
            spec = importlib.util.spec_from_file_location('auth_server', ROOT / 'backend/app.py')
            self.module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(self.module)
        self.client = self.module.app.test_client()
        self.module.init_db()
        with self.module.db_connection() as connection:
            connection.executemany('INSERT INTO people (id, name, pin_hash, notion_id, is_admin) VALUES (?, ?, ?, ?, ?)', [
                (1, 'Ana', generate_password_hash('AB12'), 'notion-ana', 1),
                (2, 'Rui', generate_password_hash('9999'), 'notion-rui', 0),
            ])

    def notion_login(self, client, notion_id, workspace='other-workspace', name='X', avatar='https://img/rui.png', members=()):
        client.get('/api/auth/notion')
        with client.session_transaction() as session:
            state = session['notion_state']
        body = io.BytesIO(json.dumps({'access_token': 't', 'workspace_id': workspace,
                                      'owner': {'type': 'user', 'user': {'id': notion_id, 'name': name, 'avatar_url': avatar}}}).encode())
        # Segundo pedido: a base Members Filtered, com (nome, departamentos) por linha.
        rows = io.BytesIO(json.dumps({'has_more': False, 'results': [
            {'properties': {'Name': {'title': [{'plain_text': title}]}, 'Department': {'multi_select': [{'name': tag} for tag in tags]}}}
            for title, tags in members or ()]}).encode())
        # members=None: a API nao deixa ler a base.
        with patch.object(self.module.urllib.request, 'urlopen', side_effect=[body, OSError() if members is None else rows]) as urlopen:
            response = client.get(f'/api/auth/notion/callback?code=c&state={state}')
        self.assertEqual(urlopen.call_args_list[0].args[0].get_header('Authorization'), 'Basic Y2lkOnNlY3JldA==')
        return response

    def user(self, client):
        return client.get('/api/data').json['user']

    def test_writes_need_login_and_are_recorded_with_the_person(self):
        move = {'cat': 'LEDs', 'props': {'cor': 'azul', 'tamanho (mm)': '5', 'tensão direta (V)': '3'}, 'qty': 4, 'mode': 'in'}
        response = self.client.post('/api/move', json=move)
        self.assertEqual((response.status_code, response.json['login']), (401, True))
        self.assertIsNone(self.user(self.client))
        self.assertEqual(self.notion_login(self.client, 'notion-ana').headers['Location'], '/#/stock')
        self.assertEqual(self.user(self.client)['name'], 'Ana')
        self.assertEqual(self.client.post('/api/move', json=move).status_code, 200)
        self.assertEqual(self.client.post('/api/items/1/step', json={'delta': -10}).status_code, 200)
        self.assertEqual(self.client.delete('/api/items/1').status_code, 200)
        self.client.post('/api/auth/logout')
        self.assertEqual(self.client.post('/api/move', json=move).status_code, 401)
        movements = self.module.app.test_client().get('/api/movements').json['movements']
        self.assertEqual([(m['person'], m['type'], m['delta'], m['before'], m['after']) for m in movements],
                         [('Ana', 'delete', 0, 0, 0), ('Ana', 'out', -4, 4, 0), ('Ana', 'in', 4, 0, 4)])
        self.assertEqual(movements[-1]['props']['cor'], 'azul')

    def test_only_electronics_change_electronic_stock(self):
        led = {'cat': 'LEDs', 'props': {'cor': 'azul', 'tamanho (mm)': '5', 'tensão direta (V)': '3'}, 'qty': 1, 'mode': 'in'}
        cable = {'cat': 'Fios', 'props': {'cor': 'preto'}, 'qty': 1, 'mode': 'in'}
        self.notion_login(self.client, 'notion-ana')
        self.assertEqual(self.client.post('/api/categories', json={'name': 'Fios', 'props': ['cor'], 'section': 'Harness'}).status_code, 200)
        self.assertEqual(self.client.post('/api/move', json=led).status_code, 200)
        self.notion_login(self.client, 'notion-rui')
        self.assertEqual(self.client.post('/api/move', json=led).status_code, 403)
        self.assertEqual(self.client.post('/api/items/1/step', json={'delta': -1}).status_code, 403)
        self.assertEqual(self.client.delete('/api/categories/LEDs').status_code, 403)
        self.assertEqual(self.client.post('/api/categories', json={'name': 'Novos', 'props': ['x']}).status_code, 403)
        self.assertEqual(self.client.post('/api/move', json=cable).status_code, 200)
        # Etiquetas seguem a regra do stock eletronico; /api/auth/me diz ao site da cablagem quem tem sessao.
        self.assertEqual(self.client.post('/api/labels', json={'title': 'A1', 'width': 55, 'height': 25}).status_code, 403)
        self.assertEqual(self.client.delete('/api/labels', json={'ids': [1]}).status_code, 403)
        self.assertIsNotNone(self.client.get('/api/auth/me').json['user'])
        self.assertIsNone(self.module.app.test_client().get('/api/auth/me').json['user'])
        # Nao encontrado (ou ambiguo) no Notion: fica como estava.
        self.notion_login(self.client, 'notion-rui', name='Rui Costa', members=[('Rui Sá Costa', ['Electronics']), ('Rui Lopes Costa', ['Board'])])
        self.assertEqual(self.client.post('/api/move', json=led).status_code, 403)
        self.notion_login(self.client, 'notion-rui', name='Rui Costa', members=[('Ana Lima', ['Board']), ('Rúi Pedro  Costa', ['Electronics', 'Leaders'])])
        self.assertEqual((self.user(self.client)['role'], self.user(self.client)['department']), ('Department Leader', 'Electronics'))
        self.assertEqual(self.client.post('/api/move', json=led).status_code, 200)
        self.notion_login(self.client, 'notion-rui', name='Rui Costa', members=[('Rui Costa', ['Powertrain', 'Board'])])
        self.assertEqual((self.user(self.client)['role'], self.user(self.client)['department']), ('Board', 'Powertrain'))
        self.assertEqual(self.client.post('/api/move', json=led).status_code, 403)
        # Sem acesso a API: usa a copia local da base.
        Path(self.temp.name, 'members.json').write_text(json.dumps([['Rui Costa', ['Electronics']]]), encoding='utf-8')
        self.notion_login(self.client, 'notion-rui', name='Rui Costa', members=None)
        self.assertEqual(self.user(self.client)['department'], 'Electronics')

    def test_same_person_matches_short_names_in_order(self):
        same = self.module.same_person
        self.assertTrue(same('Rita Faria', 'Rita Sofia Faria Lemos'))
        self.assertTrue(same('Tomas Andre Vale Rocha', 'Tomas Rocha'))
        self.assertTrue(same('Ines Goncalves Prata', 'Inês Gonçalves Prata (iprata)'))
        self.assertFalse(same('Nuno', 'Nuno Alves'))
        self.assertFalse(same('Nuno Matos', 'Hugo Nuno da Cunha Matos Leal dos Reis'))
        self.assertFalse(same('Faria Rita', 'Rita Sofia Faria Lemos'))

    def test_admin_sets_departments_and_notion_stops_overwriting(self):
        led = {'cat': 'LEDs', 'props': {'cor': 'azul', 'tamanho (mm)': '5', 'tensão direta (V)': '3'}, 'qty': 1, 'mode': 'in'}
        self.notion_login(self.client, 'notion-ana')
        self.assertEqual(self.client.patch('/api/people/2', json={'departments': ['Nope']}).status_code, 400)
        self.assertEqual(self.client.patch('/api/people/2', json={'role': 'Chefe'}).status_code, 400)
        self.assertEqual(self.client.patch('/api/people/2', json={'departments': ['Powertrain', 'Electronics'], 'role': 'Department Leader'}).status_code, 200)
        rui = next(person for person in self.client.get('/api/people').json['people'] if person['id'] == 2)
        self.assertEqual((rui['role'], rui['department'], rui['manual']), ('Department Leader', 'Electronics, Powertrain', True))
        self.notion_login(self.client, 'notion-rui', name='Rui Costa', members=[('Rui Costa', ['Dynamics'])])
        self.assertEqual(self.user(self.client)['department'], 'Electronics, Powertrain')
        self.assertEqual(self.client.post('/api/move', json=led).status_code, 200)

    def test_pin_login_is_disabled(self):
        self.assertEqual(self.client.post('/api/auth/login', json={'person_id': 1, 'pin': 'AB12'}).status_code, 404)
        self.assertEqual(self.client.get('/api/auth/people').status_code, 404)
        self.assertIsNone(self.user(self.client))

    def test_only_admins_manage_people(self):
        self.notion_login(self.client, 'notion-rui')
        self.assertEqual(self.client.get('/api/people').status_code, 403)
        self.assertEqual(self.client.patch('/api/people/2', json={'admin': True}).status_code, 403)
        self.notion_login(self.client, 'notion-ana')
        self.assertNotEqual(self.client.post('/api/people', json={'name': 'Zé', 'pin': '1234'}).status_code, 200)
        self.assertEqual(self.client.patch('/api/people/2', json={'pin': '4321'}).status_code, 400)
        self.assertEqual(self.client.patch('/api/people/1', json={'admin': False}).status_code, 400)
        self.assertEqual(self.client.delete('/api/people/1').status_code, 400)
        self.assertEqual(self.client.patch('/api/people/2', json={'admin': True}).status_code, 200)
        self.assertEqual(self.client.delete('/api/people/2').status_code, 200)
        self.assertEqual([p['name'] for p in self.client.get('/api/people').json['people']], ['Ana'])

    def test_notion_login_adds_lart_members_and_rejects_others(self):
        self.assertIn('owner=user', self.client.get('/api/auth/notion').headers['Location'])
        self.assertEqual(self.client.get('/api/auth/notion/callback?code=c&state=wrong').status_code, 400)
        # Conta conhecida entra por qualquer workspace.
        self.notion_login(self.client, 'notion-rui')
        self.assertEqual(self.user(self.client)['name'], 'Rui')
        # Conta desconhecida de outro workspace e recusada.
        stranger = self.module.app.test_client()
        self.assertEqual(self.notion_login(stranger, 'notion-out', name='Intruso').status_code, 400)
        self.assertIsNone(self.user(stranger))
        # Conta desconhecida do LART entra como pessoa normal; nome repetido ganha sufixo.
        newcomer = self.module.app.test_client()
        self.assertEqual(self.notion_login(newcomer, 'notion-new-1234', workspace=LART.replace('-', ''), name='Rui').status_code, 302)
        self.assertEqual(self.user(newcomer), {'id': 3, 'name': 'Rui (1234)', 'admin': False, 'notion': True, 'avatar': 'https://img/rui.png',
                                               'role': 'Member', 'department': ''})
        again = self.module.app.test_client()
        self.notion_login(again, 'notion-new-1234', avatar='javascript:alert(1)')
        self.assertEqual((self.user(again)['id'], self.user(again)['avatar']), (3, ''))
        with self.module.db_connection() as connection:
            self.assertEqual(connection.execute('SELECT COUNT(*) AS n FROM people').fetchone()['n'], 3)


if __name__ == '__main__':
    unittest.main()
