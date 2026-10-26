import csv
import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from auth_helper import as_person

ROOT = Path(__file__).resolve().parents[1]
MOUSER_CART = [
    ['CARRINHO DE COMPRAS'], ['Isto não é uma fatura'], ['30-set-25 19:57:53'],
    ['', 'Nº da Mouser', 'Nº do fabricante', 'Fabricante', 'Número do cliente', 'Descrição ', 'RoHS', 'Vida Útil', 'Quant. do pedido', 'Preço (EUR)', 'Ext.: (EUR)'],
    [1.0, '603-RC0603FR-0710RL', 'RC0603FR-0710RL', 'YAGEO', '', 'Chip Resistor 0603, 10Ohms', 'RoHS', '', 15.0, '0,01 €', '0,14 €'],
]
BATCH = [
    ['#VALUE!', None, None, 'BATCH PRODUÇÃO Nº 2'], [None, None, None, 'TTIG'],
    ['Equipa', None, 'LART, Formula Student', 'Data', 2026],
    ['Pessoa Responsável da Peça ', None, 'Rafael Gonçalves', 'Telemóvel', 911],
    ['Data', None, '06/04/2026'],
    ['Peça', 'Imagem', 'Qt', 'Material', 'Nome do ficheiro', 'NOTAS'],
    ['Calha Pedaleira Top', '#VALUE!', 2, 'Aço F10', 'Calha_Top', 'Corte'],
    [None, None, None, None, None, None],
]


class PurchasesTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name) / 'compras'
        self.folder.mkdir()
        env = {'DB_BACKEND': 'sqlite', 'STORAGE_MODE': 'local', 'DB_PATH': str(Path(self.temp.name) / 'stock.db'), 'PURCHASES_DIR': str(self.folder)}
        with patch.dict(os.environ, env):
            spec = importlib.util.spec_from_file_location('purchases_server', ROOT / 'backend/app.py')
            self.module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(self.module)
        self.client = self.module.app.test_client()

    def test_reads_mouser_cart_and_batch_template(self):
        from purchases import parse_sheet
        [row] = parse_sheet(MOUSER_CART, 'Compras Mouser 1º Batch.xls', 'Cart')
        self.assertEqual((row['pn'], row['supplier_pn'], row['supplier'], row['date'], row['qty'], row['price'], row['total']),
                         ('RC0603FR-0710RL', '603-RC0603FR-0710RL', 'Mouser', '2025-09-30', 15.0, 0.01, 0.14))
        from purchases import number
        self.assertEqual((number('51.27'), number('1.025,20 €'), number('~80')), (51.27, 1025.2, 80.0))
        [row] = parse_sheet(BATCH,'BATCH_PRODUCAO_T-26e.xlsx', 'BATCH_2_2026-TTIG')
        self.assertEqual((row['kind'], row['supplier'], row['date'], row['person'], row['pn'], row['description'], row['qty'], row['notes']),
                         ('Produção', 'TTIG', '2026-04-06', 'Rafael Gonçalves', 'Calha_Top', 'Calha Pedaleira Top', 2.0, 'Aço F10 · Corte'))

    def test_api_needs_login_and_reads_the_folder_without_duplicates(self):
        self.assertEqual(self.client.get('/api/purchases').status_code, 401)
        self.assertEqual(self.client.get('/api/purchases/files/x.csv').status_code, 401)
        for name in ('a.csv', 'copia.csv'):  # o mesmo batch em dois ficheiros fica uma vez
            with open(self.folder / name, 'w', newline='') as file:
                csv.writer(file, delimiter=';').writerows([['Mouser Part Number', 'Quantity'], ['652-SMBJ75A', '10']])
        as_person(self, self.module)
        rows = self.client.get('/api/purchases').get_json()['purchases']
        self.assertEqual([(row['supplier_pn'], row['qty'], row['file']) for row in rows], [('652-SMBJ75A', 10.0, 'a.csv')])
        self.assertEqual(self.client.get('/api/purchases/files/a.csv').status_code, 200)
        self.assertEqual(self.client.get('/api/purchases/files/../stock.db').status_code, 404)

    def test_only_admins_board_and_department_leaders_see_purchases(self):
        member = {'id': 2, 'name': 'Membro', 'admin': False, 'role': 'Member'}
        with patch.object(self.module, 'current_person', return_value=member):
            self.assertEqual(self.client.get('/api/purchases').status_code, 403)
            self.assertEqual(self.client.get('/api/purchases/files/a.csv').status_code, 403)
        with patch.object(self.module, 'current_person', return_value={**member, 'role': 'Department Leader'}):
            self.assertEqual(self.client.get('/api/purchases').status_code, 200)
        with patch.object(self.module, 'current_person', return_value={**member, 'role': 'Board'}):
            self.assertEqual(self.client.get('/api/purchases').status_code, 200)


if __name__ == '__main__':
    unittest.main()
