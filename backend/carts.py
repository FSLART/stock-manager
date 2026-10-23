"""Le carrinhos exportados da Mouser/Avancee/DigiKey e transforma cada linha numa peca do catalogo.

As funcoes recebem linhas ja lidas (listas de celulas), por isso nao dependem do formato do ficheiro.
"""
import re
from datetime import date

# shortcut: taxa fixa para carrinhos em USD (DigiKey); trocar por uma taxa do dia se os precos forem usados para faturar.
USD_TO_EUR = 0.92
COLUMNS = {
    "mpn": ("Nº do fabricante", "Mfr. No", "Manufacturer Part Number"),
    "manufacturer": ("Fabricante", "Manufacturer"),
    "description": ("Descrição", "Description"),
    "price": ("Preço (EUR)", "Price (EUR)", "Unit Price"),
}
MONTHS = {"jan": 1, "fev": 2, "feb": 2, "mar": 3, "abr": 4, "apr": 4, "mai": 5, "may": 5, "jun": 6, "jul": 7,
          "ago": 8, "aug": 8, "set": 9, "sep": 9, "out": 10, "oct": 10, "nov": 11, "dez": 12, "dec": 12}
PACKAGES = ("0201", "0402", "0603", "0805", "1206", "1210", "1812", "2010", "2512", "3522")
# Series cujo tamanho nao aparece na descricao da Mouser.
SERIES = ((r"^ERJ-?(U|S)?0?3", "0603"), (r"^ERJ-?(U|S)?0?6", "0805"), (r"^ERJ-?8", "1206"), (r"^ERJ-?S1T", "2512"),
          (r"^RK73B1J", "0603"), (r"^RN73R2A", "0805"), (r"^RN73R1J", "0603"), (r"^35\d\d", "3522"), (r"^GRM188", "0603"),
          (r"^C1608", "0603"), (r"^KA[FM]15|^KGM15", "0603"), (r"^MAJCU168", "0603"), (r"^RCA0603", "0603"), (r"^RCA2512", "2512"))
UNITS = {"": 1, "r": 1, "k": 1e3, "m": 1e6, "p": 1e-12, "n": 1e-9, "u": 1e-6, "µ": 1e-6}
OHMS, FARADS = ((1e6, "M"), (1e3, "k"), (1, "")), ((1e-6, "uF"), (1e-9, "nF"), (1e-12, "pF"))


def money(value):
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).replace("€", "").replace("\xa0", "").strip().replace(".", "").replace(",", ".")
    return float(text) if text else None


def cart_date(rows):
    for row in rows[:12]:
        match = re.search(r"(\d{1,2})-([A-Za-z]{3})-(\d{2})\b", " ".join(str(cell) for cell in row))
        if match and match.group(2).lower() in MONTHS:
            return date(2000 + int(match.group(3)), MONTHS[match.group(2).lower()], int(match.group(1)))
    return None


def package(mpn, description):
    for size in PACKAGES:
        if re.search(rf"(?<!\d){size}(?!\d)", description) or re.search(rf"(?<!\d){size}", mpn):
            return size
    for pattern, size in SERIES:
        if re.search(pattern, mpn):
            return size
    match = re.search(r"CRCW (\d{3,4}) ", description)
    return match.group(1).zfill(4) if match else None


def resistance(mpn, description):
    match = (re.search(r"(\d+(?:\.\d+)?)\s*(k|K|M|m)?\s*(?:Ohms?|OHMS?|ohms?|OHM)\b", description)
             or re.search(r"\b(\d+(?:\.\d+)?)(K|M|R)\b", description))
    if match:
        return float(match.group(1)) * UNITS[(match.group(2) or "").lower()]
    match = re.search(r"\b(\d+)R(\d+)\b", description) or re.search(r"^RCA\d{4}(\d+)R(\d)", mpn)
    if match:
        return float(f"{match.group(1)}.{match.group(2)}")
    match = re.search(r"^RCA\d{4}(\d+)([KM])(\d)", mpn)   # RCA060310K0FKEC = 0603, 10K0
    return float(f"{match.group(1)}.{match.group(3)}") * UNITS[match.group(2).lower()] if match else None


