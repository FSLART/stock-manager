"""Uniformiza as propriedades das categorias do stock com o mapa da DigiKey (CATEGORY_FIELDS em backend/carts.py).

1. Guarda uma copia (categorias, itens, catalogo) em data/backup-categorias-<data>.json.
2. Renomeia as propriedades de cada categoria (os valores mantem-se) e acrescenta as que faltam, vazias.
3. Faz o mesmo nas pecas do catalogo e passa as categorias do catalogo para os nomes do stock.
4. Com --digikey, procura o P/N de cada item na DigiKey e preenche so as propriedades vazias.
Uso: .venv/bin/python scripts/uniform_categories.py [--digikey] [--apply]   (sem --apply so mostra o que mudaria)
"""
import json
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend import app  # noqa: E402
from carts import category_props, digikey_props  # noqa: E402  (app.py ja pos backend/ no caminho)

# Propriedade nova <- propriedade antiga, por categoria. As novas sem origem comecam vazias.
RENAMES = {
    "Resistências": {"P/N": "P/N", "Encapsulamento": "tamanho", "Resistência (Ω)": "valor (Ω)", "Potência (W)": "potência (W)"},
    "Condensadores": {"P/N": "P/N", "Encapsulamento": "tipo", "Capacidade": "capacidade", "Tensão (V)": "Tensão", "Tipo": "encapsulamento"},
    "LEDs": {"P/N": "P/N", "Fabricante": "Brand", "Encapsulamento": "Footprint", "Cor": "cor", "Tensão direta (V)": "tensão direta (V)"},
    "Díodos": {"P/N": "P/N", "Fabricante": "Brand", "Encapsulamento": "Footprint", "Tipo": "tipo",
               "Tensão inversa (V)": "tensão inversa (V)", "Corrente (A)": "corrente (A)"},
    "Transístores": {"P/N": "referência", "Fabricante": "Brand", "Encapsulamento": "Footprint", "Tipo (NPN/PNP)": "FET type (NPN/PNP)",
                     "Ic máx (A)": "corrente máx (A)", "Vce (V)": "Vce (V)", "hFE": "ganho hFE"},
    "Potenciómetros": {"P/N": "P/N", "Fabricante": "Brand", "Resistência (Ω)": "valor (Ω)", "Tipo": "tipo", "Eixo": "eixo"},
    "Indutores": {"P/N": "P/N", "Fabricante": "Brand", "Encapsulamento": "Footprint", "Indutância (µH)": "valor (µH)", "Corrente (A)": "corrente (A)"},
    "Cristais": {"P/N": "P/N", "Fabricante": "Brand", "Encapsulamento": "Footprint", "Frequência (MHz)": "frequência (MHz)"},
    "DCDC": {"P/N": "P/N", "Fabricante": "Brand", "Entrada (V)": "Input", "Saída (V)": "Output", "Corrente (A)": "Current"},
    "CI de comunicação e redes": {"P/N": "P/N", "Fabricante": "Brand"},
    "CIs de Portas Lógicas": {"P/N": "P/N", "Fabricante": "Brand", "Encapsulamento": "Footprint", "Tipo de porta": "Gate Type"},
    "CIs Amplificadores": {"P/N": "P/N", "Fabricante": "Brand", "Encapsulamento": "Footprint", "Tipo": "Extra"},
    "Placas de Desenvolvimento": {"P/N": "P/N", "Fabricante": "Brand", "MCU/CPU": "MCU/CPU"},
    "CIs de Conversão": {"P/N": "P/N", "Fabricante": "Brand", "Encapsulamento": "Footprint", "Tipo": "Extra"},
    "ESD": {"P/N": "P/N", "Fabricante": "Brand", "Encapsulamento": "Footprint", "Notas": "Extra"},
    "LDO": {"P/N": "P/N", "Fabricante": "Brand", "Encapsulamento": "Footprint", "Entrada (V)": "Entrada (V)", "Saída (V)": "Saída (V)",
            "Corrente (A)": "corrente (A)"},
    "Sensores": {"P/N": "P/N", "Fabricante": "Brand", "Tipo": "Type", "Saída": "Output"},
    "Relés e Contactores": {"P/N": "S/N", "Fabricante": "Brand", "Encapsulamento": "Footprint", "Tipo": "Tipo de Contactor",
                            "Tensão da bobina (V)": "Coil Voltage", "Corrente (A)": "corrente (A)"},
    "Optocouplers": {"P/N": "S/N", "Fabricante": "Brand", "Encapsulamento": "Footprint", "Canais": "Nº Canais",
                     "Vf (V)": "DC Foward (V)", "If (A)": "DC Foward (I)"},
    "Mosfets": {"P/N": "P/N", "Fabricante": "Brand", "Encapsulamento": "Footprint", "Tipo (N/P)": "Tipo FET", "Id (A)": "Id (A)", "Vds (V)": "Vds (V)"},
    "Fusíveis": {"P/N": "P/N", "Fabricante": "Brand", "Encapsulamento": "Footprint", "Corrente (A)": "corrente (A)", "Tensão (V)": "Tensão (V)"},
    "EEPROM": {"P/N": "S/N", "Fabricante": "Brand", "Interface": "Interface", "Memória": "Memory"},
    "Microprocessadores": {"P/N": "P/N", "Fabricante": "Brand", "Encapsulamento": "Footprint", "Flash": "Flash", "RAM": "RAM"},
    "Conectores": {"P/N": "P/N", "Fabricante": "Brand", "Género": "Male or Female"},
    "Crimps": {"P/N": "P/N", "Fabricante": "Brand", "AWG": "AWG", "Género": "Male or Female"},
    "Transformador": {"P/N": "P/N", "Fabricante": "Brand", "Encapsulamento": "Footprint", "Indutância (µH)": "Inductance (µH)"},
}
# Categorias do catalogo (regras antigas) -> categoria do stock.
PART_CATEGORIES = {"Optoacopladores": "Optocouplers", "Contactores e relés": "Relés e Contactores", "Reguladores de tensão": "LDO",
                   "Microcontroladores": "Microprocessadores", "Transformadores": "Transformador", "Varístores": "ESD"}


