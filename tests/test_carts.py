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
sys.path.insert(0, str(ROOT / 'tests'))
from auth_helper import as_person  # noqa: E402

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
        self.assertEqual((resistor['category'], resistor['props']['Resistência (Ω)'], resistor['props']['Encapsulamento'], resistor['price']), ('Resistências', '15', '1206', 0.071))
        # A descrição diz ".1pF"; o código 104 do fabricante é que está certo.
        self.assertEqual((capacitor['category'], capacitor['props']['Capacidade'], capacitor['props']['Encapsulamento'], capacitor['props']['Tensão (V)']), ('Condensadores', '100nF', '0603', '50'))
        self.assertEqual((connector['category'], connector['props'], connector['manufacturer'], connector['source']), ('Conectores', {}, 'Molex', 'Compras.xls 2025-09-30'))

    def test_digikey_prices_are_converted_from_usd(self):
        _, [part] = parse_cart(DIGIKEY, 'DigiKey.xlsx')
        self.assertEqual((part['mpn'], part['price']), ('MJD32CAJ', 0.92))

    def test_values_hidden_in_part_numbers_and_unusual_descriptions(self):
        cases = {
            ('RCA060310K0FKEC', 'Resistores de Filme Espesso - SMD Resistores de Filme Espesso - SMD'): ('10k', '0603'),
            ('CRCW060310R0FKEDHP', 'Thick Film Resistors - SMD CRCW 603 10R0 0.01 100 ppm/K'): ('10', '0603'),
            ('CR0603-JW-915ELF', 'Thick Film Resistors - SMD 9.1MOHM 1/10WATT 5%'): ('9.1M', '0603'),
            ('RC0805FR-070RL', 'Thick Film Resistors - SMD General Purpose Chip Resistor 0805, 0Ohms, 1%, 1/8W'): ('0', '0805'),
            ('ERJ-U03F43R0V', 'Resistores de Filme Espesso - SMD 0603 1% 43ohm Anti-Sulfur AEC-Q200'): ('43', '0603'),
            ('RPCQ2512JT4R70', 'Thick Film Resistors - SMD 4.7Ohms 2512 5% 4W 250V 400ppm'): ('4.7', '2512'),
        }
        for (mpn, description), expected in cases.items():
            category, props = stock_fields(mpn, description)
            self.assertEqual((category, props['Resistência (Ω)'], props['Encapsulamento']), ('Resistências', *expected), mpn)
        self.assertEqual(stock_fields('35WR20KLFTR', 'Trimmer Resistors - SMD 3mm 20K Open Type Trimmer'), ('', {}))

    def test_digikey_parameters_fill_the_uniform_category_fields(self):
        from backend.carts import category_props, digikey_props, field_value
        self.assertEqual(category_props('Mosfets'), ['P/N', 'Fabricante', 'Encapsulamento', 'Tipo (N/P)', 'Id (A)', 'Vds (V)'])
        self.assertEqual(category_props('Crimps'), ['P/N', 'Fabricante', 'AWG', 'Género'])
        self.assertIsNone(category_props('Desconhecida'))
        cases = {('Corrente (A)', '600 mA'): '0.6', ('Id (A)', '1.5A (Tj)'): '1.5', ('Resistência (Ω)', '4.7 kOhms'): '4.7k',
                 ('Capacidade', '100 nF'): '100nF', ('Tensão da bobina (V)', '12VDC'): '12', ('Indutância (µH)', '1 mH'): '1000',
                 ('Frequência (MHz)', '32.768 kHz'): '0.032768', ('Entrada (V)', '1.6V ~ 3.6V'): '1.6-3.6', ('hFE', '100 @ 150mA, 10V'): '100',
                 ('Encapsulamento', '14-TSSOP (0.173", 4.40mm Width)'): '14-TSSOP', ('Tipo (N/P)', 'P-Channel'): 'P', ('Tolerância', '±1%'): '±1%'}
        for (field, text), value in cases.items():
            self.assertEqual(field_value(field, text), value, (field, text))
        parameters = {'Capacitance': '8 pF', 'Voltage - Rated': '50V', 'Temperature Coefficient': 'C0G, NP0', 'Package / Case': '0603 (1608 Metric)'}
        self.assertEqual(digikey_props('Condensadores', parameters, 'Capacitors > Ceramic Capacitors'),
                         {'Encapsulamento': '0603', 'Capacidade': '8pF', 'Tensão (V)': '50', 'Dielétrico': 'C0G, NP0', 'Tipo': 'cerâmico'})
        # Um parametro "-" conta como em falta e passa ao seguinte.
        self.assertEqual(digikey_props('Díodos', {'Technology': '-', 'Current - Average Rectified (Io)': '-'}, 'Diodes > Zener > Single Zener Diodes'), {'Tipo': 'Zener'})

    def test_other_parts_get_a_catalog_category_from_the_description(self):
        from backend.carts import catalog_category
        cases = {
            'Transistor Output Optocouplers Phototransistor Out': 'Optocouplers',
            'Headers & Wire Housings XH HEADER (SIDE)': 'Conectores',
            'Distribuidores e Alojamento de Fios FEMALE TERM 20-24': 'Conectores',
            'Hook-up Wire 782201 BLUE 100 FT': 'Cabos e fios',
            'Small Signal Switching Diodes 1000V,General Purpose Rectifiers': 'Díodos',
            'Single Colour LEDs WL-SMCD SMD Mono SMD 0603 Blue 465nm': 'LEDs',
            'TRANS PNP 100V 3A DPAK': 'Transístores',
            'Analog Comparators Quad 18V Open Drain Comparator E temp': 'CIs Amplificadores',
            'Thermal Interface Products Slow Cure Thermally Conductive Adhesive': 'Materiais térmicos',
            'Board Mount Temperature Sensors Linear Active Thermistor IC Sensors, Transducers > Temperature Sensors': 'Sensores',
            'NTC Thermistors 10K 1% Sensors, Transducers > Temperature Sensors > Thermistors - NTC': 'Termístores',
            'Circular MIL Spec Contacts Connectors, Interconnects > Circular Connectors > Circular Connector Contacts': 'Crimps',
            'MOSFET N-CH 50V 1.5A SOT89-3 Discrete Semiconductor Products > Transistors > FETs, MOSFETs': 'Mosfets',
            'IC EEPROM 8KBIT I2C 1MHZ 8MSOP Integrated Circuits (ICs) > Memory > Memory': 'EEPROM',
            'Something unknown': '',
        }
        for description, category in cases.items():
            self.assertEqual(catalog_category(description), category, description)


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


    def test_price_edits_update_the_catalog_and_bad_prices_are_refused(self):
        as_person(self, self.module)
        client = self.module.app.test_client()
        self.module.save_parts([{'mpn': 'ABC-1', 'manufacturer': 'X', 'description': 'kept', 'category': 'Resistências', 'props': {'tamanho': '603'}, 'price': 1.0}])
        self.assertEqual(client.post('/api/parts', json={'mpn': 'abc-1', 'price': 0.25}).status_code, 200)
        self.assertEqual(client.post('/api/parts', json={'mpn': 'NEW-9', 'price': '2.5', 'manufacturer': 'Y'}).status_code, 200)
        for body in [{'mpn': '-', 'price': 1}, {'mpn': 'ABC-1', 'price': -1}, {'mpn': 'ABC-1', 'price': 'nan'}, {'mpn': 'ABC-1', 'price': 'x'}, {'price': 1}]:
            self.assertEqual(client.post('/api/parts', json=body).status_code, 400, body)
        parts = {part['mpn']: part for part in self.module.db_parts()}
        self.assertEqual((parts['ABC-1']['price'], parts['ABC-1']['description'], parts['ABC-1']['props']), (0.25, 'kept', {'tamanho': '603'}))
        self.assertEqual((parts['NEW-9']['price'], parts['NEW-9']['manufacturer']), (2.5, 'Y'))
        self.assertTrue(parts['NEW-9']['source'].startswith('editado à mão'))

    def test_parts_can_be_added_and_corrected_field_by_field(self):
        as_person(self, self.module)
        client = self.module.app.test_client()
        added = client.post('/api/parts', json={'mpn': 'STM32F103CBT6', 'manufacturer': 'ST', 'description': 'MCU', 'category': 'Microcontroladores', 'price': ''})
        self.assertEqual((added.status_code, added.json['msg']), (200, 'Peça adicionada ao catálogo'))
        self.assertEqual(client.post('/api/parts', json={'mpn': 'stm32f103cbt6', 'category': 'MCUs'}).json['msg'], 'Peça guardada')
        [part] = self.module.db_parts()
        self.assertEqual((part['manufacturer'], part['description'], part['category'], part['price']), ('ST', 'MCU', 'MCUs', None))

    def test_lookup_fills_the_catalog_from_mouser_and_digikey(self):
        def supplier(url, body=None, headers=None, form=None):
            if 'mouser' in url:
                return {'Errors': [], 'SearchResults': {'Parts': [{
                    'ManufacturerPartNumber': 'CRCW120615R0JNTA', 'Manufacturer': 'Vishay', 'Category': 'Thick Film Resistors - SMD',
                    'Description': 'Thick Film Resistors - SMD 1/4watt 15ohms 5%', 'DataSheetUrl': 'https://www.mouser.com/ds/crcw.pdf',
                    'ImagePath': 'https://www.mouser.com/images/crcw.jpg', 'PriceBreaks': [{'Quantity': 1, 'Price': '0,094 €', 'Currency': 'EUR'}]}]}}
            if 'oauth2' in url:
                return {'access_token': 'token', 'expires_in': 599}
            self.assertEqual(headers['Authorization'], 'Bearer token')
            return {'ExactMatches': [{'ManufacturerProductNumber': 'CRCW120615R0JNTA', 'Manufacturer': {'Name': 'Vishay Dale'},
                                      'Description': {'ProductDescription': 'RES 15 OHM 5% 1/4W 1206'}, 'Category': {'Name': 'Resistors'},
                                      'UnitPrice': 0.09, 'DatasheetUrl': 'javascript:alert(1)', 'PhotoUrl': '//mm.digikey.com/crcw.jpg',
                                      'Parameters': [{'ParameterText': 'Power (Watts)', 'ValueText': '0.25W, 1/4W'}, {'ParameterText': 'Tolerance', 'ValueText': '±5%'},
                                                     {'ParameterText': 'Supplier Device Package', 'ValueText': '1206'}]}]}

        client = self.module.app.test_client()
        self.assertEqual(client.get('/api/parts/lookup?mpn=CRCW120615R0JNTA').status_code, 401)
        as_person(self, self.module)
        # As chaves reais do .env nao contam: sem chaves a pesquisa nem comeca.
        self.module.MOUSER_API_KEY = self.module.DIGIKEY_CLIENT_ID = ''
        self.assertEqual(client.get('/api/parts/lookup?mpn=CRCW120615R0JNTA').status_code, 501)
        self.module.MOUSER_API_KEY, self.module.DIGIKEY_CLIENT_ID, self.module.DIGIKEY_CLIENT_SECRET = 'key', 'id', 'secret'
        with patch.object(self.module, 'supplier_json', side_effect=supplier):
            found = client.get('/api/parts/lookup?mpn=crcw120615r0jnta').json
            part = found['part']
            self.assertEqual((part['mpn'], part['manufacturer'], part['category']), ('CRCW120615R0JNTA', 'Vishay', 'Resistências'))
            self.assertEqual(part['props'], {'Resistência (Ω)': '15', 'Encapsulamento': '1206', 'Potência (W)': '0.25', 'Tolerância': '±5%'})
            self.assertEqual((part['price'], part['datasheet'], found['image']), (0.094, 'https://www.mouser.com/ds/crcw.pdf', 'https://mm.digikey.com/crcw.jpg'))
            self.assertTrue(part['source'].startswith('Mouser API'))
            # Uma peça já no catálogo (carrinho) mantém os seus dados; da API vem o preço atual.
            self.module.save_parts([{'mpn': 'CRCW120615R0JNTA', 'manufacturer': 'Vishay', 'description': 'Resistores 15 ohms', 'category': 'Resistências', 'props': {'Encapsulamento': '1206', 'Potência (W)': '-'}, 'price': 0.071, 'source': 'cart'}])
            client.get('/api/parts/lookup?mpn=CRCW120615R0JNTA')
        [saved] = self.module.db_parts()
        # Os valores do catálogo ficam; os que faltavam (ou eram "-") vêm da DigiKey.
        self.assertEqual((saved['description'], saved['price'], saved['datasheet']), ('Resistores 15 ohms', 0.094, 'https://www.mouser.com/ds/crcw.pdf'))
        self.assertEqual(saved['props'], {'Resistência (Ω)': '15', 'Encapsulamento': '1206', 'Potência (W)': '0.25', 'Tolerância': '±5%'})
        with patch.object(self.module, 'supplier_json', side_effect=OSError('timeout')):
            self.assertEqual(client.get('/api/parts/lookup?mpn=XYZ123').status_code, 502)
        with patch.object(self.module, 'supplier_json', return_value={}):
            self.assertEqual(client.get('/api/parts/lookup?mpn=XYZ123').status_code, 404)

    def test_supplier_prices_use_the_last_separator_as_decimal(self):
        cases = {'0,094 €': 0.094, '1.234,56 €': 1234.56, '$0.10': 0.1, '1,234.50': 1234.5, '12': 12.0, '': None, '—': None}
        for text, price in cases.items():
            self.assertEqual(self.module.price_number(text), price, text)


if __name__ == '__main__':
    unittest.main()
