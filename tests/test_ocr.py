import importlib.util
import io
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from PIL import Image

from auth_helper import as_person

ROOT = Path(__file__).resolve().parents[1]
PARTS = [
    {'mpn': 'WR08X9091FTL', 'manufacturer': 'Walsin'},
    {'mpn': 'VG039NCHXTB103', 'manufacturer': 'HDK'},
    {'mpn': 'RC0603FR-0710KL', 'manufacturer': 'Yageo'},
    {'mpn': '42815-0042 (Loose Piece)', 'manufacturer': 'Molex'},
]


class OcrTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        with patch.dict(os.environ, {'DB_BACKEND': 'sqlite', 'STORAGE_MODE': 'local', 'DB_PATH': str(Path(self.temp.name) / 'stock.db')}):
            spec = importlib.util.spec_from_file_location('ocr_server', ROOT / 'backend/app.py')
            self.module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(self.module)

    def test_matches_noisy_ocr_text_against_the_catalog(self):
        match = self.module.match_label_text
        # Saidas reais do Tesseract: O em vez de 0, final cortado, letras separadas, so metade do P/N.
        self.assertEqual(match('Online eComponent Mega Store dspn mon WRO8X9091F il iit qty 100 Pes www.comkey.in', PARTS),
                         {'mpn': 'WR08X9091FTL', 'manufacturer': 'Walsin', 'qty': 100, 'ocr': True})
        self.assertEqual(match('WALSIN: WRO8X9091 FT). mpn', PARTS)['mpn'], 'WR08X9091FTL')
        self.assertEqual(match('x VGO39NCHXTB103 HDK( 14 SMD', PARTS)['mpn'], 'VG039NCHXTB103')
        self.assertEqual(match('NCHXTB103 14 SMD B21-06-12', PARTS)['mpn'], 'VG039NCHXTB103')
        self.assertEqual(match('P/N 428150042', PARTS)['mpn'], '42815-0042 (Loose Piece)')

    def test_ignores_text_without_a_part_number(self):
        match = self.module.match_label_text
        self.assertIsNone(match('India Online eComponent Mega Store +91 99 00 48 66 77 www.comkey.in', PARTS))
        self.assertIsNone(match('001 AGE-YYICI-025-99', []))
        # Um P/N desconhecido so passa no formato FABRICANTE:P/N e continua marcado como lido por OCR.
        self.assertEqual(match('mpn: ACME:XY123AB9 qty : 40 Pcs', [])['mpn'], 'XY123AB9')

    def test_endpoint_needs_login_and_returns_the_label(self):
        client = self.module.app.test_client()
        png = io.BytesIO()
        Image.new('RGB', (40, 20), 'white').save(png, 'PNG')
        upload = lambda: {'image': (io.BytesIO(png.getvalue()), 'etiqueta.png')}
        self.assertEqual(client.post('/api/ocr', data=upload()).status_code, 401)
        as_person(self, self.module)
        self.module.save_parts([{**PARTS[0], 'description': '', 'category': 'Resistências', 'props': {}, 'price': None, 'source': 'teste'}])
        with patch.object(self.module, 'ocr_image_text', return_value='dspn WRO8X9091F qty 100 Pcs'):
            response = client.post('/api/ocr', data=upload())
        self.assertEqual((response.status_code, response.json['label']['mpn']), (200, 'WR08X9091FTL'))
        self.assertEqual(client.post('/api/ocr', data={}).status_code, 400)
        self.assertEqual(client.post('/api/ocr', data={'image': (io.BytesIO(b'nao e imagem'), 'x.png')}).status_code, 400)


if __name__ == '__main__':
    unittest.main()
