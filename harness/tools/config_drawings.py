"""Dados tirados dos desenhos que estão nas pastas (PDFs RapidHarness e o desenho do Handcart).

Topologia (troços e comprimentos) transcrita à mão dos PDFs; P/N, contactos e comprimentos do Handcart lidos do BOM
e da tabela de ligações de "Handcart Harness T26.pdf". Os nomes do desenho que não existem no Excel ficam como nós
do desenho (folha Nodes) e aparecem numa issue.
"""

DRAWING = 'transcrito do desenho'


def adbox(P):
    # AD_Box_Harnes_RapidHarness.pdf — o troço do Fan J1 não tem comprimento no desenho
    return dict(segments=[
        ('AD BOX J1', 'BP1', 150), ('JETSON U2C', 'BP1', 70), ('DC-DC J1', 'BP1', 30), ('DC-DC J2', 'BP1', 30),
        ('DC-DC J3', 'BP1', 30), ('DC-DC J4', 'BP1', 30), ('BP1', 'BP2', 90), ('SWITCH J1', 'BP2', 150),
        ('DC-DC J5', 'BP2', 40), ('BP2', 'BP3', 165), ('JETSON J1', 'BP3', 120), ('BP3', 'BP4', 20),
        ('ROUTER J1', 'BP4', 30), ('FAN J1', 'BP4', None)])


def sidepanel(P):
    # SidePanel_Harnes_RapidHarness.pdf (2 páginas); a árvore de cima (J2, LVMS, 24V BJ, GND) não tem comprimentos
    return dict(segments=[
        ('SIDEPANEL J2', 'BP1', None), ('GND', 'BP1', None), ('LVMS', 'BP1', None), ('+24V BJ', 'LVMS', None),
        ('ASMS', 'BP2', 210), ('SIDEPANEL J1', 'BP2', 200), ('IGN A.', 'BP2', 103), ('M.S', 'BP2', 103),
        ('BP2', 'BP3', 60), ('RACE S.', 'BP3', 103), ('BP3', 'BP4', 32), ('RESET', 'BP4', 103),
        ('GND BJ', 'BP4', 83), ('BP4', 'BP5', 101), ('TSMS', 'BP5', 65), ('BP5', 'BP6', 113),
        ('FUSE 1 -', 'BP6', 30), ('FUSE 2 -', 'BP6', 30), ('BP6', 'LVMS1', 100), ('FUSE 1 +', 'LVMS1', 30),
        ('FUSE 2 +', 'LVMS1', 30)])


# Handcart Harness T26.pdf, tabela de ligações (MAIN_HAND_PLACEHOLDER = ficha que vai ao ACCU J1 do acumulador)
HANDCART_LEN = {  # (de, para) -> mm
    ('HAND J1:A', 'ACCU J1:A'): 1500, ('HAND J1:D', 'ACCU J1:D'): 1500, ('HAND J1:E', 'ACCU J1:E'): 1500,
    ('HAND J1:H', 'ACCU J1:H'): 1500, ('HAND J1:J', 'ACCU J1:J'): 1500, ('HAND J1:K', 'ACCU J1:K'): 1500,
    ('HAND J1:L', 'ACCU J1:L'): 1500, ('HAND J1:N', 'HAND J2:2'): 750, ('HAND J1:N', 'ACCU J1:N'): 1500,
    ('HAND J1:P', 'HAND J3:2'): 750, ('HAND J1:P', 'ACCU J1:P'): 1500, ('HAND J1:V', 'ACCU J1:V'): 1500,
    ('HAND J1:W', 'ACCU J1:W'): 1500, ('HAND J1:X', 'ACCU J1:X'): 1500, ('HAND J1:a', 'ACCU J1:a'): 1500,
    ('HAND J1:b', 'ACCU J1:b'): 1500, ('HAND J1:e', 'HAND J2:3'): 750, ('HAND J1:e', 'HAND J3:3'): 750,
    ('HAND J1:e', 'ACCU J1:e'): 1500, ('HAND J1:f', 'ACCU J1:f'): 1500, ('HAND J1:g', 'HAND J2:1'): 750,
    ('HAND J1:g', 'HAND J3:1'): 750, ('HAND J1:g', 'ACCU J1:g'): 1500, ('HAND J1:h', 'ACCU J1:h'): 1500,
    ('HAND J1:j', 'ACCU J1:j'): 1500,
}


def handcart(P):
    rts = dict(housing_pn='RTS6BS18N32PHEC03', manufacturer='Amphenol Sine Systems', contact_pn='MP20W23F', gender='M')
    te = 'TE Connectivity'
    src = 'Handcart Harness T26.pdf (BOM)'
    return dict(
        known={
            'HAND J1': dict(rts, notes=f'P/N e contactos do desenho Handcart Harness T26.pdf.'),
            'ACCU J1': dict(rts, notes='MAIN_HAND_PLACEHOLDER no desenho: ficha macho que liga à ficha fêmea ACCU J1 '
                                      '(RTS718N32S03) do acumulador.'),
            'HAND J2': dict(housing_pn='1-2834075-3', manufacturer=te,
                            notes='Contactos 1-2834067-2 ou 1-2834068-2 (3 de cada no BOM) — confirmar qual vai em que ficha.'),
            'HAND J3': dict(housing_pn='1-2834074-3', manufacturer=te,
                            notes='Contactos 1-2834067-2 ou 1-2834068-2 (3 de cada no BOM) — confirmar qual vai em que ficha.'),
        },
        wire_default=dict(csa=0.5, wire_pn='0082104'),
        wire_len={frozenset((tuple(a.split(':')), tuple(b.split(':')))): mm for (a, b), mm in HANDCART_LEN.items()},
        parts=[
            ('RTS6BS18N32PHEC03', 'Amphenol Sine Systems', 'ficha circular', 'Ficha reta com endcap, 32 posições, casco 18, contactos macho, vedante de silicone', '', src, 'Y'),
            ('MP20W23F', 'Amphenol Sine Systems', 'crimp macho', 'Contacto ecomate RM, macho, crimp', '20–22 AWG', src, 'Y'),
            ('1-2834074-3', te, 'ficha', 'Mini IP67, 3 vias, ficha (plug)', '', src, 'Y'),
            ('1-2834075-3', te, 'ficha', 'Mini IP67, 3 vias, recetáculo', '', src, 'Y'),
            ('1-2834068-2', te, 'crimp', 'Contacto, 22 AWG', '22 AWG', src, 'Y'),
            ('1-2834067-2', te, 'crimp', 'Contacto SlimSeal', '', src, 'Y'),
            ('0082104', 'LAPP (Kabel)', 'fio', 'HEAT 205 SC, 1 × 0,5 mm², vermelho', '20 AWG', src, 'Y'),
        ])
