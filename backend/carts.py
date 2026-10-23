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
            return "Resistências", {"valor (Ω)": short(value, ((1e6, "M"), (1e3, "k"), (1, ""))) if value else "0",
                                     "tamanho": size.lstrip("0"), "potência (W)": "-"}
    if "Capacit" in description and size:
        value = capacitance(mpn, description)
        if value:
            voltage = re.search(r"\b(\d+(?:\.\d+)?)\s*V(?:DC)?\b", description)
            return "Condensadores", {"capacidade": short(value, ((1e-6, "uF"), (1e-9, "nF"), (1e-12, "pF"))), "tipo": size,
                                     "encapsulamento": "cerâmico" if "MLCC" in description else "-",
                                     "Tensão": f"{voltage.group(1)}V" if voltage else "-"}
    return "", {}


# Categoria do catalogo pelas palavras da descricao (categorias da Mouser em PT/EN), pela ordem:
# a primeira regra que bate ganha, por isso "Transistor Output Optocouplers" fica em Optoacopladores.
# Usa o nome das categorias do stock quando existe; as restantes seguem os nomes da Mouser em portugues.
CATEGORY_RULES = (
    (r"optocoupler|optoacoplador", "Optoacopladores"),
    (r"conector|connector|header|housing|alojamento", "Conectores"),
    (r"\bleds?\b", "LEDs"),
    (r"diod|zener|\btvs\b|rectifier", "Díodos"),
    (r"mosfet|transist|\bbjt\b|^trans (pnp|npn)", "Transístores"),
    (r"inductor|choke|indutor", "Indutores"),
    (r"trimmer|potentiometer|potenci", "Potenciómetros"),
    (r"varist", "Varístores"),
    (r"thermistor|termistor", "Termístores"),
    (r"fuse|fusí", "Fusíveis"),
    (r"microcontroller|\bmcu\b", "Microcontroladores"),
    (r"can interface|ethernet|transceiver|rs-?485", "CI de comunicação e redes"),
    (r"logic|portas lógicas|\bgate\b", "CIs de Portas Lógicas"),
    (r"amplifier|op amp|comparator|comparador", "CIs Amplificadores"),
    (r"\badc\b|analog to digital|\bdac\b", "CIs de Conversão"),
    (r"dc/dc|dc-dc", "DCDC"),
    (r"regulator|switching controller|power management", "Reguladores de tensão"),
    (r"timer", "Temporizadores"),
    (r"sensor", "Sensores"),
    (r"\bfan\b|ventilador", "Ventoinhas"),
    (r"contator|contactor|chaves de controle|relay|relé", "Contactores e relés"),
    (r"transformer|transformador", "Transformadores"),
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
