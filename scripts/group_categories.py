"""Arruma as categorias em familias ao estilo da DigiKey (Passivos › Resistências, Circuitos integrados › CIs Gestão de Energia › LDO).

1. Guarda uma copia das categorias em data/backup-categorias-<data>.json.
2. Cria as categorias-mae que faltam (so quando alguma filha existe).
3. Poe cada filha dentro da mae; so mexe nas que ainda estao no nivel de topo, para nao desfazer arrumacoes feitas a mao.
Uso: .venv/bin/python scripts/group_categories.py [--apply]   (sem --apply so mostra o que mudaria)
"""
import json
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend import app  # noqa: E402

ELETRONICA = app.SECTIONS[0]
# (secção, mãe, filhas). A ordem conta: uma mãe que é filha de outra aparece antes das suas filhas.
GROUPS = [
    (ELETRONICA, "Passivos", ["Resistências", "Condensadores", "Indutores", "Ferrites", "Potenciómetros", "Cristais", "Transformador"]),
    (ELETRONICA, "Semicondutores discretos", ["Díodos", "Transístores", "Mosfets"]),
    (ELETRONICA, "Optoeletrónica", ["LEDs", "Optocouplers"]),
    (ELETRONICA, "Circuitos integrados", ["CI de comunicação e redes", "CIs de Portas Lógicas", "CIs Amplificadores", "CIs de Conversão",
                                          "CIs Gestão de Energia", "Microprocessadores", "EEPROM", "Temporizadores"]),
    (ELETRONICA, "CIs Gestão de Energia", ["LDO", "DCDC"]),
    (ELETRONICA, "Proteção de circuitos", ["Fusíveis", "ESD"]),
    (ELETRONICA, "Sensores", ["Termístores"]),
    (ELETRONICA, "Eletromecânica", ["Relés e Contactores", "Interruptores"]),
    (ELETRONICA, "Gestão térmica", ["Ventoinhas", "Materiais térmicos"]),
    (ELETRONICA, "Desenvolvimento", ["Placas de Desenvolvimento", "Placa de Debugging"]),
    ("Harness", "Conectores", ["Crimps"]),
]
PARENT_PROPS = ["P/N", "Brand", "Footprint"]


def main(apply):
    app.init_db()
    with app.db_connection() as connection:
        rows = [dict(row) for row in connection.execute("SELECT id, name, section, parent_id FROM categories")]
        if apply:
            backup = ROOT / "data" / f"backup-categorias-{datetime.now():%Y%m%d-%H%M%S}.json"
            backup.write_text(json.dumps(rows, ensure_ascii=False, indent=1, default=str))
            print(f"Copia em {backup}")
        found = {row["name"].casefold(): row for row in rows}
        for section, parent, children in GROUPS:
            kids = [found[name.casefold()] for name in children
                    if name.casefold() in found and found[name.casefold()]["parent_id"] is None and found[name.casefold()]["section"] == section]
            if not kids:
                continue
            mother = found.get(parent.casefold())
            if mother is None:
                print(f"+ nova: {section} › {parent}")
                mother = {"id": None, "name": parent, "section": section, "parent_id": None}
                if apply:
                    mother["id"] = connection.execute("INSERT INTO categories (name, props, image_enabled, section) VALUES (?, ?, 1, ?)",
                                                      (parent, json.dumps(PARENT_PROPS), section)).lastrowid
                found[parent.casefold()] = mother
            elif mother["section"] != section:
                print(f"! {parent} está em {mother['section']}, salto")
                continue
            for kid in kids:
                print(f"  {mother['name']} › {kid['name']}")
                kid["parent_id"] = mother["id"] or "nova"
                if apply:
                    connection.execute("UPDATE categories SET parent_id = ? WHERE id = ?", (mother["id"], kid["id"]))
    print("Feito." if apply else "Nada mudou (corre com --apply).")


if __name__ == "__main__":
    main("--apply" in sys.argv)
