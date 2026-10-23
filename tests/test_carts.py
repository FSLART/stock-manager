import importlib.util
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.carts import parse_cart, stock_fields  # noqa: E402

MOUSER = [
    [''] * 11,
    ['CARRINHO DE COMPRAS'] + [''] * 10,
    ['30-set-25 19:57:53'] + [''] * 10,
    ['', 'Nº da Mouser', 'Nº do fabricante', 'Fabricante', 'Número do cliente', 'Descrição ', 'RoHS', 'Vida Útil', 'Quant. do pedido', 'Preço (EUR)', 'Ext.: (EUR)'],
    [1.0, '71-CRCW1206J-15', 'CRCW120615R0JNTA', 'Vishay', '', 'Resistores de Filme Espesso - SMD 1/4watt 15ohms 5%', 'Não', '', 20.0, '0,071 €', '1,42 €'],
    [2.0, '581-KAM15AR71H104JT', 'KAM15AR71H104JT', 'KYOCERA AVX', '', 'Capacitores de cerâmica multicamada MLCC - SMD/SMT 50V .1pF X7R 0603 5% AEC-Q200', '', '', 10.0, '0,182 €', '1,82 €'],
    [3.0, '538-43045-0201', '43045-0201', 'Molex', '', 'Distribuidores e Alojamento de Fios Micro-Fit', '', '', 10.0, '0,676 €', '6,76 €'],
    ['', '', '', '', '', '', '', '', '', '', ''],
]
DIGIKEY = [
    ['Digi-Key: Shopping Cart', None, None, None, None, None, None, None, None, None],
    ['Index', 'Quantity', 'Part Number', 'Manufacturer Part Number', 'Description', 'Customer Reference', 'Available', 'Backorder', 'Unit Price', 'Extended Price USD'],
    [1, 10, '1727-8686-1-ND', 'MJD32CAJ', 'TRANS PNP 100V 3A DPAK', None, 10, 0, 1.0, 10.0],
]


class CartParsingTest(unittest.TestCase):
    def test_mouser_cart_lines_become_catalog_parts_with_stock_fields(self):
        when, parts = parse_cart(MOUSER, 'Compras.xls')
        self.assertEqual(when.isoformat(), '2025-09-30')
        self.assertEqual([part['mpn'] for part in parts], ['CRCW120615R0JNTA', 'KAM15AR71H104JT', '43045-0201'])
        resistor, capacitor, connector = parts
        self.assertEqual((resistor['category'], resistor['props']['valor (Ω)'], resistor['props']['tamanho'], resistor['price']), ('Resistências', '15', '1206', 0.071))
        # A descrição diz ".1pF"; o código 104 do fabricante é que está certo.
        self.assertEqual((capacitor['category'], capacitor['props']['capacidade'], capacitor['props']['tipo'], capacitor['props']['Tensão']), ('Condensadores', '100nF', '0603', '50V'))
        self.assertEqual((connector['category'], connector['props'], connector['manufacturer'], connector['source']), ('', {}, 'Molex', 'Compras.xls 2025-09-30'))

    def test_digikey_prices_are_converted_from_usd(self):
        _, [part] = parse_cart(DIGIKEY, 'DigiKey.xlsx')
        self.assertEqual((part['mpn'], part['price']), ('MJD32CAJ', 0.92))

    def test_values_hidden_in_part_numbers_and_unusual_descriptions(self):
        cases = {
            ('RCA060310K0FKEC', 'Resistores de Filme Espesso - SMD Resistores de Filme Espesso - SMD'): ('10k', '603'),
            ('CRCW060310R0FKEDHP', 'Thick Film Resistors - SMD CRCW 603 10R0 0.01 100 ppm/K'): ('10', '603'),
            ('CR0603-JW-915ELF', 'Thick Film Resistors - SMD 9.1MOHM 1/10WATT 5%'): ('9.1M', '603'),
            ('RC0805FR-070RL', 'Thick Film Resistors - SMD General Purpose Chip Resistor 0805, 0Ohms, 1%, 1/8W'): ('0', '805'),
            ('ERJ-U03F43R0V', 'Resistores de Filme Espesso - SMD 0603 1% 43ohm Anti-Sulfur AEC-Q200'): ('43', '603'),
            ('RPCQ2512JT4R70', 'Thick Film Resistors - SMD 4.7Ohms 2512 5% 4W 250V 400ppm'): ('4.7', '2512'),
        }
        for (mpn, description), expected in cases.items():
            category, props = stock_fields(mpn, description)
            self.assertEqual((category, props['valor (Ω)'], props['tamanho']), ('Resistências', *expected), mpn)
        self.assertEqual(stock_fields('35WR20KLFTR', 'Trimmer Resistors - SMD 3mm 20K Open Type Trimmer'), ('', {}))


class PartsStorageTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        with patch.dict(os.environ, {'DB_BACKEND': 'sqlite', 'STORAGE_MODE': 'local', 'DB_PATH': str(Path(self.temp.name) / 'stock.db')}):
            spec = importlib.util.spec_from_file_location('parts_server', ROOT / 'backend/app.py')
            self.module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(self.module)

    def test_reimporting_a_part_replaces_it_and_the_catalog_is_sent_with_the_stock(self):
        self.module.save_parts([{'mpn': 'ABC-1', 'manufacturer': 'X', 'description': 'old', 'price': 1.0}])
        self.module.save_parts([{'mpn': 'abc-1', 'manufacturer': 'X', 'description': 'new', 'category': 'Resistências', 'props': {'tamanho': '603'}, 'price': 0.5}])
        response = self.module.app.test_client().get('/api/data')
        self.assertEqual(response.status_code, 200)
        [part] = response.json['parts']
        self.assertEqual((part['mpn'], part['description'], part['props'], part['price']), ('abc-1', 'new', {'tamanho': '603'}, 0.5))


if __name__ == '__main__':
    unittest.main()