def capacitance(mpn, description):
    match = re.search(r"(\d*\.?\d+)\s*([pnuµ])F\b", description)
    value = float(match.group(1)) * UNITS[match.group(2).lower()] if match else None
    # Codigo de 3 algarismos depois da tensao/dieletrico (1H104J, ZC474J); a Mouser as vezes troca a unidade (".1pF").
    code = re.search(r"(?:[A-Z]{2}|\d[A-Z])(\d{3})[JKMZ]", mpn)
    if code:
        from_code = int(code.group(1)[:2]) * 10 ** int(code.group(1)[2]) * 1e-12
        if value is None or abs(value / from_code - 1) > 0.01:
            value = from_code
    return value


def short(value, units):
    for factor, suffix in units:
        if value >= factor or factor == units[-1][0]:
            return f"{round(value / factor, 3):g}{suffix}"


def stock_fields(mpn, description):
    """Categoria e valores no formato que o stock ja usa ("4.7k" / "603", "100nF" / "0603")."""
    size = package(mpn, description)
    if "Resist" in description and "Trimmer" not in description and size:
        value = resistance(mpn, description)
        if value is not None:
            return "Resistências", {"Resistência (Ω)": short(value, OHMS) if value else "0", "Encapsulamento": size, "Potência (W)": "-"}
    if "Capacit" in description and size:
        value = capacitance(mpn, description)
        if value:
            voltage = re.search(r"\b(\d+(?:\.\d+)?)\s*V(?:DC)?\b", description)
            return "Condensadores", {"Capacidade": short(value, FARADS), "Encapsulamento": size,
                                     "Tipo": "cerâmico" if "MLCC" in description else "-", "Tensão (V)": voltage.group(1) if voltage else "-"}
    return "", {}


# Categoria do catalogo pelas palavras da descricao (categorias da Mouser em PT/EN), pela ordem:
# a primeira regra que bate ganha, por isso "Transistor Output Optocouplers" fica em Optoacopladores.
# Usa o nome das categorias do stock quando existe; as restantes seguem os nomes da Mouser em portugues.
CATEGORY_RULES = (
    (r"optocoupler|optoacoplador", "Optocouplers"),
    (r"crimp|connector contacts", "Crimps"),
    (r"conector|connector|header|housing|alojamento", "Conectores"),
    (r"\bleds?\b", "LEDs"),
    (r"\besd\b|\btvs\b|varist", "ESD"),
    (r"diod|zener|rectifier", "Díodos"),
    (r"mosfet|\bfets?\b", "Mosfets"),
    (r"transist|\bbjt\b|^trans (pnp|npn)", "Transístores"),
    (r"inductor|choke|indutor", "Indutores"),
    (r"trimmer|potentiometer|potenci", "Potenciómetros"),
    (r"thermistors? -|\bntc\b|\bptc\b|termístor", "Termístores"),
    (r"fuse|fusí", "Fusíveis"),
    (r"eeprom|\bmemory\b", "EEPROM"),
    (r"microcontroller|microprocessor|\bmcu\b|embedded", "Microprocessadores"),
    (r"crystal|cristal|oscillator", "Cristais"),
    (r"can interface|ethernet|transceiver|rs-?485", "CI de comunicação e redes"),
    (r"logic|portas lógicas|\bgate\b", "CIs de Portas Lógicas"),
    (r"amplifier|op amp|comparator|comparador", "CIs Amplificadores"),
    (r"\badc\b|analog to digital|\bdac\b", "CIs de Conversão"),
    (r"dc/dc|dc-dc", "DCDC"),
    (r"regulator|switching controller|power management", "LDO"),
    (r"timer", "Temporizadores"),
    (r"sensor", "Sensores"),
    (r"\bfan\b|ventilador", "Ventoinhas"),
    (r"contator|contactor|chaves de controle|relay|relé", "Relés e Contactores"),
    (r"transformer|transformador", "Transformador"),
    (r"ferrite", "Ferrites"),
    (r"\bswitch\b", "Interruptores"),
    (r"wire|cabo", "Cabos e fios"),
    (r"thermal", "Materiais térmicos"),
    (r"development board|raspberry", "Placas de Desenvolvimento"),
)


def catalog_category(description):
    text = description.lower()
    return next((category for pattern, category in CATEGORY_RULES if re.search(pattern, text)), "")


