"""Configuração curada do harness do acumulador (Accu_Harness): correções decididas na Fase 1.

Ver a folha Issues do ACCU.xlsx para o porquê de cada DROP/PIN_FIX."""


def config(P):
    HARNESS = 'ACCU'

    # ---------------------------------------------------------------------------
    # Configuração específica de Accu_Harnes_Pinouts.xlsx (outro Excel antigo = outro bloco destes)
    # ---------------------------------------------------------------------------
    # folha -> dispositivo; a folha AUX tem 4 blocos sem nome de dispositivo, por ordem
    SHEETS = [('ACCU J1', 'ACCU'), ('AUX', ['AIR-', 'AIR+', 'PRE', 'ISA']), ('VI', 'VI'), ('IMD', 'IMD'),
              ('TSAL Green ', 'TSAL'), ('Latchboard', 'LATCH'), ('AMS', 'AMS')]
    # de que folha vem a descrição/net quando as duas pontas discordam (ver I-10)
    PRIORITY = ['AMS', 'TSAL Green ', 'IMD', 'Latchboard', 'VI', 'AUX', 'ACCU J1']

    DEST_ALIAS = {'ASMS J11': 'AMS J11', 'LATCHBOARD J1': 'LATCH J1', 'LATCHBOARD': 'LATCH J1',
                  'ACCUJ2': 'ACCU J2', 'PRECHARGE J1': 'PRE J1', 'PRECHARGE J2': 'PRE J2', 'AIR-': 'AIR- HV',
                  'ACCU CHASSI': 'ACCU CHASSIS', 'AMS': 'AMS JUSB'}
    DEST_DEFAULT_PIN = {'FUSE 1': 'OUT', 'FUSE 2': 'OUT', 'ACCU CHASSIS': 'GND'}
    STUDS = {'FUSE 1', 'FUSE 2', 'ACCU CHASSIS', 'AIR- HV', 'AIR+ HV', 'PRE HV', 'ISA HV'}

    # pinos cujo label/direção foi corrigido (issue)
    PIN_FIX = {('ACCU J1', 'D'): ('Dis_SDC', 'OUT', 'I-02'), ('ACCU J1', 'E'): ('Dis_Trigg', 'IN', 'I-02'),
               ('ACCU J2', 'IL+'): ('Latch_SDC', 'IN', 'I-06'), ('ACCU J2', 'IL-'): ('ACC_SDC', 'OUT', 'I-06')}
    # ligações (origem -> destino, tal como escritas numa folha) que foram descartadas por contradizerem a outra ponta
    DROP = {(('LATCH J1', '5'), ('ACCU J1', 'j')): 'I-01', (('LATCH J1', '6'), ('ACCU J1', 'g')): 'I-01',
            (('ACCU J1', 'D'), ('AMS J11', '16')): 'I-02', (('ACCU J1', 'E'), ('AMS J11', '2')): 'I-02',
            (('ACCU J1', 'N'), ('AMS J12', '5')): 'I-03', (('ACCU J1', 'P'), ('AMS J12', '6')): 'I-03',
            (('AMS J14', '1'), ('ISA X1', '4')): 'I-04', (('AMS J14', '2'), ('ISA X1', '3')): 'I-04',
            (('AMS J10', '15'), ('TSAL D2', '4')): 'I-05',
            (('ACCU J2', 'IL+'), ('AMS J11', '10')): 'I-06', (('ACCU J2', 'IL-'), ('AMS J11', '14')): 'I-06',
            **{(('ACCU J1', p), ('AMS JUSB', '')): 'I-08' for p in 'RSTU'}}
    # fios que tocam nestes pinos ficam marcados com a issue
    ISSUE_PINS = {'I-01': [('LATCH J1', '5'), ('LATCH J1', '6')],
                  'I-02': [('ACCU J1', 'D'), ('ACCU J1', 'E')],
                  'I-03': [('ACCU J1', 'N'), ('ACCU J1', 'P')],
                  'I-04': [('ISA X1', '2'), ('ISA X1', '3')],
                  'I-05': [('TSAL D2', '5')],
                  'I-06': [('ACCU J2', 'IL+'), ('ACCU J2', 'IL-')],
                  'I-07': [('AMS J12', '10'), ('AMS J12', '11'), ('AMS J12', '12')],
                  'I-08': [('AMS JUSB', p) for p in '1234'],
                  'I-09': [('AIR- J2', '1')],
                  'I-10': [('ACCU J1', 'a'), ('ACCU J1', 'b'), ('TSAL D2', '7'), ('TSAL D2', '11')],
                  'I-15': [('SPL AUX_VCC', 'S'), ('SPL AUX_GND', 'S')],
                  'I-16': [('FUSE 1', 'OUT'), ('AIR- HV', 'A2')]}
    SPLICE_NET = {('ACCU J1', 'g'): 'AUX_VCC', ('ACCU J1', 'j'): 'AUX_GND'}
    NET_OVERRIDE = {'STATUS': 'IMD_STATUS', 'AMS_S': 'AMS_STATUS', 'GND_USB': 'USB_GND', '5V_USB': 'USB_5V',
                    '+VI_LED': 'VI_LED_VCC', '-VI_LED': 'VI_LED_GND', '+HV': 'TSAL_HV_POS', '-HV': 'TSAL_HV_NEG',
                    '+HV_VI': 'VI_HV_POS', '-HV_VI': 'VI_HV_NEG', 'PRE_VI': 'VI_HV_PRE', '+HV_IMD': 'IMD_HV_POS',
                    '-HV_IMD': 'IMD_HV_NEG', 'CHASSI_GND': 'CHASSIS_GND', 'ACU_GND': 'ACCU_CHASSIS_GND',
                    'GREEN_C': 'TSAL_GREEN_C', 'GREEN_1': 'TSAL_GREEN_1', 'GND': None, '+24V': None}

    # topologia transcrita de Accu_Harnes_RapidHarness.pdf (BP = ponto de ramificação)
    SEGMENTS = [('ISA X1', 'BP1', 140), ('AIR- J1', 'BP1', 50), ('AIR- J2', 'BP1', 30), ('BP1', 'BP2', 95),
                ('PRE J2', 'BP2', 100), ('PRE J1', 'BP2', 150), ('AIR+ J2', 'BP2', 60), ('AIR+ J1', 'BP2', 60),
                ('BP2', 'BP3', 140), ('BP2', 'BP4', 195), ('ACCU J2', 'BP3', 40), ('VI LED', 'BP3', 40),
                ('LATCH J1', 'BP4', 145), ('VI J3', 'BP4', 85), ('TSAL D2', 'BP4', 170), ('BP4', 'BP5', 35),
                ('IMD XK1A', 'BP5', 85), ('BP5', 'BP6', 65), ('ACCU J1', 'BP6', 190), ('BP6', 'BP7', 55),
                ('AMS J12', 'BP7', 190), ('AMS J15', 'BP7', 190), ('AMS J13', 'BP7', 190),
                ('AMS J14', 'BP7', 190), ('AMS J10', 'BP7', 140), ('AMS J11', 'BP7', 170)]



    # centro da peça no CAD V6 (T26_Jan15-VD_Assembly_V6; m; X lateral, Y vertical, Z longitudinal +trás). IMD, TSAL e VI
    # já não estão no CAD V6: ficam com o centro que tinham em t26_fev_otimizado.glb (mesmo referencial)
    ANCHORS = {'T26_15Jan-2026114PerifericosAssembly18x4-1/RTS718N32S03.stp-1': (-0.127, 0.329, 1.734),
               'T26_15Jan-2026114PerifericosAssembly18x4-1/HVSLS600022B1H6.stp-1': (0.144, 0.323, 1.734),
               'T26_15Jan-2026114IMD.002': (-0.063, 0.233, 1.778),
               'T26_15Jan-2026114TSAL_V2.2_Green_PCB_Cheap.002': (-0.059, 0.271, 1.778),
               'T26_15Jan-2026114VoltageIndicator_V3.002': (-0.063, 0.252, 1.778)}
    MICROFIT16 = dict(gender=P('F'), housing_pn=P('43025-1600'), mate_pn='43045-1628', manufacturer='Molex', contact_pn=P('43030-0001'),
                      notes='Header da placa 43045-1628 (folha BMS). Ficha e crimp do lado do cabo propostos.')
    MICROFIT2 = dict(gender=P('F'), housing_pn=P('43025-0200'), mate_pn='43045-0228', manufacturer='Molex', contact_pn=P('43030-0001'),
                     notes='Header da placa 43045-0228 (folha BMS). Ficha e crimp do lado do cabo propostos.')
    KNOWN = {
        # "S" no P/N = contactos fêmea (socket)
        'ACCU J1': dict(gender=P('F'), housing_pn='RTS718N32S03', manufacturer=P('Amphenol'), anchor='T26_15Jan-2026114PerifericosAssembly18x4-1/RTS718N32S03.stp-1',
                        notes='P/N = nome da peça no modelo 3D. 32 contactos (A–Z, a–j sem I/O/Q/i) batem com o pinout. '
                              'Ficha de cabo (contraparte) e contactos por definir.'),
        'ACCU J2': dict(housing_pn='HVSLS600022B1H6', hv_rated='Y', anchor='T26_15Jan-2026114PerifericosAssembly18x4-1/HVSLS600022B1H6.stp-1',
                        notes='P/N = nome da peça no modelo 3D. 2 pólos HV (A1/A2) + interlock (IL+/IL-).'),
        'AMS J10': MICROFIT16, 'AMS J11': MICROFIT16, 'AMS J12': MICROFIT16,
        'AMS J13': MICROFIT2, 'AMS J14': MICROFIT2, 'AMS J15': MICROFIT2,
        'IMD XK1A': dict(anchor='T26_15Jan-2026114IMD.002'),
        'IMD XLA': dict(anchor='T26_15Jan-2026114IMD.002', notes="No Excel original: 'XLA +' pino 1 e 'XLA -' pino 2."),
        'TSAL D2': dict(anchor='T26_15Jan-2026114TSAL_V2.2_Green_PCB_Cheap.002'),
        'TSAL J1': dict(anchor='T26_15Jan-2026114TSAL_V2.2_Green_PCB_Cheap.002'),
        'VI J1': dict(anchor='T26_15Jan-2026114VoltageIndicator_V3.002'),
        'VI J3': dict(anchor='T26_15Jan-2026114VoltageIndicator_V3.002'),
        'SPL AUX_VCC': dict(notes='Splice criado na migração (I-15): ACCU J1:g alimenta TSAL, Latch e IMD.'),
        'SPL AUX_GND': dict(notes='Splice criado na migração (I-15): ACCU J1:j é o GND de TSAL, Latch e IMD.'),
    }
    PARTS = [  # pn, fabricante, tipo, descrição, gama AWG, origem, confirmado
        ('RTS718N32S03', P('Amphenol'), 'receptáculo circular', 'Série RTS7, casco 18, 32 contactos (inserto 18-32), fêmea',
         '', 'nome da peça no modelo 3D', 'N'),
        ('HVSLS600022B1H6', '', 'conector HV', '2 pólos HV + interlock (HVIL)', '', 'nome da peça no modelo 3D', 'N'),
        ('43045-1628', 'Molex', 'header PCB', 'Micro-Fit 3.0, 16 vias, 2 filas', '', 'folha BMS do Excel original', 'Y'),
        ('43045-0228', 'Molex', 'header PCB', 'Micro-Fit 3.0, 2 vias', '', 'folha BMS do Excel original', 'Y'),
        ('43025-1600', 'Molex', 'ficha (housing)', 'Micro-Fit 3.0 receptáculo 16 vias — contraparte do 43045-1628', '',
         'proposta', 'N'),
        ('43025-0200', 'Molex', 'ficha (housing)', 'Micro-Fit 3.0 receptáculo 2 vias — contraparte do 43045-0228', '',
         'proposta', 'N'),
        ('43030-0001', 'Molex', 'crimp fêmea', 'Micro-Fit 3.0, estanhado', '20–24 AWG', 'proposta', 'N'),
    ]

    def ref_of(dev, conn, pin):
        c = conn.replace(' ', '').upper()
        if dev == 'ACCU':
            return 'ACCU J2' if c.startswith('ACCUJ2') else 'ACCU J1'
        if c.startswith('XLA'):
            return 'IMD XLA'
        if pin in ('A1', 'A2') and dev in ('AIR-', 'AIR+', 'PRE', 'ISA'):
            return f'{dev} HV'
        return f'{dev} {c}'


    ISSUES = [  # id, gravidade, onde, problema, opção A, opção B, aplicado neste ficheiro
        ('I-01', 'crítico', 'LATCH J1:5/6 ↔ ACCU J1:g/j',
         'A folha Latchboard liga +24V (pino 5) ao ACCU J1:j e GND (pino 6) ao ACCU J1:g. Na folha ACCU J1, g = AUX VCC e '
         'j = AUX GND. Feito pela folha Latchboard, a latchboard fica com a polaridade invertida.',
         'Folha ACCU J1: LATCH J1:5 ↔ g (AUX VCC), LATCH J1:6 ↔ j (AUX GND)',
         'Folha Latchboard: LATCH J1:5 ↔ j, LATCH J1:6 ↔ g',
         'A — as duas folhas concordam que 5 = +24V e g = AUX VCC; só a letra de destino na folha Latchboard está trocada.'),
        ('I-02', 'crítico', 'ACCU J1:D/E ↔ AMS J11:2/16',
         'Dis_SDC e Dis_Trigg trocados entre as folhas. Há ainda uma cópia solta "D | Dis_SDC | Out" nas colunas M–U da '
         'folha ACCU J1.',
         'Folha AMS (+ cópia solta): D = Dis_SDC ↔ AMS J11:2, E = Dis_Trigg ↔ AMS J11:16',
         'Folha ACCU J1: D = Dis_Trigg ↔ AMS J11:16, E = Dis_SDC ↔ AMS J11:2',
         'A — PROVISÓRIO. Confirmar no conector montado / esquema.'),
        ('I-03', 'crítico', 'ACCU J1:N/P (ventoinhas)',
         'A folha ACCU J1 manda as ventoinhas para AMS J12:5/6, que estão NC. A folha AMS e o pinout da placa (folha BMS: '
         'J11 pinos 5–8 = FAN_OUT) põem-nas no J11.',
         'AMS J11:5/6', 'AMS J12:5/6', 'A'),
        ('I-04', 'crítico', 'AMS J14 ↔ ISA X1 (CAN)',
         'A folha AMS liga CAN L → ISA X1:4 e CAN H → X1:3. A folha ISA diz X1:2 = CAN H, X1:3 = CAN L, X1:4 = +24V '
         '(e a própria folha AMS liga J11:12 +24V → X1:4). Como estava, o CAN L ia aos 24V.',
         'Folha ISA: AMS J14:1 (L) ↔ X1:3, AMS J14:2 (H) ↔ X1:2',
         'Folha AMS: J14:1 ↔ X1:4, J14:2 ↔ X1:3',
         'A — confirmar com o datasheet do sensor ISA.'),
        ('I-05', 'importante', 'AMS J10:15 → TSAL D2',
         'AMS J10:15 (AIR- Inten) aponta para TSAL D2:4, que é o AIR- Real. A TSAL D2:5 é AIR- Inten → J10:15.',
         'TSAL D2:5', 'TSAL D2:4', 'A'),
        ('I-06', 'importante', 'ACCU J2 interlock',
         'A folha ACCU J1 liga IL+/IL- a AMS J11:10/14 (são os pinos do AIR+ J1 — parece copiado do bloco AIR+). As folhas '
         'Latchboard (J1:9 → IL+) e ACCU J1 (B → IL-) dizem que o interlock está em série no SDC. A vossa nota na coluna L '
         'já levantava esta dúvida.',
         'LATCH J1:9 → ACCU J2:IL+ ; ACCU J2:IL- → ACCU J1:B (SDC passa pelo HVIL)',
         'ACCU J2:IL+ ↔ AMS J11:10 ; IL- ↔ AMS J11:14', 'A — labels de IL+/IL- mudados para Latch_SDC / ACC_SDC.'),
        ('I-07', 'crítico', 'AMS J12 vs pinout da placa',
         'Cablagem: J12:10 = AMS S, 11 = GND, 12 = +24V. Pinout da placa (folha BMS, 3.º header 43045-1628, "J?"): '
         '9 = 24V_PDM, 11 = AMS_ERROR, 12 = vazio, GND em 1/6/14. Se a placa estiver certa, o AMS fica sem alimentação e '
         'o AMS_ERROR fica ligado a GND.',
         'Manter a cablagem (folhas AMS/ACCU/Latch concordam entre si)', 'Seguir o pinout da placa',
         'Nada mudado — DECIDIR. Confirmar também que esse header é o J12.'),
        ('I-08', 'menor', 'ACCU J1:R/S/T/U ↔ AMS JUSB',
         'Na folha ACCU J1 o destino é só "AMS", sem conector nem pino. As cores do JUSB (VT/GN/VT/GN) parecem copiadas do '
         'CAN do carregador e o GND tem direção "High". O JUSB não tem P/N.',
         'Pinos da folha AMS: R ↔ JUSB:1, T ↔ 2, S ↔ 3, U ↔ 4', '', 'A — cores mantidas mas a confirmar.'),
        ('I-09', 'menor', 'AIR- J2', 'A linha AIR-_12V não tem número de pino.',
         'Pino 1 (igual a AIR+ J2 / PRE J2, e AMS J10:6 → AIR- J2:1)', '', 'A'),
        ('I-10', 'menor', 'ACCU J1:a/b, TSAL D2:7/11',
         'Descrições trocadas entre as duas pontas (TSAL LEDs vs Cockpit LED; Pre Real vs Pre Inten).',
         'Descrições da folha TSAL (a/b) e AMS (7/11)', 'Descrições da folha ACCU J1 / TSAL', 'A'),
        ('I-11', 'info', 'nomes',
         'Nomes normalizados: ASMS J11 → AMS J11; ACCUJ2 → ACCU J2; Latch/LatchBoard/Latchboard → LATCH J1; '
         'PreCharge → PRE; blocos J1/J2 da folha AUX → AIR-/AIR+/PRE/ISA; terminais A1/A2 → "<disp> HV"; '
         'XLA +/- → IMD XLA; "Interlock +" → IL+; Fuse 1/2 → pino OUT; ACCU Chassi → ACCU CHASSIS:GND.', '', '', 'aplicado'),
        ('I-12', 'info', 'cores',
         'Cores convertidas para IEC 60757: Blue/blue → BU, Brown/Broown → BN, prrpul → VT, White → WH, Yellow → YE, '
         'Orange → OG, red → RD, green → GN.', '', '', 'aplicado'),
        ('I-13', 'info', 'todos os fios',
         'Em falta no original: P/N do cabo, secção, comprimento, nome do fio e P/N da maior parte das fichas/crimps.',
         '', '', 'Secção 0,5 mm² proposta; wire_id gerado; comprimento pela topologia.'),
        ('I-14', 'importante', 'topologia RapidHarness',
         'Não estão no RapidHarness: VI J1, TSAL J1, IMD XLA, FUSE 1, FUSE 2, AIR- HV, ACCU CHASSIS, AMS JUSB e os splices '
         '— os fios HV de medida não têm rota nem comprimento.', 'Acrescentar ao RapidHarness e à folha Segments', '', ''),
        ('I-15', 'menor', 'ACCU J1:g e :j',
         'Cada um alimenta 3 placas (TSAL, Latch, IMD). Um contacto tamanho 20 não leva 3 fios → criados os splices '
         'SPL AUX_VCC e SPL AUX_GND.', 'Splice perto do BP5 (entre IMD e TSAL/Latch)', '', 'Splices criados; posição por definir.'),
        ('I-16', 'menor', 'FUSE 1 e AIR- HV:A2',
         'Cada um recebe 3 fios HV de medida (VI, IMD, TSAL).', 'Olhais no mesmo perno (type STUD)', 'Splice HV',
         'A (STUD) — confirmar.'),
        ('I-17', 'info', 'cores CAN',
         'O CAN PT L é azul, a mesma cor do SDC. Propostos pares entrançados (twist_group) para CAN e USB.', '', '',
         'twist_group proposto'),
    ]


    return dict(
        code=HARNESS, strict=True, auto_issues=False, csa_default=0.5,
        sheets={k.strip(): v for k, v in SHEETS}, priority=[p.strip() for p in PRIORITY],
        dest_alias=DEST_ALIAS, dest_default_pin=DEST_DEFAULT_PIN, studs=STUDS, pin_fix=PIN_FIX, drop=DROP,
        issue_pins=ISSUE_PINS, splice_net=SPLICE_NET, net_override=NET_OVERRIDE, segments=SEGMENTS,
        anchors=ANCHORS, known=KNOWN, parts=PARTS, issues=ISSUES, ref_of=ref_of,
        row_fix=lambda pin, label: '1' if not pin and label == 'AIR-_12V' else pin,  # I-09
    )