def normalized(category, props):
    # Tamanhos SMD com 4 algarismos, como a DigiKey e os condensadores ("603" -> "0603").
    size = props.get("Encapsulamento", "")
    return {**props, "Encapsulamento": size.zfill(4)} if re.fullmatch(r"\d{3}", size) else props


def renamed(category, props):
    sources = RENAMES[category]
    return normalized(category, {field: props.get(sources.get(field), "") for field in category_props(category)})


def main(apply, use_digikey):
    categories = {category["name"]: category for category in app.db_categories()}
    items, parts = app.db_items(), app.db_parts()
    unknown = set(categories) - set(RENAMES)
    if unknown:
        sys.exit(f"Categorias sem mapa: {sorted(unknown)}")
    for name, sources in RENAMES.items():
        missing = set(sources.values()) - set(categories[name]["props"])
        dropped = [prop for prop in categories[name]["props"] if prop not in sources.values()
                   and any(item["props"].get(prop, "").strip() for item in items if item["cat"] == name)]
        if missing or dropped:
            sys.exit(f"{name}: origens que nao existem {sorted(missing)}, valores que se perderiam {dropped}")

    found = {}
    if use_digikey:
        numbers = sorted({item["props"].get(RENAMES[item["cat"]]["P/N"], "").strip() for item in items} - {"", "-"})
        for index, number in enumerate(numbers, 1):
            try:
                found[number] = app.digikey_lookup(number)
            except Exception as exc:  # um P/N com erro nao para a migracao
                print(f"  DigiKey {number}: {exc}")
            print(f"\r  DigiKey {index}/{len(numbers)}", end="", flush=True)
            time.sleep(0.6)  # limite da DigiKey: 120 pedidos por minuto
        print(f"\n  DigiKey encontrou {sum(1 for value in found.values() if value)} de {len(numbers)} P/N")
    catalog = {part["mpn"].upper(): part for part in parts}

    def filled(category, props):
        number = props.get("P/N", "").strip().upper()
        result, part = found.get(props.get("P/N", "").strip()), catalog.get(number)
        extra = {"Fabricante": (result or {}).get("manufacturer") or (part or {}).get("manufacturer", "")}
        if result:
            extra.update(digikey_props(category, result["parameters"], result["category"]))
        return {field: value if value.strip() else extra.get(field, "") for field, value in props.items()}

    if apply:
        backup = ROOT / "data" / f"backup-categorias-{datetime.now():%Y%m%d-%H%M%S}.json"
        backup.parent.mkdir(exist_ok=True)
        backup.write_text(json.dumps({"categories": list(categories.values()), "items": items, "parts": parts}, ensure_ascii=False, indent=1))
        print(f"Copia em {backup}")

    with app.EXCEL_LOCK, app.db_connection() as connection:
        # Rele os itens dentro da transacao, para nao desfazer alteracoes feitas entretanto no site.
        rows = connection.execute("SELECT items.id, items.props, categories.name AS cat FROM items JOIN categories ON categories.id = items.cat_id").fetchall()
        updates, keys, filled_count = [], set(), 0
        for row in rows:
            before = json.loads(row["props"])
            after = filled(row["cat"], renamed(row["cat"], before))
            filled_count += sum(1 for field, value in after.items() if value and not renamed(row["cat"], before).get(field))
            key = (row["cat"], "|".join(app.norm(value) for value in after.values()))
            if key in keys:
                sys.exit(f"O item {row['id']} ficaria igual a outro em {row['cat']}: {after}")
            keys.add(key)
            updates.append((json.dumps(after, ensure_ascii=False), key[1], row["id"]))
        for name in RENAMES:
            print(f"{name}: {categories[name]['props']} -> {category_props(name)}")
        print(f"{len(updates)} itens, {filled_count} propriedades preenchidas pela DigiKey/catálogo")
        part_updates = []
        for part in parts:
            category = PART_CATEGORIES.get(part["category"], part["category"])
            props = part["props"]
            if category in RENAMES:
                inverse = {old: new for new, old in RENAMES[category].items()}
                props = normalized(category, {inverse.get(key, key): value for key, value in props.items()})
            if (category, props) != (part["category"], part["props"]):
                part_updates.append({**part, "category": category, "props": props})
        print(f"{len(part_updates)} peças do catálogo atualizadas")
        if not apply:
            print("Nada gravado (usa --apply).")
            return
        for name in RENAMES:
            connection.execute("UPDATE categories SET props = ? WHERE name = ?", (json.dumps(category_props(name), ensure_ascii=False), name))
        # Chaves temporarias evitam colisoes de unicidade enquanto as chaves mudam.
        for _, _, item_id in updates:
            connection.execute("UPDATE items SET `key` = ? WHERE id = ?", (uuid4().hex, item_id))
        connection.executemany("UPDATE items SET props = ?, `key` = ? WHERE id = ?", updates)
    app.save_parts(part_updates)
    print("Gravado.")


if __name__ == "__main__":
    main("--apply" in sys.argv, "--digikey" in sys.argv)