def parse_cart(rows, name):
    """Devolve as pecas de um carrinho. Precos em EUR; a DigiKey vem em USD e e convertida."""
    header_index = next(i for i, row in enumerate(rows) if {str(cell).strip() for cell in row} & set(COLUMNS["mpn"]))
    header = [str(cell).strip() for cell in rows[header_index]]
    column = {field: next((header.index(alias) for alias in aliases if alias in header), None) for field, aliases in COLUMNS.items()}
    usd = any("USD" in cell for cell in header)
    when = cart_date(rows)
    parts = []
    for row in rows[header_index + 1:]:
        get = lambda field: row[column[field]] if column[field] is not None and column[field] < len(row) else ""
        mpn = str(get("mpn") or "").strip()
        if not mpn:
            continue
        description, manufacturer = str(get("description") or "").strip(), str(get("manufacturer") or "").strip()
        price = money(get("price") or "")
        if price is not None and usd:
            price = round(price * USD_TO_EUR, 4)
        category, props = stock_fields(mpn, description)
        category = category or catalog_category(description)
        parts.append({
            "mpn": mpn, "manufacturer": manufacturer, "description": description, "category": category,
            "props": props,
            "price": price, "source": f"{name} {when.isoformat() if when else ''}".strip(),
        })
    return when, parts


# Propriedades de cada categoria do stock e os parametros da DigiKey que as preenchem (o primeiro que existir).
# Todas comecam por P/N, Fabricante e Encapsulamento (menos as de NO_PACKAGE). Sem parametros: preenche-se a mao.
# "@category" e a subcategoria da DigiKey (ex. "Ceramic Capacitors"), traduzida por KINDS.
PACKAGE = ("Supplier Device Package", "Package / Case", "Mounting Type")
NO_PACKAGE = {"Placas de Desenvolvimento", "Conectores", "Crimps"}
CATEGORY_FIELDS = {
    "Resistências": {"Resistência (Ω)": ("Resistance",), "Potência (W)": ("Power (Watts)",), "Tolerância": ("Tolerance",)},
    "Condensadores": {"Capacidade": ("Capacitance",), "Tensão (V)": ("Voltage - Rated",), "Dielétrico": ("Temperature Coefficient",), "Tipo": ("@category",)},
    "LEDs": {"Cor": ("Color",), "Tensão direta (V)": ("Voltage - Forward (Vf) (Typ)",)},
    "Díodos": {"Tipo": ("Technology", "@category"), "Tensão inversa (V)": ("Voltage - DC Reverse (Vr) (Max)", "Voltage - Zener (Nom) (Vz)"),
               "Corrente (A)": ("Current - Average Rectified (Io)", "Current - Average Rectified (Io) (per Diode)")},
    "Transístores": {"Tipo (NPN/PNP)": ("Transistor Type",), "Ic máx (A)": ("Current - Collector (Ic) (Max)",),
                     "Vce (V)": ("Voltage - Collector Emitter Breakdown (Max)",), "hFE": ("DC Current Gain (hFE) (Min) @ Ic, Vce",)},
    "Potenciómetros": {"Resistência (Ω)": ("Resistance",), "Tipo": ("Adjustment Type", "Type"), "Eixo": ("Actuator Type",)},
    "Indutores": {"Indutância (µH)": ("Inductance",), "Corrente (A)": ("Current Rating (Amps)",)},
    "Cristais": {"Frequência (MHz)": ("Frequency",)},
    "DCDC": {"Entrada (V)": ("Voltage - Input (Max)",), "Saída (V)": ("Voltage - Output 1",), "Corrente (A)": ("Current - Output (Max)",)},
    "CI de comunicação e redes": {"Tipo": ("Type",), "Protocolo": ("Protocol",)},
    "CIs de Portas Lógicas": {"Tipo de porta": ("Logic Type",), "Circuitos": ("Number of Circuits",)},
    "CIs Amplificadores": {"Tipo": ("Amplifier Type", "Type"), "Canais": ("Number of Circuits",)},
    "Placas de Desenvolvimento": {"MCU/CPU": ("Utilized IC / Part",)},
    "CIs de Conversão": {"Tipo": ("Architecture", "Type"), "Bits": ("Number of Bits",)},
    "ESD": {"Tensão (V)": ("Voltage - Reverse Standoff (Typ)", "Maximum DC Volts"), "Notas": ()},
    "LDO": {"Entrada (V)": ("Voltage - Input (Max)",), "Saída (V)": ("Voltage - Output (Min/Fixed)",), "Corrente (A)": ("Current - Output",)},
    "Sensores": {"Tipo": ("Sensor Type", "Type"), "Saída": ("Output Type", "Output")},
    "Relés e Contactores": {"Tipo": ("Relay Type",), "Tensão da bobina (V)": ("Coil Voltage",), "Contactos": ("Contact Form",),
                            "Corrente (A)": ("Contact Rating (Current)",)},
    "Optocouplers": {"Canais": ("Number of Channels",), "Tipo de saída": ("Output Type",), "Vf (V)": ("Voltage - Forward (Vf) (Typ)",),
                     "If (A)": ("Current - DC Forward (If) (Max)",)},
    "Mosfets": {"Tipo (N/P)": ("FET Type",), "Id (A)": ("Current - Continuous Drain (Id) @ 25°C",), "Vds (V)": ("Drain to Source Voltage (Vdss)",)},
    "Fusíveis": {"Corrente (A)": ("Current Rating (Amps)",), "Tensão (V)": ("Voltage Rating - DC", "Voltage Rating - AC"), "Resposta": ("Response Time",)},
    "EEPROM": {"Interface": ("Memory Interface",), "Memória": ("Memory Size",)},
    "Microprocessadores": {"Núcleo": ("Core Processor",), "Flash": ("Program Memory Size",), "RAM": ("RAM Size",)},
    "Conectores": {"Tipo": ("Connector Type",), "Posições": ("Number of Positions",), "Passo": ("Pitch - Mating",), "Género": ("Gender",)},
    "Crimps": {"AWG": ("Wire Gauge or Range - AWG",), "Género": ("Contact Type", "Gender")},
    "Transformador": {"Indutância (µH)": ("Inductance",), "Relação": ("Turns Ratio - Primary:Secondary",)},
}
KINDS = {"zener": "Zener", "schottky": "Schottky", "tvs": "TVS", "rectifier": "Retificador", "ceramic": "cerâmico",
         "electrolytic": "eletrolítico", "tantalum": "tântalo", "film": "filme"}
