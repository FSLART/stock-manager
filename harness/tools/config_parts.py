"""Fichas e crimps propostos para cada metade, a partir da lista da equipa (Notion · Connectors Harness) que está no
catálogo data/t26/std/catalog.json. Tudo o que sai daqui vai para o Excel como PROPOSTA (itálico laranja)."""
import json
import re
from pathlib import Path

CATALOG = Path(__file__).resolve().parent.parent / 'data' / 't26' / 'std' / 'catalog.json'
# conector principal de cada caixa: lado da caixa = recetáculo RTS7 (fêmea), lado do car harness = ficha RTS6 (macho)
BOX_RTS = {'ACCU': 32, 'LVBOX': 32, 'DATABOX': 32, 'JBOX': 32, 'SIDEPANEL': 19, 'ADBOX': 19}
RTS = {32: ('RTS718N32S03', 'RTS6BS18N32PHEC03'), 19: ('RTS714N19S03', 'RTS6BS14N19PHEC03')}
# fichas para as placas (TE Micro MATE-N-LOK), escolhidas pelo nº exato de pinos do pinout
BOARDS = {'LVBOX': r'^(ACU|VCU|BSPD|CAN S|DC-DC) J\d+$', 'ACCU': r'^(TSAL D2|LATCH J1)$', 'CAR': r'^ACQUISITION \d+ J\d+$',
          'DATABOX': r'^ACQUISITION J\d+$', 'PEDALBOX': r'^ACQUISITION 1 J\d+$', 'AUXFRONT': r'^ACQUISITION 1 J\d+$'}
PDM = {'CAR': r'^PDM J\d+$'}


def load():
    return json.loads(CATALOG.read_text(encoding='utf-8')) if CATALOG.exists() else {'families': []}


def housing(cat, pn):
    for f in cat['families']:
        for h in f['housings']:
            if h.get('pn') == pn:
                return f, h
    return None, None


def contact(cat, pn):
    for f in cat['families']:
        for c in f['contacts']:
            if c['pn'] == pn:
                return f, c
    return None, None


def propose(cat, code, ref, n_pins, interface, hub, hub_ifaces):
    """Proposta para uma metade: dict(housing_pn, gender, contact_pn, manufacturer, notes) ou None."""
    pn = why = None
    if code in BOX_RTS and any(ref.startswith(p) for p in interface):
        pn, why = RTS[BOX_RTS[code]][0], 'conector principal da caixa (lado da caixa, fêmea)'
    elif code == hub:
        box = next((b for p, b in hub_ifaces.items() if ref.startswith(p)), None)
        if box in BOX_RTS:
            pn, why = RTS[BOX_RTS[box]][1], f'conector principal do {box} (lado do car harness, macho)'
    if not pn and code in BOARDS and re.match(BOARDS[code], ref):
        f = next((f for f in cat['families'] if f['name'] == 'TE Micro MATE-N-LOK'), None)
        h = next((h for h in (f['housings'] if f else []) if h.get('positions') == n_pins), None)
        if h:
            pn, why = h['pn'], f'ficha de placa com {n_pins} vias'
    if not pn and code in PDM and re.match(PDM[code], ref):
        pn, why = '770680-1', 'ficha do PDM (23 vias)'
    if not pn:
        return None
    f, h = housing(cat, pn)
    if not h:
        return None
    over = h.get('positions') and n_pins > h['positions']
    return dict(housing_pn=pn, gender=h.get('gender', ''), contact_pn=(h.get('contacts') or [''])[0],
                manufacturer=f['name'].split(' (')[0],
                notes=f"Proposto a partir da lista da equipa (Notion · Connectors Harness): {why}."
                      + (f" ATENÇÃO: o pinout tem {n_pins} pinos e a ficha {h['positions']}." if over else ''))


def parts_rows(cat, pns):
    """Linhas da folha Parts para os P/N usados num harness (fichas e contactos do catálogo)."""
    rows = []
    for pn in sorted(pns):
        f, h = housing(cat, pn)
        if h:
            rows.append((pn, f['name'], 'ficha', f"{h.get('positions', '?')} vias · {h.get('use', '')}", '',
                         cat.get('sources', {}).get(h.get('source'), ''), 'N'))
            continue
        f, c = contact(cat, pn)
        if c:
            awg = '–'.join(str(a) for a in sorted(set(c.get('awg') or []))) + ' AWG' if c.get('awg') else ''
            rows.append((pn, f['name'], 'crimp', c.get('description', ''), awg,
                         cat.get('sources', {}).get(c.get('source'), ''), 'N'))
    return rows