SI = {"p": 1e-12, "n": 1e-9, "u": 1e-6, "µ": 1e-6, "m": 1e-3, "": 1, "k": 1e3, "K": 1e3, "M": 1e6, "G": 1e9}


def category_props(category):
    """Lista de propriedades uniforme de uma categoria do stock (None se nao estiver no mapa)."""
    if category not in CATEGORY_FIELDS:
        return None
    return ["P/N", "Fabricante", *([] if category in NO_PACKAGE else ["Encapsulamento"]), *CATEGORY_FIELDS[category]]


def field_value(field, text):
    """Valor da DigiKey no formato do stock: numero na unidade do nome ("Corrente (A)": "600 mA" -> "0.6")."""
    text = re.sub(r"\s+@.*$", "", str(text)).strip()
    if field == "Encapsulamento":
        return re.sub(r"\s*\(.*\)$", "", text)
    if " ~ " in text:
        return "-".join(field_value(field, end) for end in text.split(" ~ ", 1))
    if field.startswith("Tipo (N"):
        return re.sub(r"-Channel$", "", text)
    unit = re.search(r"\((Ω|W|V|A|µH|MHz)\)$", field)
    unit = unit.group(1) if unit else "F" if field == "Capacidade" else None
    base = {"Ω": "(?:Ohms?|Ω)", "F": "F", "µH": "H", "MHz": "Hz"}.get(unit, unit)
    match = unit and re.match(rf"([\d.]+)\s*([pnuµmkKMG]?)\s*{base}", text)
    if not match:
        return text
    value = float(match.group(1)) * SI[match.group(2)]
    if unit == "Ω":
        return short(value, OHMS) if value else "0"
    if unit == "F":
        return short(value, FARADS)
    return f"{round(value / {'µH': 1e-6, 'MHz': 1e6}.get(unit, 1), 6):g}"


def digikey_props(category, parameters, category_path=""):
    """Propriedades da categoria do stock preenchidas com os parametros da DigiKey (so as que a DigiKey tem)."""
    fields = {**({} if category in NO_PACKAGE else {"Encapsulamento": PACKAGE}), **CATEGORY_FIELDS.get(category, {})}
    kind = next((name for word, name in KINDS.items() if word in category_path.lower()), category_path.split(" > ")[-1])
    props = {}
    for field, sources in fields.items():
        values = [kind if source == "@category" else parameters.get(source, "") for source in sources]
        value = next((value for value in values if value and value.strip() != "-"), "")
        if value:
            props[field] = field_value(field, value)
    return props
