# O Excel e a base de dados nao guardam dicionarios Python diretamente.
# json transforma, por exemplo, {"valor": "10"} em texto para guardar
# e faz o caminho inverso quando os dados sao lidos.
import base64
import csv
import ipaddress
import json
import re
import secrets
import subprocess
import tempfile
from io import BytesIO
# Le configuracoes do sistema, como o caminho personalizado do Excel,
# e fornece funcoes para substituir ficheiros temporarios com seguranca.
import os
# SQLite e a base de dados local onde ficam categorias, componentes e quantidades.
import socket
import shutil
import sqlite3
import sys
# Permite executar o verificador do Excel sem bloquear os pedidos web.
import threading
# Faz a thread esperar alguns segundos entre duas verificacoes do Excel.
import time
# Permite criar funcoes que funcionam com o bloco "with".
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
# Representa caminhos de ficheiros de forma independente do sistema operativo.
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote, urlencode, urljoin, urlparse
import urllib.error
import urllib.request

# Flask recebe pedidos HTTP; jsonify responde em JSON, render_template entrega
# a pagina HTML e request permite ler os dados enviados pelo frontend.
from flask import Flask, g, jsonify, redirect, render_template, request, send_from_directory, session
# Workbook cria um livro vazio; load_workbook abre o ficheiro ja existente.
from openpyxl import Workbook, load_workbook
# Estas classes pertencem ao formato antigo que criava uma tabela Excel.
from openpyxl.worksheet.table import Table, TableStyleInfo
# Import mantido por compatibilidade com a versao anterior da escrita Excel.
from openpyxl.utils.cell import range_boundaries
from openpyxl.utils import get_column_letter
import gspread
from google.oauth2.service_account import Credentials
from uuid import uuid4
# PIN: from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.utils import secure_filename
from PIL import Image, ImageOps, UnidentifiedImageError
from dotenv import load_dotenv

# Este objeto regista as rotas e configura o servidor web da aplicacao.
app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 5 * 1024 * 1024
# Ficheiros de /static (imagens da pagina Inicio) ficam em cache uma semana no browser.
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = timedelta(days=7)
# Evita que o Flask reorganize alfabeticamente os campos enviados ao frontend.
app.json.sort_keys = False
# Permite construir caminhos relativos ao projeto, independentemente da pasta
# a partir da qual o comando para iniciar o servidor foi executado.
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR.parent / ".env", override=False, interpolate=False)
# carts.py esta ao lado: o import funciona com "flask --app backend/app.py" e com "gunicorn backend.app:app".
sys.path.insert(0, str(BASE_DIR))
from carts import USD_TO_EUR, catalog_category, digikey_props, stock_fields  # noqa: E402
from purchases import load_folder  # noqa: E402
# SQLite local por defeito; sincronizacao externa apenas por opcao explicita.
STORAGE_MODE = os.getenv("STORAGE_MODE", "local").strip().lower()
if STORAGE_MODE not in {"local", "excel", "google"}:
    raise ValueError("STORAGE_MODE deve ser local, excel ou google")
# Ficheiro SQLite principal. DB_PATH no ambiente permite usar outra base,
# por exemplo numa instalacao de testes sem tocar na base real.
DB_PATH = Path(os.getenv("DB_PATH", BASE_DIR.parent / "data" / "stock.db"))
DB_BACKEND = os.getenv("DB_BACKEND", "sqlite").strip().lower()
if DB_BACKEND not in {"sqlite", "mysql"}:
    raise ValueError("DB_BACKEND must be sqlite or mysql")
DB_INTEGRITY_ERRORS = (sqlite3.IntegrityError,)
if DB_BACKEND == "mysql":
    import pymysql
    DB_INTEGRITY_ERRORS += (pymysql.IntegrityError,)
    MYSQL_SETTINGS = {
        "host": os.getenv("MYSQL_HOST", "127.0.0.1"),
        "port": int(os.getenv("MYSQL_PORT", "3306")),
        "user": os.getenv("MYSQL_USER", ""),
        "password": os.getenv("MYSQL_PASSWORD", ""),
        "database": os.getenv("MYSQL_DATABASE", ""),
        "charset": "utf8mb4", "cursorclass": pymysql.cursors.DictCursor,
        "autocommit": False,
        # Preserve explicitly stored zero IDs when copying or rewriting inventory.
        "init_command": "SET SESSION sql_mode = CONCAT_WS(',', @@SESSION.sql_mode, 'NO_AUTO_VALUE_ON_ZERO')",
    }
    if os.getenv("MYSQL_SSL_CA"):
        MYSQL_SETTINGS["ssl"] = {"ca": os.environ["MYSQL_SSL_CA"], "check_hostname": True}


class MySQLConnection:
    """Keep the existing execute/fetch/iteration API for the app's SQL queries."""

    def __init__(self):
        if not all(MYSQL_SETTINGS[name] for name in ("database", "user", "password")):
            raise ValueError("Set MYSQL_DATABASE, MYSQL_USER and MYSQL_PASSWORD")
        self.connection = pymysql.connect(**MYSQL_SETTINGS)
        self.cursors = []

    def execute(self, sql, parameters=()):
        cursor = self.connection.cursor()
        self.cursors.append(cursor)
        # Only the app's fixed queries pass here; values remain bound parameters.
        cursor.execute(sql.replace("%", "%%").replace("?", "%s")
                       .replace(" COLLATE NOCASE", ""), parameters)
        return cursor

    def executemany(self, sql, parameters):
        cursor = self.connection.cursor()
        self.cursors.append(cursor)
        cursor.executemany(sql.replace("%", "%%").replace("?", "%s"), parameters)
        return cursor

    def commit(self):
        self.connection.commit()

    def rollback(self):
        self.connection.rollback()

    def close(self):
        for cursor in self.cursors:
            cursor.close()
        self.connection.close()


def init_mysql_schema(connection):
    # MySQL 8 / MariaDB 10.11: hash the full key instead of truncating a TEXT index.
    mariadb = "MariaDB" in connection.execute("SELECT VERSION() AS version").fetchone()["version"]
    for sql in (
        """CREATE TABLE IF NOT EXISTS categories (
            id BIGINT PRIMARY KEY AUTO_INCREMENT,
            name VARCHAR(255) COLLATE utf8mb4_0900_as_ci UNIQUE NOT NULL,
            props LONGTEXT NOT NULL,
            image_enabled INTEGER NOT NULL DEFAULT 0,
            section VARCHAR(64) NOT NULL DEFAULT 'Componentes eletrónicos',
            parent_id BIGINT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin""",
        """CREATE TABLE IF NOT EXISTS items (
            id BIGINT PRIMARY KEY AUTO_INCREMENT,
            cat_id BIGINT NOT NULL,
            props LONGTEXT NOT NULL,
            `key` LONGTEXT NOT NULL,
            key_hash BINARY(32) GENERATED ALWAYS AS (UNHEX(SHA2(`key`, 256))) STORED,
            qty BIGINT NOT NULL DEFAULT 0,
            image LONGTEXT NOT NULL,
            location VARCHAR(255) NOT NULL DEFAULT '',
            UNIQUE (cat_id, key_hash),
            FOREIGN KEY (cat_id) REFERENCES categories(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin""",
        """CREATE TABLE IF NOT EXISTS meta (
            `key` VARCHAR(255) PRIMARY KEY,
            value LONGTEXT NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin""",
        """CREATE TABLE IF NOT EXISTS people (
            id BIGINT PRIMARY KEY AUTO_INCREMENT,
            name VARCHAR(255) COLLATE utf8mb4_0900_as_ci UNIQUE NOT NULL,
            pin_hash VARCHAR(255) NOT NULL DEFAULT '',
            notion_id VARCHAR(64) UNIQUE NULL,
            is_admin INTEGER NOT NULL DEFAULT 0,
            avatar VARCHAR(1000) NOT NULL DEFAULT '',
            role VARCHAR(64) NOT NULL DEFAULT 'Member',
            department VARCHAR(255) NOT NULL DEFAULT '',
            notion_sync INTEGER NOT NULL DEFAULT 1
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin""",
        """CREATE TABLE IF NOT EXISTS movements (
            id BIGINT PRIMARY KEY AUTO_INCREMENT,
            ts VARCHAR(32) NOT NULL,
            person_id BIGINT NULL,
            person VARCHAR(255) NOT NULL,
            type VARCHAR(16) NOT NULL,
            item_id BIGINT NULL,
            cat VARCHAR(255) NOT NULL,
            props LONGTEXT NOT NULL,
            delta BIGINT NOT NULL,
            before_qty BIGINT NOT NULL,
            after_qty BIGINT NOT NULL,
            note VARCHAR(255) NOT NULL DEFAULT '',
            reverts BIGINT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin""",
        # Catalogo de pecas (carrinhos Mouser/DigiKey), separado do stock: preenche o formulario e da o preco.
        """CREATE TABLE IF NOT EXISTS parts (
            mpn VARCHAR(255) COLLATE utf8mb4_0900_as_ci PRIMARY KEY,
            manufacturer VARCHAR(255) NOT NULL DEFAULT '',
            description TEXT NOT NULL,
            category VARCHAR(255) NOT NULL DEFAULT '',
            props LONGTEXT NOT NULL,
            price DOUBLE NULL,
            source VARCHAR(255) NOT NULL DEFAULT '',
            datasheet VARCHAR(1000) NOT NULL DEFAULT ''
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin""",
        # Foto de cada caixa/gaveta; o nome e o mesmo texto guardado em items.location.
        """CREATE TABLE IF NOT EXISTS locations (
            name VARCHAR(255) PRIMARY KEY,
            image VARCHAR(1000) NOT NULL DEFAULT '',
            code VARCHAR(16) NOT NULL DEFAULT ''
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin""",
        # Etiquetas da pagina Etiquetas, partilhadas pela equipa; data e o JSON validado por label_from_json.
        """CREATE TABLE IF NOT EXISTS labels (
            id BIGINT PRIMARY KEY AUTO_INCREMENT,
            data LONGTEXT NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin""",
        # Projetos da pagina PCB e os seus BOMs, partilhados pela equipa; o id vem do browser (UUID).
        """CREATE TABLE IF NOT EXISTS pcb_projects (
            id VARCHAR(64) PRIMARY KEY,
            data LONGTEXT NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin""",
        # Compras e encomendas lidas de data/compras (pagina Batches); data e o JSON de purchases.parse_sheet.
        """CREATE TABLE IF NOT EXISTS purchases (
            id BIGINT PRIMARY KEY AUTO_INCREMENT,
            data LONGTEXT NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin""",
    ):
        if mariadb:
            sql = sql.replace("utf8mb4_0900_as_ci", "utf8mb4_uca1400_as_ci").replace("utf8mb4_0900_bin", "utf8mb4_bin")
        connection.execute(sql)
    # Bases criadas antes da foto do Notion: acrescenta a coluna uma vez.
    if not connection.execute("SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'people' AND COLUMN_NAME = 'avatar'").fetchone():
        connection.execute("ALTER TABLE people ADD COLUMN avatar VARCHAR(1000) NOT NULL DEFAULT ''")
    if not connection.execute("SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'people' AND COLUMN_NAME = 'role'").fetchone():
        connection.execute("ALTER TABLE people ADD COLUMN role VARCHAR(64) NOT NULL DEFAULT 'Member'")
        connection.execute("ALTER TABLE people ADD COLUMN department VARCHAR(255) NOT NULL DEFAULT ''")
    if not connection.execute("SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'people' AND COLUMN_NAME = 'notion_sync'").fetchone():
        connection.execute("ALTER TABLE people MODIFY department VARCHAR(255) NOT NULL DEFAULT ''")
        connection.execute("ALTER TABLE people ADD COLUMN notion_sync INTEGER NOT NULL DEFAULT 1")
    if not connection.execute("SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'items' AND COLUMN_NAME = 'location'").fetchone():
        connection.execute("ALTER TABLE items ADD COLUMN location VARCHAR(255) NOT NULL DEFAULT ''")
    if not connection.execute("SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'categories' AND COLUMN_NAME = 'section'").fetchone():
        connection.execute("ALTER TABLE categories ADD COLUMN section VARCHAR(64) NOT NULL DEFAULT 'Componentes eletrónicos'")
        split_sections(connection)
    if not connection.execute("SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'categories' AND COLUMN_NAME = 'parent_id'").fetchone():
        connection.execute("ALTER TABLE categories ADD COLUMN parent_id BIGINT NULL")
    if not connection.execute("SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'parts' AND COLUMN_NAME = 'datasheet'").fetchone():
        connection.execute("ALTER TABLE parts ADD COLUMN datasheet VARCHAR(1000) NOT NULL DEFAULT ''")
    if not connection.execute("SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'locations' AND COLUMN_NAME = 'code'").fetchone():
        connection.execute("ALTER TABLE locations ADD COLUMN code VARCHAR(16) NOT NULL DEFAULT ''")
    if not connection.execute("SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'movements' AND COLUMN_NAME = 'note'").fetchone():
        connection.execute("ALTER TABLE movements ADD COLUMN note VARCHAR(255) NOT NULL DEFAULT ''")
        connection.execute("ALTER TABLE movements ADD COLUMN reverts BIGINT NULL")

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", BASE_DIR / "uploads"))
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "").strip().rstrip("/")
# Sessao por cookie assinado. Sem SECRET_KEY no .env as sessoes perdem-se a cada reinicio.
app.secret_key = os.getenv("SECRET_KEY") or os.urandom(32)
app.config.update(
    PERMANENT_SESSION_LIFETIME=timedelta(days=30),
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=PUBLIC_BASE_URL.startswith("https://"),
)
# Login com Notion so fica disponivel quando a integracao esta configurada no .env.
NOTION_CLIENT_ID = os.getenv("NOTION_CLIENT_ID", "").strip()
NOTION_CLIENT_SECRET = os.getenv("NOTION_CLIENT_SECRET", "").strip()
# Quem entra com Notion por este workspace e ainda nao esta na lista e adicionado automaticamente.
NOTION_WORKSPACE_ID = os.getenv("NOTION_WORKSPACE_ID", "").strip().replace("-", "").lower()
# Cargo e departamento sao atribuidos por um admin, nunca pelo nome editavel do perfil Notion.
# PIN: PIN_RE = re.compile(r"[A-Za-z0-9]{4}")
# PIN: shortcut: tentativas falhadas em memoria, so valem com 1 worker; passar para a BD se houver mais.
# PIN: LOGIN_ATTEMPTS = {}
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
NORMALIZED_IMAGE_SIZE = (800, 800)
MAX_IMAGE_DOWNLOAD = 10 * 1024 * 1024
MAX_STEP_SIZE = 40 * 1024 * 1024
# Ficheiro sincronizado com a base de dados. EXCEL_PATH no ambiente permite
# escolher outro livro sem alterar o codigo.
EXCEL_PATH = Path(os.getenv("EXCEL_PATH", BASE_DIR / "Stock_sala.xlsx"))
# Configuracao principal do Google Sheets; o Excel continua disponivel como fallback.
GOOGLE_SHEET_ID = os.getenv(
    "GOOGLE_SHEET_ID",
    "1dWmr7VUUz6z15ZCDjgjLnDV5nMwh8FQYtp1BOOjx6Go",
).strip()
GOOGLE_CREDENTIALS = str(os.getenv(
    "GOOGLE_CREDENTIALS",
    BASE_DIR / "stocklart-c5ed300114c4.json",
)).strip()
GOOGLE_SHEET_NAME = os.getenv("GOOGLE_SHEET_NAME", "Folha1").strip() or "Folha1"
GOOGLE_SPREADSHEET = None
GOOGLE_ITEMS_CACHE = None
GOOGLE_ITEMS_CACHE_TIME = 0
GOOGLE_ITEMS_CACHE_TTL = 10
IMAGE_FORMULA_RE = re.compile(r'^=IMAGE\("([^\"]+)"(?:[;,]4[;,]\d+[;,]\d+)?\)$', re.IGNORECASE)
# Nome usado pelo formato antigo de folha unica. As folhas atuais usam o nome
# da categoria, mas esta variavel permite continuar a ler o formato antigo.
EXCEL_SHEET = os.getenv("EXCEL_SHEET", "Stock")
# Nome tecnico da tabela Excel usada apenas pela funcao de compatibilidade.
EXCEL_TABLE = "StockTable"
# Depois de uma alteracao externa, o worker pode demorar no maximo este tempo
# a deteta-la; as leituras HTTP tambem fazem uma verificacao imediata.
EXCEL_SYNC_INTERVAL = 5 #tempo de sinc do sv
# RLock protege operacoes que podem ocorrer ao mesmo tempo: pedidos Flask,
# worker automatico e escrita do Excel. RLock permite reentrar na mesma thread.
EXCEL_LOCK = threading.RLock()
# Cabecalhos necessarios para reconhecer e ler o formato antigo do Excel.
HEADERS = ["id", "categoria", "propriedades", "quantidade"]
# O Excel limita o nome de uma folha a 31 caracteres e nao aceita estes simbolos.
CATEGORY_SHEET_MAX_LENGTH = 31
CATEGORY_SHEET_INVALID_CHARS = set('[]:*?/\\')
# Larguras para tornar o livro legivel; propriedades sem largura especifica
# recebem o valor 22 mais abaixo.
EXCEL_COLUMN_WIDTHS = {
    "id": 10,
    "categoria": 20,
    "quantidade": 14,
}
# Dados iniciais usados apenas na primeira criacao da base de dados.
# Cada chave e uma categoria e cada lista define os campos que o frontend deve
# pedir para um componente dessa categoria.
SECTIONS = ("Componentes eletrónicos", "Harness", "Não consumíveis")
# Departamentos da LART como estao na base Members Filtered do Notion (Board e Leaders dao o cargo).
ROLES = ("Board", "Department Leader", "Member")
DEPARTMENTS = ("Aerodynamics", "Autonomous Driving", "Chassis and Structures", "Communication and Logistics", "Dynamics", "Electronics", "Powertrain")
CATEGORIAS_INICIAIS = {
    "Resistências": ["valor (Ω)", "tolerância (%)", "potência (W)", "encapsulamento"],
    "Condensadores": ["capacidade (µF)", "tensão (V)", "tipo", "encapsulamento"],
    "LEDs": ["cor", "tamanho (mm)", "tensão direta (V)"],
    "Díodos": ["referência", "tipo", "tensão inversa (V)", "corrente (A)"],
    "Transístores": ["referência", "tipo (NPN/PNP)", "ganho hFE", "corrente máx (A)"],
    "Potenciómetros": ["valor (Ω)", "tipo", "eixo"],
    "Indutores": ["valor (µH)", "corrente (A)"],
    "Cristais": ["frequência (MHz)"],
}


def current_person():
    # Pessoa da sessao atual, ou None; tambem invalida sessoes de pessoas apagadas.
    person_id = session.get("person_id")
    if person_id is None:
        return None
    init_db()
    with db_connection() as connection:
        row = connection.execute("SELECT id, name, is_admin, notion_id, avatar, role, department FROM people WHERE id = ?", (person_id,)).fetchone()
    return {"id": row["id"], "name": row["name"], "admin": bool(row["is_admin"]), "notion": bool(row["notion_id"]), "avatar": row["avatar"],
            "role": row["role"], "department": row["department"]} if row else None


def electronics_denied():
    # Todo o stock (eletronico, Harness e nao consumiveis) e do departamento de Electronics; um admin tambem o altera.
    if g.person["admin"] or "Electronics" in g.person.get("department", "").split(", "):
        return None
    return erro("Só o departamento de Electronics pode alterar o stock", 403)


def start_session(person_id):
    session.clear()
    session.permanent = True
    session["person_id"] = person_id


@app.before_request
def require_login():
    # Ver stock e publico; qualquer escrita na API exige uma pessoa com sessao.
    # Registado antes do lock para um 401 nunca ficar a espera de outra escrita.
    if request.method not in {"POST", "PATCH", "DELETE"} or not request.path.startswith("/api/") or request.path.startswith("/api/auth/"):
        return None
    g.person = current_person()
    if g.person is None:
        return jsonify(error="Inicia sessão para alterar o stock", login=True), 401
    return None


def record_movements(connection, movements):
    # Historico central (quem, quando, quanto), gravado na mesma transacao da alteracao.
    if not movements:
        return
    ts = datetime.now(timezone.utc).isoformat(timespec="seconds")
    connection.executemany(
        "INSERT INTO movements (ts, person_id, person, type, item_id, cat, props, delta, before_qty, after_qty, note, reverts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [(ts, g.person["id"], g.person["name"], m["type"], m.get("item_id"), m["cat"],
          json.dumps(m["props"], ensure_ascii=False), m["delta"], m["before"], m["before"] + m["delta"], m.get("note", ""), m.get("reverts"))
         for m in movements],
    )


@app.before_request
def lock_local_stock_write():
    # Protect the full read/modify/save sequence, including existing stock routes.
    # ponytail: per-process lock; multi-worker deployments need database-level writes.
    if STORAGE_MODE == "local" and request.method in {"POST", "PATCH", "DELETE"} and request.path.startswith("/api/"):
        EXCEL_LOCK.acquire()
        g.stock_write_locked = True


@app.teardown_request
def unlock_local_stock_write(_error):
    if getattr(g, "stock_write_locked", False):
        g.stock_write_locked = False
        EXCEL_LOCK.release()


def norm(value):
    # Converte qualquer valor para texto, remove espacos e passa para minusculas.
    # Assim, "  10 Ohm " e "10ohm" podem ser comparados como a mesma chave.
    return "".join(str(value).lower().split())


def erro(msg, codigo=400):
    # Centraliza o formato das respostas de erro: mensagem legivel no campo
    # error e codigo HTTP que informa ao frontend que o pedido falhou.
    return jsonify(error=msg), codigo


@contextmanager
def db_connection():
    # Abre a base configurada e transforma a funcao num gestor de contexto.
    # Ao sair do bloco with, confirma alteracoes ou desfaz tudo se houver erro.
    connection = MySQLConnection() if DB_BACKEND == "mysql" else sqlite3.connect(DB_PATH)
    # Sem isto, as linhas seriam tuplos e teriamos de usar indices numericos.
    # Com isto, row["name"] e mais claro e menos sujeito a erros.
    if DB_BACKEND == "sqlite":
        connection.row_factory = sqlite3.Row
        # Ativa as chaves estrangeiras conforme definido no esquema SQLite.
        connection.execute("PRAGMA foreign_keys = ON")
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def init_db(seed=True):
    # Prepara a base de dados antes de qualquer leitura ou escrita.
    # Pode ser chamada muitas vezes porque CREATE TABLE IF NOT EXISTS nao
    # recria tabelas que ja existem.
    if DB_BACKEND == "sqlite":
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with db_connection() as connection:
        if DB_BACKEND == "mysql":
            init_mysql_schema(connection)
        else:
            init_sqlite_schema(connection)
        # Revoga atribuicoes antigas por nome, inclusive para sessoes ja abertas.
        # notion_sync=0 identifica permissoes revistas explicitamente por um admin.
        connection.execute("UPDATE people SET role = 'Member', department = '' WHERE notion_sync = 1 AND (role <> 'Member' OR department <> '')")
        if not seed:
            return
        seed_categories(connection)


def init_sqlite_schema(connection):
    # categories define os tipos de componentes e as suas propriedades.
    # items guarda cada referencia concreta, ligada a uma categoria por cat_id.
    # meta guarda estados internos, como "os valores padrao ja foram inseridos".
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY,
            name TEXT UNIQUE NOT NULL COLLATE NOCASE,
            props TEXT NOT NULL,
            image_enabled INTEGER NOT NULL DEFAULT 0,
            section TEXT NOT NULL DEFAULT 'Componentes eletrónicos',
            -- Subcategorias: sem FK porque apagar a mãe passa as filhas para o nível de cima.
            parent_id INTEGER
        );
        CREATE TABLE IF NOT EXISTS items (
            id INTEGER PRIMARY KEY,
            cat_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
            props TEXT NOT NULL,
            key TEXT NOT NULL,
            qty INTEGER NOT NULL DEFAULT 0,
            image TEXT NOT NULL DEFAULT '',
            location TEXT NOT NULL DEFAULT '',
            UNIQUE (cat_id, key)
        );
        CREATE TABLE IF NOT EXISTS meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS people (
            id INTEGER PRIMARY KEY,
            name TEXT UNIQUE NOT NULL COLLATE NOCASE,
            pin_hash TEXT NOT NULL DEFAULT '',
            notion_id TEXT UNIQUE,
            is_admin INTEGER NOT NULL DEFAULT 0,
            avatar TEXT NOT NULL DEFAULT '',
            role TEXT NOT NULL DEFAULT 'Member',
            department TEXT NOT NULL DEFAULT '',
            notion_sync INTEGER NOT NULL DEFAULT 1
        );
        -- Sem FK para items: save_items reescreve a tabela items a cada escrita.
        CREATE TABLE IF NOT EXISTS movements (
            id INTEGER PRIMARY KEY,
            ts TEXT NOT NULL,
            person_id INTEGER,
            person TEXT NOT NULL,
            type TEXT NOT NULL,
            item_id INTEGER,
            cat TEXT NOT NULL,
            props TEXT NOT NULL,
            delta INTEGER NOT NULL,
            before_qty INTEGER NOT NULL,
            after_qty INTEGER NOT NULL,
            note TEXT NOT NULL DEFAULT '',
            reverts INTEGER
        );
        CREATE TABLE IF NOT EXISTS parts (
            mpn TEXT PRIMARY KEY COLLATE NOCASE,
            manufacturer TEXT NOT NULL DEFAULT '',
            description TEXT NOT NULL DEFAULT '',
            category TEXT NOT NULL DEFAULT '',
            props TEXT NOT NULL DEFAULT '{}',
            price REAL,
            source TEXT NOT NULL DEFAULT '',
            datasheet TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS locations (
            name TEXT PRIMARY KEY,
            image TEXT NOT NULL DEFAULT '',
            code TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS labels (
            id INTEGER PRIMARY KEY,
            data TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS pcb_projects (
            id TEXT PRIMARY KEY,
            data TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS purchases (
            id INTEGER PRIMARY KEY,
            data TEXT NOT NULL
        );
        """
    )
    category_columns = {
        row["name"] for row in connection.execute("PRAGMA table_info(categories)")
    }
    if "image_enabled" not in category_columns:
        connection.execute(
            "ALTER TABLE categories ADD COLUMN image_enabled INTEGER NOT NULL DEFAULT 0"
        )
    if "section" not in category_columns:
        connection.execute("ALTER TABLE categories ADD COLUMN section TEXT NOT NULL DEFAULT 'Componentes eletrónicos'")
        split_sections(connection)
    if "parent_id" not in category_columns:
        connection.execute("ALTER TABLE categories ADD COLUMN parent_id INTEGER")
    item_columns = {
        row["name"] for row in connection.execute("PRAGMA table_info(items)")
    }
    if "image" not in item_columns:
        connection.execute("ALTER TABLE items ADD COLUMN image TEXT NOT NULL DEFAULT ''")
    if "location" not in item_columns:
        connection.execute("ALTER TABLE items ADD COLUMN location TEXT NOT NULL DEFAULT ''")
    if "avatar" not in {row["name"] for row in connection.execute("PRAGMA table_info(people)")}:
        connection.execute("ALTER TABLE people ADD COLUMN avatar TEXT NOT NULL DEFAULT ''")
    if "role" not in {row["name"] for row in connection.execute("PRAGMA table_info(people)")}:
        connection.execute("ALTER TABLE people ADD COLUMN role TEXT NOT NULL DEFAULT 'Member'")
        connection.execute("ALTER TABLE people ADD COLUMN department TEXT NOT NULL DEFAULT ''")
    if "notion_sync" not in {row["name"] for row in connection.execute("PRAGMA table_info(people)")}:
        connection.execute("ALTER TABLE people ADD COLUMN notion_sync INTEGER NOT NULL DEFAULT 1")
    if "datasheet" not in {row["name"] for row in connection.execute("PRAGMA table_info(parts)")}:
        connection.execute("ALTER TABLE parts ADD COLUMN datasheet TEXT NOT NULL DEFAULT ''")
    if "code" not in {row["name"] for row in connection.execute("PRAGMA table_info(locations)")}:
        connection.execute("ALTER TABLE locations ADD COLUMN code TEXT NOT NULL DEFAULT ''")
    if "note" not in {row["name"] for row in connection.execute("PRAGMA table_info(movements)")}:
        connection.execute("ALTER TABLE movements ADD COLUMN note TEXT NOT NULL DEFAULT ''")
        connection.execute("ALTER TABLE movements ADD COLUMN reverts INTEGER")


def split_sections(connection):
    # Corre uma vez, quando a coluna section aparece: crimps e conectores passam para Harness,
    # e Harness e Não consumíveis recebem uma categoria inicial cada para não ficarem vazias.
    connection.execute("UPDATE categories SET section = 'Harness' WHERE LOWER(name) IN ('crimps', 'conectores')")
    existing = {row["name"].casefold() for row in connection.execute("SELECT name FROM categories")}
    for name, props, section in (
        ("Cabos", ["P/N", "Fabricante", "AWG", "Cor", "Tipo"], "Harness"),
        ("Ferramentas e equipamentos", ["Tipo", "Fabricante", "Modelo"], "Não consumíveis"),
    ):
        if name.casefold() not in existing:
            connection.execute("INSERT INTO categories (name, props, image_enabled, section) VALUES (?, ?, 1, ?)",
                               (name, json.dumps(props, ensure_ascii=False), section))


def seed_categories(connection):
    # As categorias padrao sao inseridas apenas uma vez. Isto preenche uma
    # base nova sem voltar a recriar uma categoria que o utilizador apagou.
    ja_semeado = connection.execute(
        "SELECT 1 FROM meta WHERE `key` = 'defaults_seeded'"
    ).fetchone()
    if ja_semeado is None:
        # casefold permite comparar nomes sem distinguir maiusculas/minusculas,
        # evitando criar, por exemplo, "LEDs" e "leds" como duas categorias.
        existentes = {
            row["name"].casefold()
            for row in connection.execute("SELECT name FROM categories")
        }
        em_falta = [
            (name, json.dumps(props, ensure_ascii=False))
            for name, props in CATEGORIAS_INICIAIS.items()
            if name.casefold() not in existentes
        ]
        if em_falta:
            # Guarda as propriedades como JSON porque a coluna props e TEXT.
            connection.executemany(
                "INSERT INTO categories (name, props) VALUES (?, ?)",
                em_falta,
            )
        connection.execute(
            # Na proxima chamada, este registo impede novo preenchimento automatico.
            "INSERT INTO meta (`key`, value) VALUES ('defaults_seeded', '1')"
        )


def db_items():
    # Consulta os componentes e substitui o cat_id interno pelo nome legivel
    # da categoria, que e o formato esperado pelo frontend e pelo Excel.
    init_db()
    with db_connection() as connection:
        rows = connection.execute(
            """
            SELECT items.id, categories.name AS category, items.props, items.qty, items.image, items.location
            FROM items
            JOIN categories ON categories.id = items.cat_id
            ORDER BY items.id
            """
        ).fetchall()
    return [
        # Cada linha e convertida num dicionario; props volta de texto JSON
        # para dicionario Python antes de ser enviado para a aplicacao.
        {
            "id": row["id"],
            "cat": row["category"],
            "props": json.loads(row["props"]),
            "qty": row["qty"],
            "image": image_path(row["image"]),
            "location": row["location"],
        }
        for row in rows
    ]


def db_categories():
    # Devolve a configuracao das categorias para o frontend construir os formularios.
    # A lista props diz quais os campos que o utilizador deve preencher.
    init_db()
    with db_connection() as connection:
        rows = connection.execute(
            "SELECT id, name, props, image_enabled, section, parent_id FROM categories ORDER BY id"
        ).fetchall()
    names = {row["id"]: row["name"] for row in rows}
    return [
        {
            "name": row["name"],
            "props": json.loads(row["props"]),
            "image": bool(row["image_enabled"]),
            "section": row["section"],
            "parent": names.get(row["parent_id"]),
        }
        for row in rows
    ]


def db_parts():
    init_db()
    with db_connection() as connection:
        rows = connection.execute("SELECT * FROM parts ORDER BY mpn").fetchall()
    return [{**dict(row), "props": json.loads(row["props"])} for row in rows]


# Sem 0/O nem 1/I, para o codigo se ler bem na etiqueta.
LOCATION_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def db_locations():
    # Cada caixa tem um codigo fixo para o QR: muda-se o nome e as etiquetas ja coladas continuam a funcionar.
    # As caixas que so existem em items.location ganham aqui a sua linha e o seu codigo.
    init_db()
    with EXCEL_LOCK, db_connection() as connection:
        rows = {row["name"]: dict(row) for row in connection.execute("SELECT name, image, code FROM locations")}
        taken = {row["code"] for row in rows.values()}
        names = [row["location"] for row in connection.execute("SELECT DISTINCT location FROM items WHERE location <> ''")]
        for name in [name for name in names if name not in rows] + [name for name, row in rows.items() if not row["code"]]:
            code = ""
            while not code or code in taken:
                code = "".join(secrets.choice(LOCATION_CODE_CHARS) for _ in range(6))
            taken.add(code)
            if name in rows:
                connection.execute("UPDATE locations SET code = ? WHERE name = ?", (code, name))
            else:
                connection.execute("INSERT INTO locations (name, image, code) VALUES (?, '', ?)", (name, code))
            rows[name] = {"name": name, "image": rows.get(name, {}).get("image", ""), "code": code}
    return rows.values()


def db_labels():
    init_db()
    with db_connection() as connection:
        return [{**json.loads(row["data"]), "id": row["id"]} for row in connection.execute("SELECT id, data FROM labels ORDER BY id")]


def label_from_json(data):
    # Etiqueta vinda do browser: so ficam os campos conhecidos, com os limites do editor.
    text = lambda value, limit: value.strip()[:limit] if isinstance(value, str) else ""
    fields, width, height = data.get("fields"), data.get("width"), data.get("height")
    if not isinstance(fields, list) or len(fields) > 4 or not all(isinstance(field, dict) for field in fields):
        raise ValueError("Uma etiqueta tem no máximo 4 campos")
    if data.get("code") not in {"DataMatrix", "QRCode", ""}:
        raise ValueError("Código inválido")
    if not all(isinstance(size, (int, float)) and not isinstance(size, bool) for size in (width, height)) or not (20 <= width <= 150 and 10 <= height <= 100):
        raise ValueError("O tamanho vai de 20 x 10 a 150 x 100 mm")
    item = data.get("item")
    if item is not None and (not isinstance(item, int) or isinstance(item, bool)):
        raise ValueError("Componente inválido")
    layout = data.get("layout") or "drawer"
    if layout not in {"drawer", "bin"}:
        raise ValueError("Formato inválido")
    # Tamanho da letra em pontos; vazio deixa a letra acompanhar a altura da etiqueta.
    sizes = {key: data.get(key) if data.get(key) != "" else None for key in ("titleSize", "fieldSize")}
    if not all(size is None or (isinstance(size, (int, float)) and not isinstance(size, bool) and 4 <= size <= 72) for size in sizes.values()):
        raise ValueError("A letra vai de 4 a 72 pt")
    # Borda preta opcional, em mm: espessura (vazia = sem borda), raio dos cantos e distancia ao corte.
    border = {key: data.get(key) if data.get(key) != "" else None for key in ("borderWidth", "borderRadius", "borderInset")}
    limits = {"borderWidth": (0.1, 5), "borderRadius": (0, 20), "borderInset": (0, 10)}
    if not all(value is None or (isinstance(value, (int, float)) and not isinstance(value, bool) and limits[key][0] <= value <= limits[key][1]) for key, value in border.items()):
        raise ValueError("A borda vai até 5 mm de espessura, 20 mm nos cantos e 10 mm de margem")
    # Um modelo e uma etiqueta guardada como ponto de partida, com nome; nao aparece na lista de etiquetas.
    template = data.get("template") is True
    if template and not text(data.get("templateName"), 40):
        raise ValueError("Dá um nome ao modelo")
    return {
        "title": text(data.get("title"), 40),
        "fields": [{"name": text(field.get("name"), 20), "value": text(field.get("value"), 30)} for field in fields],
        "code": data["code"],
        "location": text(data.get("location"), 255),
        "width": width,
        "height": height,
        # O ícone e uma chave de labelIcons.js; o browser so desenha as que conhece.
        "icon": text(data.get("icon"), 40),
        "item": item,
        "layout": layout,
        # Cabeça do parafuso desenhado no formato caixa, uma chave de labelIcons.js.
        "screw": text(data.get("screw"), 40),
        **sizes,
        **border,
        **({"template": True, "templateName": text(data.get("templateName"), 40)} if template else {}),
    }


def pcb_project_from_json(data):
    # Projeto PCB vindo do browser: so ficam os campos que a pagina usa, com limites.
    text = lambda value, limit: value.strip()[:limit] if isinstance(value, str) else ""
    project_id, items, step = data.get("id"), data.get("items"), data.get("step")
    if not isinstance(project_id, str) or not re.fullmatch(r"[\w-]{1,64}", project_id):
        raise ValueError("Projeto inválido")
    if not isinstance(items, list) or len(items) > 5000 or not all(isinstance(item, dict) for item in items):
        raise ValueError("O BOM tem de ser uma lista de até 5000 linhas")
    if not all(isinstance(item.get("quantity"), (int, float)) and not isinstance(item.get("quantity"), bool) and 0 <= item["quantity"] <= 1_000_000 for item in items):
        raise ValueError("Quantidade inválida no BOM")
    if step is not None and not (isinstance(step, dict) and isinstance(step.get("url"), str) and step["url"].startswith("/")):
        raise ValueError("Modelo STEP inválido")
    image = text(data.get("image"), 1000)
    if image and not image.startswith(("/", "https://")):
        raise ValueError("Imagem inválida")
    name = text(data.get("name"), 200) or text(data.get("fileName"), 200)
    if not name:
        raise ValueError("O projeto precisa de um nome")
    return {
        "id": project_id,
        "name": name,
        "fileName": text(data.get("fileName"), 255),
        "items": [{key: text(item.get(key), 500) for key in ("reference", "value", "description", "footprint", "partNumber")} | {"quantity": item["quantity"]} for item in items],
        **({"step": {"name": text(step.get("name"), 255), "url": text(step["url"], 1000)}} if step else {}),
        **({"image": image} if image else {}),
        "createdAt": text(data.get("createdAt"), 40),
        **({"updatedAt": text(data.get("updatedAt"), 40)} if data.get("updatedAt") else {}),
    }


def save_parts(parts):
    # Substitui cada peca pelo mpn: reimportar um carrinho atualiza o preco em vez de duplicar.
    init_db()
    with db_connection() as connection:
        for part in parts:
            connection.execute("DELETE FROM parts WHERE mpn = ?", (part["mpn"],))
            connection.execute(
                "INSERT INTO parts (mpn, manufacturer, description, category, props, price, source, datasheet) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (part["mpn"], part.get("manufacturer", ""), part.get("description", ""), part.get("category", ""),
                 json.dumps(part.get("props", {}), ensure_ascii=False), part.get("price"), part.get("source", ""), part.get("datasheet", "")),
            )


def google_sheet():
    # Abre o documento uma vez e reutiliza a sessao autenticada.
    global GOOGLE_SPREADSHEET
    if STORAGE_MODE != "google" or not GOOGLE_SHEET_ID or not GOOGLE_CREDENTIALS:
        return None
    if GOOGLE_SPREADSHEET is None:
        credentials = Credentials.from_service_account_file(
            GOOGLE_CREDENTIALS,
            scopes=["https://www.googleapis.com/auth/spreadsheets"],
        )
        GOOGLE_SPREADSHEET = gspread.authorize(credentials).open_by_key(GOOGLE_SHEET_ID)
    return GOOGLE_SPREADSHEET


def google_items():
    # Le as abas com colunas id, categoria e quantidade.
    global GOOGLE_ITEMS_CACHE, GOOGLE_ITEMS_CACHE_TIME
    now = time.monotonic()
    if GOOGLE_ITEMS_CACHE is not None and now - GOOGLE_ITEMS_CACHE_TIME < GOOGLE_ITEMS_CACHE_TTL:
        return json.loads(json.dumps(GOOGLE_ITEMS_CACHE, ensure_ascii=False))
    spreadsheet = google_sheet()
    if spreadsheet is None:
        return None
    items = []
    found_sheet = False
    for worksheet in spreadsheet.worksheets():
        values = worksheet.get_all_values(value_render_option="FORMULA")
        if not values or not any(any(row) for row in values):
            continue
        headers = [str(value).strip() for value in values[0]]
        positions = {header.casefold(): index for index, header in enumerate(headers)}
        if not {"id", "categoria", "quantidade"}.issubset(positions):
            continue
        found_sheet = True
        for row in values[1:]:
            if not any(row):
                continue
            row += [""] * (len(headers) - len(row))
            image_index = positions.get("imagem")
            image_value = row[image_index] if image_index is not None else ""
            image_match = IMAGE_FORMULA_RE.match(str(image_value).strip())
            image = image_match.group(1) if image_match else str(image_value).strip()
            if headers[:len(HEADERS)] == HEADERS:
                props = json.loads(row[2] or "{}")
            else:
                props = {
                    headers[index]: str(value)
                    for index, value in enumerate(row)
                    if headers[index].casefold() not in {"id", "categoria", "imagem", "quantidade"}
                    and value != ""
                }
            items.append({
                "id": int(row[positions["id"]]),
                "cat": str(row[positions["categoria"]]).strip() or worksheet.title,
                "props": props,
                "qty": int(row[positions["quantidade"]] or 0),
                "image": image,
                # shortcut: Sheets has no location column, locations are only kept in local mode.
                "location": "",
            })
    if not found_sheet:
        return None
    GOOGLE_ITEMS_CACHE = items
    GOOGLE_ITEMS_CACHE_TIME = now
    return json.loads(json.dumps(items, ensure_ascii=False))


def sync_google_to_db():
    # Copia alteracoes manuais do Google Sheets para a base usada pela API.
    sheet_items = google_items()
    if sheet_items is None or sheet_items == db_items():
        return False
    init_db()
    with db_connection() as connection:
        categories = {
            row["name"].casefold(): row["id"]
            for row in connection.execute("SELECT id, name FROM categories")
        }
        for item in sheet_items:
            key = item["cat"].casefold()
            if key not in categories:
                cursor = connection.execute(
                    "INSERT INTO categories (name, props) VALUES (?, ?)",
                    (item["cat"], json.dumps(list(item["props"]), ensure_ascii=False)),
                )
                categories[key] = cursor.lastrowid
        connection.execute("DELETE FROM items")
        connection.executemany(
            "INSERT INTO items (id, cat_id, props, `key`, qty, image, location) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [
                (
                    item["id"], categories[item["cat"].casefold()],
                    json.dumps(item["props"], ensure_ascii=False),
                    "|".join(norm(value) for value in item["props"].values()),
                    item["qty"], item.get("image", ""), item.get("location", ""),
                )
                for item in sheet_items
            ],
        )
    return True


def save_google_items(items):
    # Recria o formato visual: uma aba por categoria e uma coluna por propriedade.
    spreadsheet = google_sheet()
    if spreadsheet is None:
        return
    if any(item.get("image") for item in items) and not PUBLIC_BASE_URL:
        raise RuntimeError(
            "Define PUBLIC_BASE_URL antes de guardar imagens no Google Sheets"
        )
    managed = []
    for worksheet in spreadsheet.worksheets():
        values = worksheet.get_all_values()
        headers = [str(value).casefold() for value in values[0]] if values else []
        if not values or not any(any(row) for row in values) or {"id", "categoria", "quantidade"}.issubset(headers):
            managed.append(worksheet)
    if not managed:
        managed = [spreadsheet.add_worksheet(title="Folha1", rows=1000, cols=10)]
    grouped = {}
    for item in items:
        grouped.setdefault(item["cat"], []).append(item)
    while len(managed) < len(grouped):
        managed.append(spreadsheet.add_worksheet(title=f"Categoria {len(managed) + 1}", rows=1000, cols=10))
    used_names = {sheet.title.casefold() for sheet in spreadsheet.worksheets() if sheet not in managed}
    image_categories = {
        category["name"]: category["image"] for category in db_categories()
    }
    for index, (category, category_items) in enumerate(grouped.items()):
        worksheet = managed[index]
        worksheet.update_title(category_sheet_name(category, used_names))
        property_names = list(dict.fromkeys(
            name for item in category_items for name in item["props"]
        ))
        has_images = image_categories.get(category, False)
        headers = ["id", "categoria", *property_names]
        if has_images:
            headers.append("imagem")
        headers.append("quantidade")
        rows = [headers] + [
            [item["id"], item["cat"]]
            + [item["props"].get(name, "") for name in property_names]
            + ([f'=IMAGE("{sheet_image_url(item["image"])}";4;80;80)'] if has_images and item.get("image") else ([""] if has_images else []))
            + [item["qty"]]
            for item in category_items
        ]
        worksheet.clear()
        worksheet.resize(rows=max(1000, len(rows)), cols=max(10, len(headers)))
        worksheet.update(values=rows, range_name="A1", value_input_option="USER_ENTERED")
        worksheet.format(
            f"A1:{get_column_letter(len(headers))}{len(rows)}",
            {"horizontalAlignment": "CENTER", "verticalAlignment": "MIDDLE"},
        )
        if has_images:
            image_column = headers.index("imagem")
            spreadsheet.batch_update({
                "requests": [
                    {
                        "updateDimensionProperties": {
                            "range": {
                                "sheetId": worksheet.id,
                                "dimension": "ROWS",
                                "startIndex": 1,
                                "endIndex": len(rows),
                            },
                            "properties": {"pixelSize": 90},
                            "fields": "pixelSize",
                        }
                    },
                    {
                        "updateDimensionProperties": {
                            "range": {
                                "sheetId": worksheet.id,
                                "dimension": "COLUMNS",
                                "startIndex": image_column,
                                "endIndex": image_column + 1,
                            },
                            "properties": {"pixelSize": 100},
                            "fields": "pixelSize",
                        }
                    },
                ]
            })
    for worksheet in managed[len(grouped):]:
        if len(spreadsheet.worksheets()) > 1:
            spreadsheet.del_worksheet(worksheet)
        else:
            worksheet.clear()
    GOOGLE_ITEMS_CACHE = None


def sheet_image_url(image_url):
    """Troca o host local pelo endereco publico configurado para o Sheets."""
    if not image_url:
        return image_url
    path = image_path(image_url)
    if not PUBLIC_BASE_URL:
        return image_url
    return f"{PUBLIC_BASE_URL}{path}"


def image_path(image_url):
    """Mantem imagens como caminhos locais para funcionarem em qualquer tunnel."""
    if not image_url:
        return ""
    filename = Path(urlparse(str(image_url)).path).name
    return f"/uploads/{filename}" if filename else ""


def excel_table(workbook, create=True):
    # Funcao de compatibilidade com a primeira versao do programa.
    # Recebe um Workbook e procura a folha Stock; se create=True, cria a folha
    # e uma tabela A1:D1 com os cabecalhos antigos.
    if EXCEL_SHEET in workbook.sheetnames:
        sheet = workbook[EXCEL_SHEET]
    elif create:
        sheet = workbook.create_sheet(EXCEL_SHEET)
    else:
        raise RuntimeError(f"A folha {EXCEL_SHEET!r} não existe")

    if EXCEL_TABLE in sheet.tables:
        return sheet, sheet.tables[EXCEL_TABLE]
    if not create:
        raise RuntimeError(f"A tabela {EXCEL_TABLE!r} não existe")

    for column, header in enumerate(HEADERS, start=1):
        sheet.cell(row=1, column=column, value=header)
    tabela = Table(displayName=EXCEL_TABLE, ref="A1:D1")
    tabela.tableStyleInfo = TableStyleInfo(
        name="TableStyleMedium2", showFirstColumn=False, showLastColumn=False,
        showRowStripes=True, showColumnStripes=False,
    )
    sheet.add_table(tabela)
    return sheet, tabela


def read_excel_items():
    # Converte todas as linhas validas do Excel para a estrutura interna:
    # {"id": ..., "cat": ..., "props": {...}, "qty": ...}.
    if not EXCEL_PATH.exists():
        # Sem ficheiro, a base de dados atual nao deve ser apagada.
        return None
    # data_only=True le o resultado das formulas em vez da formula em si.
    workbook = load_workbook(EXCEL_PATH, data_only=True)
    # Um livro antigo tem a folha Stock. O formato novo tem uma folha por
    # categoria, por isso nesse caso todas as folhas precisam de ser percorridas.
    sheets = [workbook[EXCEL_SHEET]] if EXCEL_SHEET in workbook.sheetnames else [
        workbook[sheet_name] for sheet_name in workbook.sheetnames
    ]
    if not sheets:
        return None

    # Acumula componentes de todas as folhas para depois substituir os dados DB.
    items = []
    # Serve para atribuir identificadores a linhas adicionadas manualmente no Excel.
    next_id = 0
    for sheet in sheets:
        # max_row/max_col definem o retangulo lido: cabecalhos na linha 1 e
        # componentes a partir da linha 2.
        min_row, min_col = 1, 1
        max_row, max_col = max(sheet.max_row, 1), max(sheet.max_column, len(HEADERS))
        headers = [sheet.cell(min_row, col).value for col in range(min_col, max_col + 1)]
        positions = {str(header).casefold(): index for index, header in enumerate(headers)}
        # Se todas as colunas antigas existirem, propriedades vem num JSON unico.
        legacy_sheet = all(header.casefold() in positions for header in HEADERS)
        # No formato novo, basta existirem id e quantidade; as outras colunas
        # (exceto categoria) sao tratadas como propriedades dinamicas.
        dynamic_sheet = all(header in positions for header in ("id", "quantidade"))
        if not legacy_sheet and not dynamic_sheet:
            if EXCEL_SHEET in workbook.sheetnames:
                missing = [header for header in HEADERS if header.casefold() not in positions]
                raise RuntimeError(f"Faltam colunas no Excel: {', '.join(missing)}")
            continue

        for row in sheet.iter_rows(min_row=min_row + 1, max_row=max_row, min_col=min_col, max_col=max_col, values_only=True):
            # Linhas vazias podem existir no fim da folha e nao representam itens.
            if not any(value is not None for value in row):
                continue

            def value(name):
                # positions transforma o nome do cabecalho no indice correto da linha.
                return row[positions[name.casefold()]]

            if legacy_sheet:
                # JSON pode ja ser um dicionario ou ainda ser texto, dependendo do Excel.
                raw_props = value("propriedades") or "{}"
                props = json.loads(raw_props) if isinstance(raw_props, str) else raw_props
            else:
                # O nome do cabecalho torna-se a chave e a celula torna-se o valor
                # da propriedade, por exemplo coluna "valor" -> props["valor"].
                excluded = {"id", "categoria", "quantidade"}
                props = {
                    headers[index]: str(cell_value)
                    for index, cell_value in enumerate(row)
                    if index < len(headers)
                    and str(headers[index]).casefold() not in excluded
                    and cell_value is not None
                }
            category_value = row[positions["categoria"]] if "categoria" in positions else sheet.title
            # Um id existente e preservado; uma linha sem id recebe o proximo valor
            # maior ja encontrado para evitar colisao com os itens anteriores.
            raw_id = value("id")
            if raw_id is None or str(raw_id).strip() == "":
                next_id += 1
                item_id = next_id
            else:
                item_id = int(raw_id)
                next_id = max(next_id, item_id)
            items.append({
                "id": item_id,
                "cat": str(category_value or sheet.title).strip(),
                "props": {str(key): str(val) for key, val in props.items()},
                "qty": int(value("quantidade") or 0),
            })
    return items


def category_sheet_name(category, used_names):
    # Recebe o nome da categoria e devolve o nome que sera usado no Excel.
    # Substitui simbolos proibidos, corta nomes longos e garante unicidade.
    name = "".join("_" if char in CATEGORY_SHEET_INVALID_CHARS else char for char in category)
    name = name.strip()[:CATEGORY_SHEET_MAX_LENGTH] or "Categoria"
    candidate = name
    suffix = 2
    while candidate.casefold() in used_names:
        # Duas categorias com nomes iguais depois da limpeza recebem sufixos
        # para que o openpyxl nao tente criar duas folhas com o mesmo nome.
        suffix_text = f" ({suffix})"
        candidate = f"{name[:CATEGORY_SHEET_MAX_LENGTH - len(suffix_text)]}{suffix_text}"
        suffix += 1
    used_names.add(candidate.casefold())
    return candidate


def sync_excel_to_db():
    # Usa o Excel como fonte quando o utilizador edita o ficheiro manualmente.
    # A comparacao evita apagar e recriar a base quando nada foi alterado.
    with EXCEL_LOCK:
        excel_items = read_excel_items()
        if excel_items is None or excel_items == db_items():
            # Se nao existe Excel, mantemos a base. Se os dados sao iguais,
            # nao fazemos uma escrita desnecessaria.
            return False

        init_db()
        with db_connection() as connection:
            categories = {
                row["name"].casefold(): row["id"]
                for row in connection.execute("SELECT id, name FROM categories")
            }
            excel_categories = {item["cat"].casefold() for item in excel_items}
            for item in excel_items:
                # Uma categoria nova escrita no Excel passa a existir tambem no DB.
                category_key = item["cat"].casefold()
                if category_key not in categories:
                    cursor = connection.execute(
                        "INSERT INTO categories (name, props) VALUES (?, ?)",
                        (item["cat"], json.dumps(list(item["props"]), ensure_ascii=False)),
                    )
                    categories[category_key] = cursor.lastrowid
            connection.execute("DELETE FROM items")
            # A lista Excel e considerada completa: primeiro removemos a versao
            # anterior e depois inserimos todos os itens novamente.
            connection.executemany(
                "INSERT INTO items (id, cat_id, props, `key`, qty, image, location) VALUES (?, ?, ?, ?, ?, ?, ?)",
                [
                    (
                        item["id"],
                        categories[item["cat"].casefold()],
                        json.dumps(item["props"], ensure_ascii=False),
                        "|".join(norm(value) for value in item["props"].values()),
                        item["qty"], item.get("image", ""), item.get("location", ""),
                    )
                    for item in excel_items
                ],
            )
            excel_category_ids = [categories[key] for key in excel_categories]
            if excel_category_ids:
                # Mantem apenas categorias representadas por pelo menos um item
                # no Excel; categorias vazias deixam de existir neste sincronismo.
                placeholders = ",".join("?" for _ in excel_category_ids)
                connection.execute(
                    f"DELETE FROM categories WHERE id NOT IN ({placeholders})",
                    excel_category_ids,
                )
            else:
                connection.execute("DELETE FROM categories")
    return True


def excel_sync_worker():
    # Executa continuamente fora do pedido HTTP. Assim, o servidor pode detetar
    # uma edicao feita no Excel mesmo quando nao ha pedidos naquele momento.
    last_signature = None
    while True:
        try:
            signature = None
            if EXCEL_PATH.exists():
                # Se data ou tamanho mudarem, o Excel sera lido novamente.
                stat = EXCEL_PATH.stat()
                signature = (stat.st_mtime_ns, stat.st_size)
            if signature != last_signature:
                if sync_excel_to_db():
                    last_signature = signature
                else:
                    last_signature = signature
        except Exception:
            # Um erro de leitura fica isolado nesta tentativa; a proxima verificacao
            # tenta novamente sem desligar a aplicacao Flask.
            pass
        time.sleep(EXCEL_SYNC_INTERVAL)


def start_excel_sync():
    # daemon=True faz a thread terminar automaticamente quando o servidor termina.
    # A funcao nao espera pelo worker: inicia-o e devolve o controlo ao Flask.
    if STORAGE_MODE != "excel":
        return
    threading.Thread(target=excel_sync_worker, name="excel-sync", daemon=True).start()


def read_items():
    # E o ponto unico usado pelas rotas para ler componentes. Sincronizar aqui
    # garante que uma alteracao manual fica visivel mesmo antes dos 5 segundos.
    if STORAGE_MODE == "google":
        sync_google_to_db()
    elif STORAGE_MODE == "excel":
        sync_excel_to_db()
    return None, None, None, db_items()


def save_items(items, movements=()):
    # Recebe a lista completa atual e grava a mesma informacao em dois locais:
    # SQLite para a aplicacao e Excel para consulta/edicao manual.
    with EXCEL_LOCK:
        init_db()
        with db_connection() as connection:
            categories = {
                row["name"]: row["id"]
                for row in connection.execute("SELECT id, name FROM categories")
            }
            for item in items:
                # Antes de inserir items, cria a categoria caso ela ainda nao exista.
                if item["cat"] not in categories:
                    cursor = connection.execute(
                        "INSERT INTO categories (name, props) VALUES (?, ?)",
                        (item["cat"], json.dumps(list(item["props"]), ensure_ascii=False)),
                    )
                    categories[item["cat"]] = cursor.lastrowid
            connection.execute("DELETE FROM items")
            # Reescreve os itens para que apagamentos e alteracoes tambem sejam
            # refletidos na base, em vez de apenas adicionar novos registos.
            connection.executemany(
                "INSERT INTO items (id, cat_id, props, `key`, qty, image, location) VALUES (?, ?, ?, ?, ?, ?, ?)",
                [
                    (
                        item["id"],
                        categories[item["cat"]],
                        json.dumps(item["props"], ensure_ascii=False),
                        "|".join(norm(value) for value in item["props"].values()),
                        item["qty"], item.get("image", ""), item.get("location", ""),
                    )
                    for item in items
                ],
            )
            record_movements(connection, movements)

        if STORAGE_MODE == "google":
            save_google_items(items)
            return

        if STORAGE_MODE == "local":
            return

        # Mantem folhas nao geridas pelo programa e abre/cria o livro de trabalho.
        workbook = load_workbook(EXCEL_PATH) if EXCEL_PATH.exists() else Workbook()
        if EXCEL_SHEET in workbook.sheetnames:
            del workbook[EXCEL_SHEET]
        for sheet in list(workbook.worksheets):
            # Uma folha e considerada gerida se tiver as colunas base do formato
            # atual. Remove-a para evitar nomes repetidos como "Res (2)".
            headers = {
                str(sheet.cell(row=1, column=column).value).casefold()
                for column in range(1, sheet.max_column + 1)
            }
            if {"id", "categoria", "quantidade"}.issubset(headers):
                del workbook[sheet.title]

        used_names = {sheet.title.casefold() for sheet in workbook.worksheets}
        # Dicionario: nome da categoria -> lista dos seus componentes.
        # Este agrupamento e o que garante uma folha por categoria, nao por item.
        items_by_category = {}
        for item in items:
            items_by_category.setdefault(item["cat"], []).append(item)
        for category, category_items in items_by_category.items():
            # A folha e criada uma vez; cada componente sera uma linha dentro dela.
            sheet = workbook.create_sheet(category_sheet_name(category, used_names))
            # Junta as propriedades dos itens da categoria pela ordem em que aparecem.
            # dict.fromkeys elimina repeticoes sem perder essa ordem.
            property_names = list(dict.fromkeys(
                property_name
                for item in category_items
                for property_name in item["props"]
            ))
            headers = ["id", "categoria", *property_names, "quantidade"]
            for column, header in enumerate(headers, start=1):
                # Coloca os nomes das colunas na primeira linha e define a largura
                # para que valores e nomes de propriedades sejam visiveis.
                sheet.cell(row=1, column=column, value=header)
                sheet.column_dimensions[sheet.cell(row=1, column=column).column_letter].width = EXCEL_COLUMN_WIDTHS.get(header, 22)
            for item in category_items:
                # O id e categoria ficam no inicio, as propriedades no meio e a
                # quantidade no fim; valores ausentes ficam como celula vazia.
                sheet.append([item["id"], item["cat"]] + [
                    item["props"].get(property_name, "") for property_name in property_names
                ] + [item["qty"]])
        if len(workbook.worksheets) > 1:
            for sheet in list(workbook.worksheets):
                # Workbook() cria por vezes uma folha vazia chamada Sheet; remove-a
                # quando ja existem folhas de categorias.
                if not any(cell.value is not None for row in sheet.iter_rows() for cell in row):
                    del workbook[sheet.title]
        EXCEL_PATH.parent.mkdir(parents=True, exist_ok=True)
        # Se o processo falhar durante save, o Excel original permanece intacto.
        temporary_path = EXCEL_PATH.with_name(f".{EXCEL_PATH.stem}.tmp.xlsx")
        workbook.save(temporary_path)
        os.replace(temporary_path, EXCEL_PATH)


def data_from_items(items):
    # Junta configuracao das categorias e lista de itens numa unica resposta JSON.
    # auth/user dizem ao frontend que as alteracoes pedem login e quem esta com sessao.
    locations = db_locations()
    return {
        "categories": db_categories(),
        "items": items,
        "parts": db_parts(),
        "locations": {row["name"]: image_path(row["image"]) for row in locations},
        "location_codes": {row["name"]: row["code"] for row in locations},
        "labels": db_labels(),
        "can_edit": STORAGE_MODE == "local",
        "auth": True,
        "user": current_person(),
        "notion_login": bool(NOTION_CLIENT_ID),
    }


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None


IMAGE_OPENER = urllib.request.build_opener(NoRedirect)


class ImageLinkError(ValueError):
    pass


def download_image(url):
    # Cada salto de redirecionamento e validado: o servidor nao pode servir de ponte para a rede interna.
    # shortcut: o DNS pode mudar entre a verificacao e o pedido (rebinding); fixar o IP se o servidor ficar exposto a utilizadores nao confiaveis.
    for _ in range(5):
        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            raise ImageLinkError("Link de imagem inválido")
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
        if not all(ipaddress.ip_address(info[4][0]).is_global for info in socket.getaddrinfo(parsed.hostname, port)):
            raise ImageLinkError("Link de imagem inválido")
        try:
            with IMAGE_OPENER.open(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=10) as response:
                data = response.read(MAX_IMAGE_DOWNLOAD + 1)
        except urllib.error.HTTPError as exc:
            if exc.code in {301, 302, 303, 307, 308} and exc.headers.get("Location"):
                url = urljoin(url, exc.headers["Location"])
                continue
            raise
        if len(data) > MAX_IMAGE_DOWNLOAD:
            raise ImageLinkError("A imagem desse link é demasiado grande")
        return data
    raise ImageLinkError("Demasiados redirecionamentos no link da imagem")


@app.post("/api/images")
def upload_image():
    image = request.files.get("image")
    url = request.form.get("url", "").strip()
    if image is not None and image.filename:
        if Path(image.filename).suffix.lower() not in ALLOWED_IMAGE_EXTENSIONS:
            return erro("Formato de imagem não suportado")
        stream, from_link = image.stream, False
    elif url:
        from_link = True
        try:
            stream = BytesIO(download_image(url))
        except ImageLinkError as exc:
            return erro(str(exc))
        except (ValueError, OSError):
            return erro("Não foi possível descarregar a imagem desse link")
    else:
        return erro("Seleciona uma imagem")
    try:
        source = Image.open(stream)
        source.load()
        source = ImageOps.exif_transpose(source).convert("RGB")
    except (UnidentifiedImageError, OSError):
        if from_link:
            return erro("Esse link não devolveu uma imagem (sites como a Mouser bloqueiam downloads). Copia a imagem no site e cola-a aqui com Ctrl+V.")
        return erro("O ficheiro enviado não é uma imagem válida")

    # Sem margens brancas: a foto mantém a proporção e o CSS decide como a mostrar.
    normalized = source.copy()
    normalized.thumbnail(NORMALIZED_IMAGE_SIZE, Image.Resampling.LANCZOS)
    filename = f"{uuid4().hex}.jpg"
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    output = BytesIO()
    normalized.save(output, format="JPEG", quality=82, optimize=True)
    (UPLOAD_DIR / secure_filename(filename)).write_bytes(output.getvalue())
    return jsonify(url=f"/uploads/{filename}")


@app.post("/api/pcb-step")
def upload_pcb_step():
    if (denied := electronics_denied()):
        return denied
    # Modelos STEP das PCBs passam do limite geral de 5 MB; o nginx aceita até 50 MB.
    request.max_content_length = MAX_STEP_SIZE
    step = request.files.get("step")
    if step is None or Path(step.filename or "").suffix.lower() not in {".step", ".stp"}:
        return erro("Seleciona um ficheiro STEP (.step ou .stp)")
    data = step.read()
    if not data.lstrip().startswith(b"ISO-10303-21"):
        return erro("O ficheiro enviado não é um STEP válido")
    stem = uuid4().hex
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    (UPLOAD_DIR / f"{stem}.step").write_bytes(data)
    start_step_mesh(stem)
    return jsonify(url=f"/uploads/{stem}.step")


def start_step_mesh(stem):
    # Ler um STEP de placa demora ~1,5 min e ~600 MB: o Node converte-o uma vez numa malha leve, à parte do pedido.
    # O ficheiro .part marca a conversão em curso (vale entre workers); passados 10 min conta como abandonada.
    part = UPLOAD_DIR / f"{stem}.mesh.part"
    if part.exists() and time.time() - part.stat().st_mtime < 600:
        return
    node = shutil.which("node")
    if node is None:
        (UPLOAD_DIR / f"{stem}.mesh.error").write_text("Node não está instalado no servidor")
        return
    part.touch()
    subprocess.Popen([node, str(BASE_DIR.parent / "scripts" / "step-mesh.cjs"), str(UPLOAD_DIR / f"{stem}.step"), str(UPLOAD_DIR / f"{stem}.mesh")],
                     cwd=BASE_DIR.parent, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)


@app.get("/api/pcb-step/<stem>/mesh")
def pcb_step_mesh(stem):
    # Malha 3D do STEP para o visualizador: 202 enquanto converte (STEPs antigos começam a converter aqui).
    if not re.fullmatch(r"[0-9a-f]{32}", stem) or not (UPLOAD_DIR / f"{stem}.step").exists():
        return erro("Modelo STEP não encontrado", 404)
    if (UPLOAD_DIR / f"{stem}.mesh").exists():
        return send_from_directory(UPLOAD_DIR, f"{stem}.mesh", mimetype="application/octet-stream")
    if (UPLOAD_DIR / f"{stem}.mesh.error").exists():
        return erro("Não foi possível converter este STEP para 3D. Descarrega-o e abre-o num programa de CAD.", 422)
    start_step_mesh(stem)
    return jsonify(pending=True), 202


@app.get("/uploads/<path:filename>")
def uploaded_image(filename):
    return send_from_directory(UPLOAD_DIR, filename)


@app.get("/simulations/<path:filename>")
def board_simulation(filename):
    # Emuladores HTML das placas analogicas, mostrados na pagina Simulacao analogica.
    return send_from_directory(BASE_DIR.parent / "board_emulation", filename)


@app.route("/")
def home():
    # Rota da pagina principal; o HTML trata da apresentacao e chama as APIs abaixo.
    return app.response_class((BASE_DIR / "templates" / "index.html").read_text(encoding="utf-8"), mimetype="text/html")


@app.get("/api/data")
def dados():
    # GET /api/data e a leitura inicial e atualizada usada pela interface web.
    try:
        _, _, _, items = read_items()
        return jsonify(data_from_items(items))
    except Exception as exc:
        return erro(str(exc), 500)


@app.post("/api/items/import")
def import_items():
    if STORAGE_MODE != "local":
        return erro("A importação CSV requer armazenamento local no servidor")
    data = request.get_json(silent=True)
    rows = data.get("items") if isinstance(data, dict) else None
    if not isinstance(rows, list) or not rows or len(rows) > 5000:
        return erro("Envia entre 1 e 5000 componentes para importar")
    if (denied := electronics_denied()):
        return denied
    try:
        with EXCEL_LOCK:
            init_db()
            with db_connection() as connection:
                categories = {
                    row["name"].casefold(): row
                    for row in connection.execute("SELECT id, name, props FROM categories")
                }
                validated = []
                for index, item in enumerate(rows, start=2):
                    if not isinstance(item, dict):
                        raise ValueError(f"Linha {index}: componente inválido")
                    name = item.get("cat")
                    category = categories.get(name.strip().casefold()) if isinstance(name, str) else None
                    if category is None:
                        raise ValueError(f"Linha {index}: categoria desconhecida")
                    quantity = item.get("qty")
                    if type(quantity) is not int or not 1 <= quantity <= 9007199254740991:
                        raise ValueError(f"Linha {index}: quantidade inválida")
                    properties = item.get("props")
                    required = json.loads(category["props"])
                    if not isinstance(properties, dict) or set(properties) != set(required):
                        raise ValueError(f"Linha {index}: propriedades diferentes das da categoria {category['name']}")
                    if any(not isinstance(properties[key], str) or not properties[key].strip() for key in required):
                        raise ValueError(f"Linha {index}: preenche todas as propriedades")
                    properties = {key: properties[key].strip() for key in required}
                    validated.append((category, properties, quantity))
                movements = []
                for category, properties, quantity in validated:
                    key = "|".join(norm(value) for value in properties.values())
                    existing = connection.execute("SELECT id, qty FROM items WHERE cat_id = ? AND `key` = ?", (category["id"], key)).fetchone()
                    before = existing["qty"] if existing else 0
                    if before + quantity > 9007199254740991:
                        raise ValueError("A quantidade total excede o limite permitido")
                    if existing:
                        connection.execute("UPDATE items SET qty = qty + ? WHERE id = ?", (quantity, existing["id"]))
                        item_id = existing["id"]
                    else:
                        item_id = connection.execute("INSERT INTO items (cat_id, props, `key`, qty, image) VALUES (?, ?, ?, ?, '')", (category["id"], json.dumps(properties, ensure_ascii=False), key, quantity)).lastrowid
                    movements.append({"cat": category["name"], "props": properties, "qty": quantity, "before": before})
                    record_movements(connection, [{"type": "in", "item_id": item_id, "cat": category["name"], "props": properties, "delta": quantity, "before": before}])
        units = sum(item["qty"] for item in movements)
        return jsonify(msg=f"{len(rows)} linha(s) importada(s) · {units} unidades adicionadas", rows=len(rows), units=units, movements=movements)
    except ValueError as exc:
        return erro(str(exc))
    except Exception as exc:
        return erro(str(exc), 500)


@app.post("/api/move")
def mover():
    # POST /api/move processa entrada ou saida de stock enviada pelo frontend.
    data = request.get_json(silent=True) or {}
    # A quantidade vem do JSON como texto ou numero; converte para int e exige
    # pelo menos uma unidade antes de alterar qualquer dado.
    try:
        qty = int(data.get("qty", 0))
    except (TypeError, ValueError):
        qty = 0
    if qty < 1:
        return erro("A quantidade tem de ser 1 ou mais")

    try:
        _, _, _, items = read_items()
        # Extrai do pedido a categoria e os valores preenchidos nas propriedades.
        category = str(data.get("cat", "")).strip()
        props = {str(key): str(value).strip() for key, value in (data.get("props") or {}).items()}
        image = str(data.get("image", "")).strip()
        category_config = next((item for item in db_categories() if item["name"] == category), None)
        if not category or not props or not all(props.values()):
            return erro("Preenche a categoria e todas as propriedades")
        if not category_config:
            return erro("Categoria não encontrada", 404)
        if (denied := electronics_denied()):
            return denied
        if image and not category_config["image"]:
            return erro("Esta categoria não aceita imagens")
        key = "|".join(norm(props[name]) for name in props)
        # Dois itens sao considerados iguais quando pertencem a mesma categoria
        # e todos os valores das propriedades, depois de normalizados, coincidem.
        item = next((current for current in items if current["cat"] == category and "|".join(norm(current["props"].get(name, "")) for name in props) == key), None)
        before = item["qty"] if item else 0

        if data.get("mode") == "out":
            # Na saida, nunca se cria um item novo e nunca se permite stock negativo.
            if not item:
                return erro("Esse item não existe no stock", 404)
            if item["qty"] < qty:
                return erro(f"Só há {item['qty']} em stock")
            item["qty"] -= qty
            message = f"Retirado. Restam {item['qty']}"
        elif item:
            # Na entrada, um item existente recebe apenas o aumento de quantidade.
            item["qty"] += qty
            if image:
                item["image"] = image
            message = f"Quantidade somada: agora {item['qty']}"
        else:
            # Se nao houve correspondencia, cria uma referencia com id novo.
            new_id = max((item["id"] for item in items), default=0) + 1
            item = {"id": new_id, "cat": category, "props": props, "qty": qty, "image": image}
            items.append(item)
            message = "Item novo adicionado"
        save_items(items, [{"type": "out" if data.get("mode") == "out" else "in", "item_id": item["id"], "cat": category,
                            "props": item["props"], "delta": item["qty"] - before, "before": before}])
        return jsonify(msg=message)
    except Exception as exc:
        return erro(str(exc), 500)


@app.post("/api/items/consume")
def consumir():
    # Tira do stock as pecas de uma PCB produzida: tudo ou nada, e cada saida fica com o nome da PCB.
    data = request.get_json(silent=True) or {}
    lines, note = data.get("items"), data.get("note")
    if not isinstance(note, str) or not note.strip() or len(note.strip()) > 255:
        return erro("Escreve o nome da PCB")
    if not isinstance(lines, list) or not lines or not all(
            isinstance(line, dict) and type(line.get("id")) is int and type(line.get("qty")) is int and line["qty"] > 0 for line in lines):
        return erro("Escolhe os componentes e as quantidades a retirar")
    try:
        _, _, _, items = read_items()
        by_id = {item["id"]: item for item in items}
        movements = []
        for line in lines:
            item = by_id.get(line["id"])
            if not item:
                return erro("Item não encontrado", 404)
            if item["qty"] < line["qty"]:
                return erro(f"Só há {item['qty']} de {' · '.join(item['props'].values())} em stock")
            movements.append({"type": "out", "item_id": item["id"], "cat": item["cat"], "props": item["props"],
                              "delta": -line["qty"], "before": item["qty"], "note": note.strip()})
            item["qty"] -= line["qty"]
        if (denied := electronics_denied()):
            return denied
        save_items(items, movements)
        return jsonify(msg=f"{sum(line['qty'] for line in lines)} unidade(s) retiradas para {note.strip()}")
    except Exception as exc:
        return erro(str(exc), 500)


@app.post("/api/items/<int:item_id>/step")
def ajustar(item_id):
    # POST /api/items/<id>/step altera a quantidade de um item ja identificado.
    try:
        delta = int((request.get_json(silent=True) or {}).get("delta", 0))
        _, _, _, items = read_items()
        item = next((current for current in items if current["id"] == item_id), None)
        if not item:
            return erro("Item não encontrado", 404)
        if (denied := electronics_denied()):
            return denied
        before = item["qty"]
        item["qty"] = max(0, item["qty"] + delta)
        # max protege a regra de negocio: a quantidade minima possivel e zero.
        change = item["qty"] - before
        save_items(items, [{"type": "in" if change > 0 else "out", "item_id": item_id, "cat": item["cat"],
                            "props": item["props"], "delta": change, "before": before}] if change else [])
        return jsonify(ok=True)
    except (TypeError, ValueError):
        return erro("Valor inválido")
    except Exception as exc:
        return erro(str(exc), 500)


@app.delete("/api/items/<int:item_id>")
def apagar(item_id):
    # DELETE /api/items/<id> remove uma referencia inteira, nao apenas unidades.
    try:
        _, _, _, items = read_items()
        item = next((current for current in items if current["id"] == item_id), None)
        if not item:
            return erro("Item não encontrado", 404)
        if (denied := electronics_denied()):
            return denied
        save_items([current for current in items if current["id"] != item_id],
                   [{"type": "delete", "item_id": item_id, "cat": item["cat"], "props": item["props"], "delta": -item["qty"], "before": item["qty"]}])
        return jsonify(ok=True)
    except Exception as exc:
        return erro(str(exc), 500)


@app.patch("/api/items/<int:item_id>")
def editar_item(item_id):
    if STORAGE_MODE != "local":
        return erro("A edição está disponível no modo local")
    data = request.get_json(silent=True) or {}
    try:
        init_db()
        with EXCEL_LOCK, db_connection() as connection:
            row = connection.execute("SELECT * FROM items WHERE id = ?", (item_id,)).fetchone()
            if row is None:
                return erro("Item não encontrado", 404)
            category = connection.execute("SELECT * FROM categories WHERE id = ?", (row["cat_id"],)).fetchone()
            if (denied := electronics_denied()):
                return denied
            raw_props = data.get("props")
            raw_qty = data.get("qty")
            if not isinstance(raw_props, dict) or isinstance(raw_qty, bool) or not re.fullmatch(r"\d+", str(raw_qty)):
                return erro("Preenche as propriedades e uma quantidade inteira igual ou superior a zero")
            names = json.loads(category["props"])
            if set(raw_props) != set(names):
                return erro("As propriedades devem corresponder à categoria")
            props = {name: str(raw_props[name]).strip() if raw_props[name] is not None else "" for name in names}
            if not all(props.values()):
                return erro("Preenche todas as propriedades")
            image = row["image"]
            if "image" in data:
                image = image_path(data["image"])
                if image and image != image_path(row["image"]) and not category["image_enabled"]:
                    return erro("Esta categoria não aceita imagens")
                if image and not (UPLOAD_DIR / Path(image).name).is_file():
                    return erro("Imagem não encontrada")
            connection.execute(
                "UPDATE items SET props = ?, `key` = ?, qty = ?, image = ? WHERE id = ?",
                (json.dumps(props, ensure_ascii=False), "|".join(norm(value) for value in props.values()), int(raw_qty), image, item_id),
            )
            record_movements(connection, [{"type": "edit", "item_id": item_id, "cat": category["name"], "props": props,
                                           "delta": int(raw_qty) - row["qty"], "before": row["qty"]}])
        return jsonify(msg="Componente atualizado")
    except DB_INTEGRITY_ERRORS:
        return erro("Já existe um componente com essas propriedades. A edição não foi guardada.", 409)
    except Exception as exc:
        return erro(str(exc), 500)


@app.post("/api/items/location")
def mudar_localizacao():
    # Guarda a mesma localizacao (caixa, gaveta...) em varios componentes de uma vez; vazia limpa.
    if STORAGE_MODE != "local":
        return erro("A edição está disponível no modo local")
    data = request.get_json(silent=True) or {}
    ids, location = data.get("ids"), data.get("location", "")
    if not isinstance(ids, list) or not ids or not all(isinstance(i, int) and not isinstance(i, bool) for i in ids) or not isinstance(location, str):
        return erro("Escolhe os componentes e uma localização")
    location = location.strip()
    if len(location) > 255:
        return erro("Localização demasiado longa")
    try:
        init_db()
        with EXCEL_LOCK, db_connection() as connection:
            placeholders = ",".join("?" for _ in ids)
            if (denied := electronics_denied()):
                return denied
            changed = connection.execute(f"SELECT COUNT(*) AS n FROM items WHERE id IN ({placeholders})", ids).fetchone()["n"]
            connection.execute(f"UPDATE items SET location = ? WHERE id IN ({placeholders})", (location, *ids))
        if not changed:
            return erro("Item não encontrado", 404)
        return jsonify(msg=f"{changed} componente(s) {'em ' + location if location else 'sem localização'}")
    except Exception as exc:
        return erro(str(exc), 500)


@app.patch("/api/locations")
def editar_localizacao():
    if (denied := electronics_denied()):
        return denied
    # Muda o nome (em todos os componentes que la estao) e/ou a foto de uma localizacao.
    if STORAGE_MODE != "local":
        return erro("A edição está disponível no modo local")
    data = request.get_json(silent=True) or {}
    old, new, image = data.get("name"), data.get("newName", data.get("name")), data.get("image")
    if not all(isinstance(value, str) for value in (old, new)) or not old.strip() or not new.strip() or (image is not None and not isinstance(image, str)):
        return erro("Indica a localização e o novo nome")
    old, new = old.strip(), new.strip()
    if len(new) > 255:
        return erro("Localização demasiado longa")
    try:
        init_db()
        with EXCEL_LOCK, db_connection() as connection:
            saved = {row["name"]: row for row in connection.execute("SELECT name, image, code FROM locations WHERE name IN (?, ?)", (old, new))}
            # Juntar numa localizacao que ja existe mantem a foto dela se esta nao tiver uma.
            image = image if image is not None else (saved[old]["image"] if old in saved else "") or (saved[new]["image"] if new in saved else "")
            # O codigo do QR segue a caixa: ao juntar fica o da caixa de destino, cujas etiquetas ja estao coladas.
            code = saved[new]["code"] if new in saved else saved[old]["code"] if old in saved else ""
            connection.execute("DELETE FROM locations WHERE name IN (?, ?)", (old, new))
            connection.execute("INSERT INTO locations (name, image, code) VALUES (?, ?, ?)", (new, image_path(image), code))
            connection.execute("UPDATE items SET location = ? WHERE location = ?", (new, old))
        return jsonify(msg=f"Localização {new} guardada")
    except Exception as exc:
        return erro(str(exc), 500)


@app.delete("/api/locations")
def apagar_localizacao():
    if (denied := electronics_denied()):
        return denied
    # So apaga caixas vazias: os componentes nunca ficam sem sitio por engano.
    if STORAGE_MODE != "local":
        return erro("A edição está disponível no modo local")
    name = (request.get_json(silent=True) or {}).get("name")
    if not isinstance(name, str) or not name.strip():
        return erro("Indica a localização")
    name = name.strip()
    try:
        init_db()
        with EXCEL_LOCK, db_connection() as connection:
            if connection.execute("SELECT 1 FROM items WHERE location = ? LIMIT 1", (name,)).fetchone():
                return erro(f"{name} ainda tem componentes. Move-os antes de apagar.", 409)
            connection.execute("DELETE FROM locations WHERE name = ?", (name,))
        return jsonify(msg=f"Localização {name} apagada")
    except Exception as exc:
        return erro(str(exc), 500)


@app.post("/api/labels")
def guardar_etiqueta():
    # Sem id cria uma etiqueta nova; com id substitui a guardada.
    if STORAGE_MODE != "local":
        return erro("A edição está disponível no modo local")
    data = request.get_json(silent=True) or {}
    # {"labels": [...]} cria várias de uma vez (ex.: parafusos de vários tamanhos): ou ficam todas ou nenhuma.
    batch = data.get("labels")
    if batch is not None:
        if not isinstance(batch, list) or not 1 <= len(batch) <= 100 or not all(isinstance(entry, dict) for entry in batch):
            return erro("Envia entre 1 e 100 etiquetas")
        try:
            labels = [label_from_json(entry) for entry in batch]
        except ValueError as exc:
            return erro(str(exc))
        try:
            init_db()
            with EXCEL_LOCK, db_connection() as connection:
                ids = [connection.execute("INSERT INTO labels (data) VALUES (?)", (json.dumps(label, ensure_ascii=False),)).lastrowid for label in labels]
            return jsonify(msg=f"{len(ids)} etiqueta(s) guardada(s)", ids=ids)
        except Exception as exc:
            return erro(str(exc), 500)
    label_id = data.get("id")
    if label_id is not None and (not isinstance(label_id, int) or isinstance(label_id, bool)):
        return erro("Etiqueta inválida")
    try:
        label = label_from_json(data)
    except ValueError as exc:
        return erro(str(exc))
    try:
        init_db()
        with EXCEL_LOCK, db_connection() as connection:
            stored = json.dumps(label, ensure_ascii=False)
            if label_id is None:
                label_id = connection.execute("INSERT INTO labels (data) VALUES (?)", (stored,)).lastrowid
            elif connection.execute("SELECT 1 FROM labels WHERE id = ?", (label_id,)).fetchone():
                connection.execute("UPDATE labels SET data = ? WHERE id = ?", (stored, label_id))
            else:
                return erro("Etiqueta não encontrada", 404)
        saved = f"Modelo {label['templateName']} guardado" if label.get("template") else f"Etiqueta {label['title'] or 'sem título'} guardada"
        return jsonify(msg=saved, id=label_id)
    except Exception as exc:
        return erro(str(exc), 500)


def label_movement(label_id, label):
    # Movimento sem quantidade (delta 0, nao reversivel); props e o que a pagina Movimentos mostra.
    props = {"Etiqueta": label.get("title") or "Sem título"}
    fields = " · ".join(f"{field['name']}: {field['value']}" for field in label.get("fields", []) if field.get("value"))
    if fields:
        props["Campos"] = fields
    if label.get("templateName"):
        props["Modelo"] = label["templateName"]
    return {"type": "label", "cat": "Etiquetas", "props": props, "delta": 0, "before": 0, "note": f"etiqueta #{label_id} apagada"}


@app.delete("/api/labels")
def apagar_etiquetas():
    # Apaga uma ou várias etiquetas de uma vez: {"ids": [1, 2, 3]}.
    if STORAGE_MODE != "local":
        return erro("A edição está disponível no modo local")
    ids = (request.get_json(silent=True) or {}).get("ids")
    if not isinstance(ids, list) or not 1 <= len(ids) <= 500 or not all(isinstance(label_id, int) and not isinstance(label_id, bool) for label_id in ids):
        return erro("Indica as etiquetas a apagar")
    try:
        init_db()
        with EXCEL_LOCK, db_connection() as connection:
            # Fica no historico de movimentos quem apagou e quais (titulo e campos), na mesma transacao.
            found = [row for label_id in ids if (row := connection.execute("SELECT id, data FROM labels WHERE id = ?", (label_id,)).fetchone())]
            record_movements(connection, [label_movement(row["id"], json.loads(row["data"])) for row in found])
            connection.executemany("DELETE FROM labels WHERE id = ?", [(label_id,) for label_id in ids])
        return jsonify(msg=f"{len(ids)} etiqueta(s) apagada(s)")
    except Exception as exc:
        return erro(str(exc), 500)


def pcb_project_owner(connection, project_id):
    # (existe, createdBy guardado); os projetos de antes desta regra nao tem dono.
    row = connection.execute("SELECT data FROM pcb_projects WHERE id = ?", (project_id,)).fetchone()
    return (True, json.loads(row["data"]).get("createdBy")) if row else (False, None)


def pcb_project_denied(exists, owner):
    # So quem criou o projeto (ou um admin) o muda ou apaga; um sem dono fica so para os admins.
    if not exists or g.person["admin"] or (owner or {}).get("id") == g.person["id"]:
        return None
    return erro("Só quem criou o projeto (ou um admin) o pode alterar", 403)


@app.get("/api/pcb-projects")
def projetos_pcb():
    # Publico como o stock: todos veem os projetos; o mais recente primeiro.
    try:
        init_db()
        with db_connection() as connection:
            projects = [json.loads(row["data"]) for row in connection.execute("SELECT data FROM pcb_projects")]
        return jsonify(projects=sorted(projects, key=lambda project: project.get("createdAt", ""), reverse=True))
    except Exception as exc:
        return erro(str(exc), 500)


@app.post("/api/pcb-projects")
def guardar_projetos_pcb():
    if (denied := electronics_denied()):
        return denied
    # {"projects": [...]}: cria ou substitui cada projeto pelo id. Varios de uma vez trazem os guardados no browser.
    if STORAGE_MODE != "local":
        return erro("A edição está disponível no modo local")
    batch = (request.get_json(silent=True) or {}).get("projects")
    if not isinstance(batch, list) or not 1 <= len(batch) <= 200 or not all(isinstance(entry, dict) for entry in batch):
        return erro("Envia entre 1 e 200 projetos")
    try:
        projects = [pcb_project_from_json(entry) for entry in batch]
    except ValueError as exc:
        return erro(str(exc))
    try:
        init_db()
        with EXCEL_LOCK, db_connection() as connection:
            saved = {project["id"]: pcb_project_owner(connection, project["id"]) for project in projects}
            # Verifica todos antes de escrever: ou ficam todos ou nenhum.
            for project in projects:
                if (denied := pcb_project_denied(*saved[project["id"]])):
                    return denied
            for project in projects:
                exists, owner = saved[project["id"]]
                # O dono vem do servidor, nunca do browser: quem cria fica dono.
                project["createdBy"] = owner if exists else {"id": g.person["id"], "name": g.person["name"]}
                if not project["createdBy"]:
                    del project["createdBy"]
                stored = json.dumps(project, ensure_ascii=False)
                if exists:
                    connection.execute("UPDATE pcb_projects SET data = ? WHERE id = ?", (stored, project["id"]))
                else:
                    connection.execute("INSERT INTO pcb_projects (id, data) VALUES (?, ?)", (project["id"], stored))
        return jsonify(msg=f"{len(projects)} projeto(s) guardado(s)", projects=projects)
    except Exception as exc:
        return erro(str(exc), 500)


@app.delete("/api/pcb-projects/<project_id>")
def apagar_projeto_pcb(project_id):
    if (denied := electronics_denied()):
        return denied
    if STORAGE_MODE != "local":
        return erro("A edição está disponível no modo local")
    try:
        init_db()
        with EXCEL_LOCK, db_connection() as connection:
            exists, owner = pcb_project_owner(connection, project_id)
            if (denied := pcb_project_denied(exists, owner)):
                return denied
            connection.execute("DELETE FROM pcb_projects WHERE id = ?", (project_id,))
        return jsonify(msg="Projeto apagado")
    except Exception as exc:
        return erro(str(exc), 500)


@app.post("/api/parts")
def guardar_peca():
    # Acrescenta ou corrige uma peca do catalogo. So os campos enviados mudam; o preco pode ficar vazio.
    if (denied := electronics_denied()):
        return denied
    data = request.get_json(silent=True) or {}
    mpn = str(data.get("mpn", "")).strip()
    if not mpn or mpn == "-":
        return erro("Indica o P/N da peça")
    changes = {field: str(data[field]).strip() for field in ("manufacturer", "description", "category") if field in data}
    if "price" in data:
        if data["price"] in (None, ""):
            changes["price"] = None
        else:
            try:
                price = float(data["price"])
            except (TypeError, ValueError):
                price = -1.0
            # A comparacao tambem rejeita NaN e infinito.
            if not 0 <= price < 1_000_000:
                return erro("Indica um preço válido")
            changes["price"] = round(price, 4)
    try:
        existing = next((part for part in db_parts() if part["mpn"].casefold() == mpn.casefold()), None)
        base = existing or {"mpn": mpn, "manufacturer": "", "description": "", "category": "", "props": {}, "price": None}
        # A origem diz de onde veio o preco: so muda quando o preco muda (ou a peca e nova).
        source = f"editado à mão {datetime.now().date().isoformat()}" if "price" in changes or not existing else existing["source"]
        save_parts([{**base, **changes, "source": source}])
        return jsonify(msg="Peça guardada" if existing else "Peça adicionada ao catálogo")
    except Exception as exc:
        return erro(str(exc), 500)


# --- Dados da peca pelo P/N (APIs de pesquisa gratuitas da Mouser e da DigiKey) ------------------------------
MOUSER_API_KEY = os.getenv("MOUSER_API_KEY", "").strip()
DIGIKEY_CLIENT_ID = os.getenv("DIGIKEY_CLIENT_ID", "").strip()
DIGIKEY_CLIENT_SECRET = os.getenv("DIGIKEY_CLIENT_SECRET", "").strip()
DIGIKEY_TOKEN = {"value": "", "expires": 0.0}


def supplier_json(url, body=None, headers=None, form=None):
    data = urlencode(form).encode() if form else json.dumps(body).encode() if body is not None else None
    content_type = "application/x-www-form-urlencoded" if form else "application/json"
    supplier_request = urllib.request.Request(url, data=data, headers={"Content-Type": content_type, "Accept": "application/json", **(headers or {})})
    with urllib.request.urlopen(supplier_request, timeout=10) as response:
        return json.load(response)


def web_link(url):
    # So links http(s): o datasheet vira um href e a imagem e descarregada pelo servidor.
    url = str(url or "").strip()
    url = "https:" + url if url.startswith("//") else url
    return url if urlparse(url).scheme in {"http", "https"} else ""


def price_number(text):
    # "0,094 €", "1.234,56 €" ou "$0.10": o ultimo separador e o das casas decimais.
    digits = re.sub(r"[^\d.,]", "", str(text))
    if not re.search(r"\d", digits):
        return None
    cut = max(digits.rfind(","), digits.rfind("."))
    return float(re.sub(r"\D", "", digits[:cut]) + "." + digits[cut + 1:]) if cut >= 0 else float(digits)


def mouser_lookup(mpn):
    if not MOUSER_API_KEY:
        return None
    data = supplier_json(f"https://api.mouser.com/api/v1/search/partnumber?{urlencode({'apiKey': MOUSER_API_KEY})}",
                         {"SearchByPartRequest": {"mouserPartNumber": mpn, "partSearchOptions": "Exact"}})
    if data.get("Errors"):
        raise ValueError(data["Errors"][0].get("Message") or "erro da API")
    found = next((part for part in (data.get("SearchResults") or {}).get("Parts") or []
                  if str(part.get("ManufacturerPartNumber", "")).casefold() == mpn.casefold()), None)
    if not found:
        return None
    first_break = (found.get("PriceBreaks") or [{}])[0]
    price = price_number(first_break.get("Price", ""))
    if price is not None and first_break.get("Currency") != "EUR":
        price = round(price * USD_TO_EUR, 4) if first_break.get("Currency") == "USD" else None
    # A Mouser devolve HTML (anti-bot) a quem descarrega as imagens fora do browser, por isso a imagem vem da DigiKey.
    return {"supplier": "Mouser", "mpn": found["ManufacturerPartNumber"], "manufacturer": found.get("Manufacturer") or "",
            "description": found.get("Description") or "", "category": found.get("Category") or "", "price": price,
            "datasheet": web_link(found.get("DataSheetUrl")), "image": "", "parameters": {}}


def digikey_token():
    if time.time() >= DIGIKEY_TOKEN["expires"]:
        data = supplier_json("https://api.digikey.com/v1/oauth2/token", form={
            "client_id": DIGIKEY_CLIENT_ID, "client_secret": DIGIKEY_CLIENT_SECRET, "grant_type": "client_credentials"})
        DIGIKEY_TOKEN.update(value=data["access_token"], expires=time.time() + int(data.get("expires_in", 600)) - 60)
    return DIGIKEY_TOKEN["value"]


def digikey_lookup(mpn):
    if not (DIGIKEY_CLIENT_ID and DIGIKEY_CLIENT_SECRET):
        return None
    headers = {"Authorization": f"Bearer {digikey_token()}", "X-DIGIKEY-Client-Id": DIGIKEY_CLIENT_ID,
               "X-DIGIKEY-Locale-Site": "PT", "X-DIGIKEY-Locale-Language": "en", "X-DIGIKEY-Locale-Currency": "EUR"}
    data = supplier_json("https://api.digikey.com/products/v4/search/keyword", {"Keywords": mpn, "Limit": 10}, headers)
    products = [*(data.get("ExactMatches") or []), *(data.get("Products") or [])]
    found = next((part for part in products if str(part.get("ManufacturerProductNumber", "")).casefold() == mpn.casefold()), None)
    exact = found is not None
    if not found:
        # A DigiKey escreve alguns P/N de outra forma (Molex 43045-1625 -> 0430451625, JST sem "(LF)(SN)"): fica o P/N lido.
        found = next((part for part in products if mpn_key(part.get("ManufacturerProductNumber")) == mpn_key(mpn)), None)
    if not found:
        return None
    description = (found.get("Description") or {}).get("ProductDescription") or ""
    parameters = {parameter.get("ParameterText"): str(parameter.get("ValueText") or "") for parameter in found.get("Parameters") or []}
    if str((found.get("Category") or {}).get("Name", "")).startswith("Connectors"):
        parameters.update(digikey_mates(found["ManufacturerProductNumber"], description, headers))
    # A categoria vem em arvore ("Capacitors" > "Ceramic Capacitors"): guarda o caminho ate a folha.
    path, category = [], found.get("Category") or {}
    while category:
        path.append(category.get("Name") or "")
        category = (category.get("ChildCategories") or [None])[0]
    return {"supplier": "DigiKey", "mpn": found["ManufacturerProductNumber"] if exact else mpn,
            "manufacturer": (found.get("Manufacturer") or {}).get("Name") or "", "description": description,
            "category": " > ".join(path), "price": found.get("UnitPrice") or None,
            "datasheet": web_link(found.get("DatasheetUrl")), "image": web_link(found.get("PhotoUrl")), "parameters": parameters}


def mpn_key(text):
    # P/N sem separadores, zeros a esquerda nem sufixos entre parenteses: 0430451625 == 43045-1625, S2B-XH-A-1(LF)(SN) == S2B-XH-A-1.
    return re.sub(r"[^0-9a-z]", "", re.sub(r"\(.*?\)", "", str(text).casefold())).lstrip("0")


def digikey_associations(product, headers):
    try:
        data = supplier_json(f"https://api.digikey.com/products/v4/search/{quote(product, safe='')}/associations", headers=headers)
    except (OSError, ValueError):
        return {}   # sem associacoes o resto da pesquisa continua a servir
    return data.get("ProductAssociations") or {}


def digikey_crimp(associations):
    """Crimp de uma housing: um que ja esta no catalogo (escrito como la esta), senao o primeiro estanhado da DigiKey."""
    crimps = [(str(part.get("ManufacturerProductNumber")), str(part.get("Description")).upper())
              for part in associations.get("AssociatedProducts") or [] if "CRIMP" in str(part.get("Description")).upper()]
    if not crimps:
        return ""
    catalog = {mpn_key(part["mpn"]): part["mpn"] for part in db_parts()}
    return next((catalog[mpn_key(pn)] for pn, _ in crimps if mpn_key(pn) in catalog), "") or \
        next((pn for pn, text in crimps if "TIN" in text), crimps[0][0])


def digikey_mates(product, description, headers):
    """Num conector: a peca que encaixa (header -> housing, housing -> header) e os crimps da housing."""
    housing = bool(re.search(r"\bHSG\b|HOUSING", description.upper()))
    associations = digikey_associations(product, headers)
    # As associacoes trazem tambem cabos, colunas e fontes: so serve o outro lado do conector.
    want = "HEADER" if housing else "HSG"
    mate = next((str(part.get("ManufacturerProductNumber")) for part in associations.get("MatingProducts") or []
                 if re.search(rf"\b{want}\b", str(part.get("Description")).upper())), "")
    if housing:
        return {"Mating Part": mate, "Crimp Part": digikey_crimp(associations)}
    return {"Mating Part": mate, "Mate Crimp Part": digikey_crimp(digikey_associations(mate, headers)) if mate else ""}


@app.get("/api/parts/lookup")
def procurar_peca():
    # Depois de ler uma etiqueta: descricao, categoria, datasheet, imagem e preco atual pelo P/N, guardados no catalogo.
    # E GET para o bloqueio de escrita nao ficar preso durante os pedidos as APIs; por isso o login e verificado aqui.
    g.person = current_person()
    if g.person is None:
        return jsonify(error="Inicia sessão para procurar a peça", login=True), 401
    # A peca encontrada fica no catalogo: mesma regra que mudar o stock.
    if (denied := electronics_denied()):
        return denied
    mpn = request.args.get("mpn", "").strip()
    if not mpn or mpn == "-" or len(mpn) > 100:
        return erro("Indica o P/N da peça")
    if not (MOUSER_API_KEY or DIGIKEY_CLIENT_ID):
        return erro("Configura MOUSER_API_KEY ou DIGIKEY_CLIENT_ID no servidor", 501)
    found, failures = [], []
    for lookup in (mouser_lookup, digikey_lookup):
        try:
            result = lookup(mpn)
        except (OSError, ValueError, KeyError) as exc:
            failures.append(f"{lookup.__name__.split('_')[0].title()}: {exc}")
            continue
        if result:
            found.append(result)
    if not found:
        return erro("; ".join(failures), 502) if failures else erro("P/N não encontrado na Mouser nem na DigiKey", 404)
    # Cada campo vem do primeiro fornecedor que o tem (a Mouser primeiro).
    first = lambda field: next((result[field] for result in found if result[field]), "")
    priced = next((result for result in found if result["price"]), None)
    text = f"{first('description')} {' '.join(result['category'] for result in found)}"
    category, props = stock_fields(found[0]["mpn"], text)
    category = category or catalog_category(text)
    # Os parametros da DigiKey preenchem as propriedades da categoria; o que falta fica do texto da descricao.
    digikey = next((result for result in found if result["parameters"]), None)
    if digikey:
        props.update(digikey_props(category, digikey["parameters"], digikey["category"]))
    part = {"mpn": found[0]["mpn"], "manufacturer": first("manufacturer"), "description": first("description"),
            "category": category, "props": props, "datasheet": first("datasheet"),
            "price": round(float(priced["price"]), 4) if priced else None,
            "source": f"{priced['supplier']} API {datetime.now().date().isoformat()}" if priced else ""}
    try:
        with EXCEL_LOCK:
            existing = next((current for current in db_parts() if current["mpn"].casefold() == mpn.casefold()), None)
            if existing:
                # O que ja esta no catalogo (carrinhos, edicoes a mao) fica; da API vem o preco atual e o que faltava.
                part.update({field: existing[field] for field in ("mpn", "manufacturer", "description", "category") if existing[field]})
                part["props"] = {**part["props"], **{key: value for key, value in existing["props"].items() if value and value != "-"}}
                part["datasheet"] = part["datasheet"] or existing["datasheet"]
                if part["price"] is None:
                    part["price"], part["source"] = existing["price"], existing["source"]
            save_parts([part])
    except Exception as exc:
        return erro(str(exc), 500)
    return jsonify(part=part, image=first("image"))


def descendant_ids(connection, category_id):
    children = {}
    for row in connection.execute("SELECT id, parent_id FROM categories"):
        children.setdefault(row["parent_id"], []).append(row["id"])
    found, stack = [], [category_id]
    while stack:
        for child in children.get(stack.pop(), []):
            if child not in found:
                found.append(child)
                stack.append(child)
    return found


def resolve_parent(connection, parent, section, own_id=None):
    # Devolve (id da categoria-mãe, erro). A filha fica sempre na secção da mãe.
    if not parent:
        return None, None
    row = connection.execute("SELECT id, section FROM categories WHERE name = ? COLLATE NOCASE", (str(parent),)).fetchone()
    if row is None:
        return None, "Categoria-mãe não encontrada"
    if own_id is not None and (row["id"] == own_id or row["id"] in descendant_ids(connection, own_id)):
        return None, "Uma categoria não pode ficar dentro de si própria"
    if row["section"] != section:
        return None, "Uma subcategoria fica na secção da categoria-mãe"
    return row["id"], None


@app.patch("/api/categories/<path:original_name>")
def editar_categoria(original_name):
    if STORAGE_MODE != "local":
        return erro("A edição está disponível no modo local")
    data = request.get_json(silent=True) or {}
    name = str(data.get("name", "")).strip()
    fields = data.get("fields")
    if not name or not isinstance(fields, list) or not fields:
        return erro("Indica o nome e pelo menos uma propriedade")
    if any(not isinstance(field, dict) or not isinstance(field.get("name"), str) or not field["name"].strip() for field in fields):
        return erro("Indica um nome para cada propriedade")
    names = [field["name"].strip() for field in fields]
    if len(set(names)) != len(names):
        return erro("Os nomes das propriedades não podem repetir-se")
    section = data.get("section", SECTIONS[0])
    if section not in SECTIONS:
        return erro("Secção desconhecida")
    if (denied := electronics_denied()):
        return denied
    try:
        init_db()
        with EXCEL_LOCK, db_connection() as connection:
            category = connection.execute("SELECT * FROM categories WHERE name = ? COLLATE NOCASE", (original_name,)).fetchone()
            if category is None:
                return erro("Categoria não encontrada", 404)
            parent_id, problem = resolve_parent(connection, data["parent"], section, category["id"]) if "parent" in data else (category["parent_id"], None)
            if problem:
                return erro(problem)
            old_names = json.loads(category["props"])
            sources = [field.get("source") for field in fields if field.get("source") is not None]
            if any(not isinstance(source, str) or source not in old_names for source in sources) or len(set(sources)) != len(sources):
                return erro("As propriedades foram alteradas. Atualiza a página e tenta novamente.")
            updates, keys = [], set()
            for item in connection.execute("SELECT * FROM items WHERE cat_id = ? ORDER BY id", (category["id"],)):
                old = json.loads(item["props"])
                props = {field["name"].strip(): old.get(field.get("source"), "") for field in fields}
                key = "|".join(norm(value) for value in props.values())
                if key in keys:
                    return erro("Esta alteração criaria componentes duplicados. Mantém uma propriedade que os distinga.", 409)
                keys.add(key)
                updates.append((json.dumps(props, ensure_ascii=False), key, item["id"]))
            connection.execute("UPDATE categories SET name = ?, props = ?, image_enabled = ?, section = ?, parent_id = ? WHERE id = ?",
                               (name, json.dumps(names, ensure_ascii=False), int(bool(data.get("image"))), section, parent_id, category["id"]))
            # As subcategorias mudam de secção com a mãe.
            for child_id in descendant_ids(connection, category["id"]):
                connection.execute("UPDATE categories SET section = ? WHERE id = ?", (section, child_id))
            # Temporary keys let fields be reordered without transient uniqueness collisions.
            for _, _, item_id in updates:
                connection.execute("UPDATE items SET `key` = ? WHERE id = ?", (uuid4().hex, item_id))
            connection.executemany("UPDATE items SET props = ?, `key` = ? WHERE id = ?", updates)
        return jsonify(msg="Categoria atualizada")
    except DB_INTEGRITY_ERRORS:
        return erro("Já existe uma categoria com esse nome", 409)
    except Exception as exc:
        return erro(str(exc), 500)


@app.post("/api/categories")
def nova_categoria():
    # POST /api/categories cria a configuracao de uma categoria para uso futuro.
    data = request.get_json(silent=True) or {}
    # strip remove espacos laterais; dict.fromkeys remove propriedades repetidas
    # mantendo a ordem original enviada pelo utilizador.
    name = str(data.get("name", "")).strip()
    props = list(dict.fromkeys(str(prop).strip() for prop in data.get("props", []) if str(prop).strip()))
    image_enabled = bool(data.get("image"))
    section = data.get("section", SECTIONS[0])
    if not name or not props:
        return erro("Indica o nome e pelo menos uma propriedade")
    if section not in SECTIONS:
        return erro("Secção desconhecida")
    if (denied := electronics_denied()):
        return denied
    try:
        init_db()
        if any(category["name"].casefold() == name.casefold() for category in db_categories()):
            return erro("Essa categoria já existe")
        with db_connection() as connection:
            parent_id, problem = resolve_parent(connection, data.get("parent"), section)
            if problem:
                return erro(problem)
            connection.execute(
                "INSERT INTO categories (name, props, image_enabled, section, parent_id) VALUES (?, ?, ?, ?, ?)",
                (name, json.dumps(props, ensure_ascii=False), int(image_enabled), section, parent_id),
            )
        return jsonify(msg="Categoria pronta para receber o primeiro item")
    except Exception as exc:
        return erro(str(exc), 500)


@app.delete("/api/categories/<name>")
def apagar_categoria(name):
    # DELETE /api/categories/<name> remove a categoria e, pela chave estrangeira,
    # os componentes ligados a ela; depois atualiza tambem o Excel.
    if (denied := electronics_denied()):
        return denied
    try:
        init_db()
        with db_connection() as connection:
            row = connection.execute(
                "SELECT id, name, parent_id FROM categories WHERE name = ? COLLATE NOCASE", (name,)
            ).fetchone()
            if not row:
                return erro("Categoria não encontrada", 404)
            removed = connection.execute(
                "SELECT id, props, qty FROM items WHERE cat_id = ?", (row["id"],)
            ).fetchall()
            n_itens = len(removed)
            record_movements(connection, [{"type": "delete", "item_id": item["id"], "cat": row["name"], "props": json.loads(item["props"]),
                                           "delta": -item["qty"], "before": item["qty"]} for item in removed])
            # As subcategorias e o seu stock ficam: sobem um nível.
            connection.execute("UPDATE categories SET parent_id = ? WHERE parent_id = ?", (row["parent_id"], row["id"]))
            connection.execute("DELETE FROM categories WHERE id = ?", (row["id"],))
        # read_items obtem os restantes itens e save_items reconstrui as folhas,
        # deixando de criar a folha da categoria apagada.
        # sincroniza a base de dados (já sem a categoria/itens) com o Excel
        _, _, _, items = read_items()
        save_items(items)
        msg = "Categoria apagada"
        if n_itens:
            msg += f" com {n_itens} referência(s)"
        return jsonify(msg=msg)
    except Exception as exc:
        return erro(str(exc), 500)


# --- Leitura do texto de etiquetas (OCR) -------------------------------------------------------------
# Etiquetas sem codigo 2D com o P/N (Comkey, fabricantes chineses...) so se leem pelo texto. O Tesseract corre
# no servidor (apt install tesseract-ocr) e o P/N lido, quase sempre com erros, e comparado com o catalogo.
OCR_CONFUSABLES = str.maketrans("OIL", "011")


def ocr_key(text):
    # Chave tolerante a confusoes tipicas do OCR (O/0, I/L/1) e a pontuacao.
    return re.sub(r"[^A-Z0-9]", "", str(text).upper()).translate(OCR_CONFUSABLES)


def edit_distance_at_most_one(a, b):
    if abs(len(a) - len(b)) > 1:
        return False
    i = j = edits = 0
    while i < len(a) and j < len(b):
        if a[i] == b[j]:
            i += 1
            j += 1
            continue
        edits += 1
        if edits > 1:
            return False
        if len(a) == len(b):
            i += 1
            j += 1
        elif len(a) > len(b):
            i += 1
        else:
            j += 1
    return edits + (len(a) - i) + (len(b) - j) <= 1


def match_label_text(text, parts):
    # Procura no texto lido um P/N do catalogo (com tolerancia a erros e a leituras parciais) e a quantidade.
    tokens = [token for token in re.split(r"[\s:;,|]+", text) if token]
    # P/N impressos em grupos (Würth: "150 060 GS5 504 0") chegam partidos: junta ate 5 pedacos seguidos.
    candidates = {ocr_key("".join(tokens[i:i + size])) for size in range(1, 6) for i in range(len(tokens) - size + 1)}
    candidates = [c for c in candidates if len(c) >= 8 and re.search(r"\d", c) and re.search(r"[A-Z]", c)]
    best = None
    for part in parts:
        key = ocr_key(re.sub(r"\s*\(.*\)\s*$", "", part["mpn"]))
        if len(key) < 6:
            continue
        for candidate in candidates:
            exact = candidate == key
            if exact or candidate in key or key in candidate or edit_distance_at_most_one(candidate, key):
                rank = (0 if exact else 1, -len(candidate))
                if best is None or rank < best[0]:
                    best = (rank, part)
    qty_match = re.search(r"(\d{1,6})\s*P[a-z]s\b", text, re.I) or re.search(r"qty\W{0,4}(\d{1,6})", text, re.I)
    if best:
        label = {"mpn": best[1]["mpn"], "manufacturer": best[1]["manufacturer"] or ""}
    else:
        # Sem catalogo: "FABRICANTE:P/N" como nas etiquetas Comkey.
        # Os rotulos da propria etiqueta ("Ref. do Fabricante:", "MPN:") nao sao o nome do fabricante.
        # Nem os distribuidores (o numero deles nao e o P/N do fabricante).
        labels = {"fabricante", "manufacturer", "mfr", "mpn", "part", "ref", "pn", "referencia", "model", "modelo", "qty", "quantity",
                  "mouser", "digikey", "farnell", "rs", "lcsc", "tme"}
        found = next((match for match in re.finditer(r"\b([A-Za-z][A-Za-z.&]{2,14}):\s*([A-Za-z0-9][A-Za-z0-9\-/.+]{5,})", text)
                      if match.group(1).lower().strip(".") not in labels
                      and len(ocr_key(match.group(2))) >= 8
                      and re.search(r"\d", match.group(2)) and re.search(r"[A-Za-z]", match.group(2))), None)
        if not found:
            return None
        # "CPN:" (etiquetas ST) e o rotulo do P/N, nao um fabricante.
        manufacturer = "" if found.group(1).lower() == "cpn" else found.group(1).title()
        label = {"mpn": found.group(2).upper(), "manufacturer": manufacturer}
    if qty_match:
        label["qty"] = int(qty_match.group(1))
    return {**label, "ocr": True}


def ocr_image_text(image_bytes):
    # 1) Le a imagem nas 4 orientacoes e escolhe as 2 que o Tesseract le com mais confianca;
    # 2) nessas, repete com outros modos de segmentacao (6, 4, 12), que apanham o P/N quando o modo
    #    de texto solto falha (codigos de barras ao lado, imagens desfocadas). Tudo em paralelo.
    image = ImageOps.autocontrast(ImageOps.exif_transpose(Image.open(BytesIO(image_bytes))).convert("L"))
    scale = 1800 / max(image.size)
    if scale > 1:
        image = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS)
    # Uma thread por processo: correm varios em paralelo e o Tesseract ja usa OpenMP por si.
    env = {**os.environ, "OMP_THREAD_LIMIT": "1"}

    def tesseract(rotation, psm, output):
        with tempfile.NamedTemporaryFile(suffix=".png") as handle:
            image.rotate(rotation, expand=True).save(handle.name)
            return subprocess.run(["tesseract", handle.name, "-", "--psm", str(psm), "-l", "eng", *output],
                                  capture_output=True, text=True, timeout=25, env=env).stdout

    def sparse(rotation):
        words = []
        for row in csv.DictReader(tesseract(rotation, 11, ["tsv"]).splitlines(), delimiter="\t", quoting=csv.QUOTE_NONE):
            word = (row.get("text") or "").strip()
            try:
                confidence = float(row.get("conf", -1))
            except ValueError:
                confidence = -1
            if word and confidence >= 0:
                words.append((word, confidence))
        score = sum(c * len(w) for w, c in words if c > 60 and len(w) >= 3 and re.search(r"[A-Za-z0-9]", w))
        return score, rotation, " ".join(w for w, c in words if c > 30)

    with ThreadPoolExecutor(max_workers=4) as pool:
        first = sorted(pool.map(sparse, (0, 90, 180, 270)), key=lambda result: -result[0])[:2]
        more = pool.map(lambda job: tesseract(job[0], job[1], []), [(rotation, psm) for _, rotation, _ in first for psm in (6, 4, 12)])
        return "\n".join([text for _, _, text in first] + list(more))


@app.post("/api/ocr")
def ler_etiqueta_texto():
    # Recebe uma fotografia da etiqueta e devolve o P/N reconhecido (ou null) e o texto lido.
    image = request.files.get("image")
    if image is None:
        return erro("Envia uma imagem")
    try:
        text = ocr_image_text(image.read())
    except (UnidentifiedImageError, OSError):
        return erro("O ficheiro enviado não é uma imagem válida")
    except FileNotFoundError:
        return erro("O reconhecimento de texto não está instalado no servidor", 501)
    except subprocess.TimeoutExpired:
        return erro("A leitura do texto demorou demasiado. Tenta com uma imagem mais pequena.", 504)
    return jsonify(label=match_label_text(text, db_parts()), text=text)


PURCHASES_DIR = Path(os.getenv("PURCHASES_DIR", BASE_DIR.parent / "data" / "compras"))
purchases_signature = None


def refresh_purchases():
    # Rele a pasta so quando algum ficheiro mudou (nome, tamanho ou data); a leitura completa demora ~7 s.
    global purchases_signature
    files = sorted((str(path), stat.st_size, stat.st_mtime) for path in PURCHASES_DIR.rglob("*") if path.is_file() and (stat := path.stat()))
    if files == purchases_signature:
        return
    rows, problems = load_folder(PURCHASES_DIR)
    for problem in problems:
        print(f"Batches: {problem}", file=sys.stderr)
    with db_connection() as connection:
        connection.execute("DELETE FROM purchases")
        connection.executemany("INSERT INTO purchases (data) VALUES (?)", [(json.dumps(row, ensure_ascii=False, default=str),) for row in rows])
    purchases_signature = files


def purchases_denied():
    # Precos, fornecedores e contactos: so admins, Board e lideres de departamento (cargo vindo do Notion). O 401 abre o popup de login.
    person = current_person()
    if person is None:
        return jsonify(error="Inicia sessão para ver as compras", login=True), 401
    if not (person["admin"] or person["role"] in ("Board", "Department Leader")):
        return erro("Só admins, Board e líderes de departamento podem ver as compras", 403)
    return None


@app.get("/api/purchases")
def compras():
    if denied := purchases_denied():
        return denied
    try:
        init_db()
        refresh_purchases()
        with db_connection() as connection:
            rows = connection.execute("SELECT data FROM purchases ORDER BY id").fetchall()
        return jsonify(purchases=[json.loads(row["data"]) for row in rows])
    except Exception as exc:
        return erro(str(exc), 500)


@app.get("/api/purchases/files/<path:name>")
def compra_ficheiro(name):
    if denied := purchases_denied():
        return denied
    return send_from_directory(PURCHASES_DIR, name)


@app.get("/api/movements")
def movimentos():
    # Historico publico, do mais recente para o mais antigo.
    try:
        init_db()
        with db_connection() as connection:
            # shortcut: so os ultimos 1000 movimentos; paginar quando o historico crescer.
            rows = connection.execute("SELECT * FROM movements ORDER BY id DESC LIMIT 1000").fetchall()
            reverted = {row["reverts"] for row in connection.execute("SELECT reverts FROM movements WHERE reverts IS NOT NULL")}
        return jsonify(movements=[{
            "id": row["id"], "ts": row["ts"], "person": row["person"], "type": row["type"], "item_id": row["item_id"],
            "cat": row["cat"], "props": json.loads(row["props"]), "delta": row["delta"],
            "before": row["before_qty"], "after": row["after_qty"], "note": row["note"], "reverted": row["id"] in reverted,
        } for row in rows])
    except Exception as exc:
        return erro(str(exc), 500)


@app.post("/api/movements/revert")
def reverter_movimentos():
    # So admins: desfaz a quantidade de cada movimento escolhido, do mais recente para o mais antigo.
    # Um item apagado volta a existir (sem imagem nem localizacao, que o historico nao guarda).
    if not g.person["admin"]:
        return erro("Só um admin pode reverter movimentos", 403)
    ids = (request.get_json(silent=True) or {}).get("ids")
    if not isinstance(ids, list) or not ids or not all(type(i) is int for i in ids):
        return erro("Escolhe os movimentos a reverter")
    ids = sorted(set(ids), reverse=True)
    try:
        init_db()
        marks = ", ".join("?" * len(ids))
        with db_connection() as connection:
            rows = connection.execute(f"SELECT * FROM movements WHERE id IN ({marks}) ORDER BY id DESC", ids).fetchall()
            done = connection.execute(f"SELECT 1 FROM movements WHERE reverts IN ({marks})", ids).fetchone()
        if len(rows) != len(ids):
            return erro("Movimento não encontrado", 404)
        if done:
            return erro("Algum dos movimentos escolhidos já foi revertido", 409)
        _, _, _, items = read_items()
        movements = []
        for row in rows:
            props = json.loads(row["props"])
            # O item identifica-se pela categoria e propriedades: os ids podem ser reutilizados depois de apagar.
            item = next((current for current in items if current["cat"] == row["cat"]
                         and all(norm(current["props"].get(name, "")) == norm(value) for name, value in props.items())), None)
            before = item["qty"] if item else 0
            if item:
                item["qty"] = max(0, before - row["delta"])
            elif row["delta"] < 0:
                taken = {current["id"] for current in items}
                item = {"id": row["item_id"] if row["item_id"] and row["item_id"] not in taken else max(taken, default=0) + 1,
                        "cat": row["cat"], "props": props, "qty": -row["delta"], "image": "", "location": ""}
                items.append(item)
            if item and item["qty"] != before:
                movements.append({"type": "revert", "item_id": item["id"], "cat": row["cat"], "props": item["props"],
                                  "delta": item["qty"] - before, "before": before, "note": f"Reverte #{row['id']}", "reverts": row["id"]})
        save_items(items, movements)
        return jsonify(msg=f"{len(movements)} movimento(s) revertido(s)")
    except Exception as exc:
        return erro(str(exc), 500)


# PIN (desativado: o login e so com Notion). Descomentar os blocos marcados PIN para voltar a ativar.
# @app.get("/api/auth/people")
# def pessoas_login():
#     # Nomes para o popup de login; so aparecem pessoas com PIN definido.
#     try:
#         init_db()
#         with db_connection() as connection:
#             rows = connection.execute("SELECT id, name FROM people WHERE pin_hash <> '' ORDER BY name").fetchall()
#         return jsonify(people=[{"id": row["id"], "name": row["name"]} for row in rows])
#     except Exception as exc:
#         return erro(str(exc), 500)
#
#
# @app.post("/api/auth/login")
# def login():
#     data = request.get_json(silent=True) or {}
#     person_id, pin = data.get("person_id"), str(data.get("pin", "")).strip().upper()
#     if type(person_id) is not int:
#         return erro("Escolhe a tua pessoa")
#     fails, until = LOGIN_ATTEMPTS.get(person_id, (0, 0))
#     if until > time.time():
#         return erro("Demasiadas tentativas. Espera alguns minutos e tenta outra vez.", 429)
#     try:
#         init_db()
#         with db_connection() as connection:
#             row = connection.execute("SELECT id, pin_hash FROM people WHERE id = ?", (person_id,)).fetchone()
#     except Exception as exc:
#         return erro(str(exc), 500)
#     if not row or not row["pin_hash"] or not check_password_hash(row["pin_hash"], pin):
#         # 5 falhas seguidas bloqueiam essa pessoa durante 5 minutos.
#         LOGIN_ATTEMPTS[person_id] = (0, time.time() + 300) if fails + 1 >= 5 else (fails + 1, 0)
#         return erro("PIN errado", 401)
#     LOGIN_ATTEMPTS.pop(person_id, None)
#     start_session(row["id"])
#     return jsonify(msg="Sessão iniciada", user=current_person())


@app.get("/api/auth/me")
def me():
    # O site da cablagem (/harness/) so pergunta quem tem sessao, sem descarregar o stock.
    return jsonify(user=current_person())


@app.post("/api/auth/logout")
def logout():
    session.clear()
    return jsonify(msg="Sessão terminada")


def notion_redirect_uri():
    return f"{PUBLIC_BASE_URL or request.host_url.rstrip('/')}/api/auth/notion/callback"


def notion_page(message):
    # Pagina minima para erros do Notion, que chegam por redirecionamento e nao por fetch.
    return app.response_class(
        f'<!doctype html><meta charset="utf-8"><title>Stocklart</title><p>{message}</p><p><a href="/#/stock">Voltar ao Stocklart</a></p>',
        status=400, mimetype="text/html")


@app.get("/api/auth/notion")
def notion_login():
    if not NOTION_CLIENT_ID:
        return notion_page("O login com Notion não está configurado.")
    session["notion_state"] = uuid4().hex
    session["notion_next"] = "/#/settings" if request.args.get("next") == "settings" else "/#/stock"
    return redirect("https://api.notion.com/v1/oauth/authorize?" + urlencode({
        "client_id": NOTION_CLIENT_ID, "response_type": "code", "owner": "user",
        "redirect_uri": notion_redirect_uri(), "state": session["notion_state"],
    }))


@app.get("/api/auth/notion/callback")
def notion_callback():
    state = session.pop("notion_state", None)
    if not NOTION_CLIENT_ID or not state or request.args.get("state") != state or not request.args.get("code"):
        return notion_page("O login com Notion foi cancelado ou expirou. Tenta outra vez.")
    credentials = base64.b64encode(f"{NOTION_CLIENT_ID}:{NOTION_CLIENT_SECRET}".encode()).decode()
    token_request = urllib.request.Request(
        "https://api.notion.com/v1/oauth/token",
        data=json.dumps({"grant_type": "authorization_code", "code": request.args["code"], "redirect_uri": notion_redirect_uri()}).encode(),
        headers={"Authorization": f"Basic {credentials}", "Content-Type": "application/json", "Notion-Version": "2022-06-28"},
    )
    try:
        # So precisamos da identidade; o token de acesso do Notion e descartado.
        with urllib.request.urlopen(token_request, timeout=10) as response:
            token = json.load(response)
        notion_user = token["owner"]["user"]
        notion_id = str(notion_user["id"])
    except (OSError, ValueError, KeyError, TypeError):
        return notion_page("O Notion não confirmou o login. Tenta outra vez.")
    from_workspace = bool(NOTION_WORKSPACE_ID) and str(token.get("workspace_id", "")).replace("-", "").lower() == NOTION_WORKSPACE_ID
    init_db()
    with db_connection() as connection:
        row = connection.execute("SELECT id FROM people WHERE notion_id = ?", (notion_id,)).fetchone()
        # PIN: quem ja entrou com PIN liga a sua conta Notion uma vez; depois entra so com o Notion.
        # PIN: linked = session.get("person_id")
        # PIN: if row is None and linked is not None and connection.execute("SELECT 1 FROM people WHERE id = ? AND notion_id IS NULL", (linked,)).fetchone():
        # PIN:     connection.execute("UPDATE people SET notion_id = ? WHERE id = ?", (notion_id, linked))
        # PIN:     row = {"id": linked}
        if row is None and from_workspace:
            # Primeiro login de alguem do workspace LART: entra como pessoa normal (um admin pode apagar).
            name = str(notion_user.get("name") or "").strip() or "Sem nome"
            if connection.execute("SELECT 1 FROM people WHERE name = ? COLLATE NOCASE", (name,)).fetchone():
                name = f"{name} ({notion_id[-4:]})"  # outra conta Notion com o mesmo nome
            row = {"id": connection.execute("INSERT INTO people (name, notion_id) VALUES (?, ?)", (name, notion_id)).lastrowid}
        if row is not None:
            # Foto do perfil Notion para o menu da sessao; so URLs https, atualizada a cada login.
            avatar = str(notion_user.get("avatar_url") or "")
            connection.execute("UPDATE people SET avatar = ? WHERE id = ?", (avatar[:1000] if avatar.startswith("https://") else "", row["id"]))
    if row is None:
        return notion_page("Esta conta Notion não está na lista do Stocklart. Entra outra vez e escolhe o workspace LART no ecrã do Notion.")
    next_page = session.get("notion_next", "/#/stock")
    start_session(row["id"])
    return redirect(next_page)


def require_admin():
    person = current_person()
    return None if person and person["admin"] else erro("Só um admin pode gerir pessoas", 403)


# def valid_pin(data):
#     pin = str(data.get("pin", "")).strip()
#     return pin.upper() if PIN_RE.fullmatch(pin) else None


@app.get("/api/people")
def listar_pessoas():
    if (denied := require_admin()):
        return denied
    with db_connection() as connection:
        rows = connection.execute("SELECT id, name, pin_hash, notion_id, is_admin, role, department, notion_sync FROM people ORDER BY name").fetchall()
    return jsonify(people=[{"id": row["id"], "name": row["name"], "admin": bool(row["is_admin"]), "role": row["role"], "department": row["department"],
                            "manual": not row["notion_sync"], "pin": bool(row["pin_hash"]), "notion": bool(row["notion_id"])} for row in rows],
                   roles=ROLES, departments=DEPARTMENTS)


# PIN: sem PIN, as pessoas novas entram sozinhas pelo Notion (ver notion_callback).
# @app.post("/api/people")
# def nova_pessoa():
#     if (denied := require_admin()):
#         return denied
#     data = request.get_json(silent=True) or {}
#     name, pin = str(data.get("name", "")).strip(), valid_pin(data)
#     if not name or not pin:
#         return erro("Indica o nome e um PIN de 4 letras ou números")
#     try:
#         with db_connection() as connection:
#             connection.execute("INSERT INTO people (name, pin_hash, is_admin) VALUES (?, ?, ?)",
#                                (name, generate_password_hash(pin), int(bool(data.get("admin")))))
#         return jsonify(msg="Pessoa adicionada")
#     except DB_INTEGRITY_ERRORS:
#         return erro("Já existe uma pessoa com esse nome", 409)
#     except Exception as exc:
#         return erro(str(exc), 500)


@app.patch("/api/people/<int:person_id>")
def editar_pessoa(person_id):
    if (denied := require_admin()):
        return denied
    data = request.get_json(silent=True) or {}
    updates = {}
    if "name" in data:
        updates["name"] = str(data["name"]).strip()
        if not updates["name"]:
            return erro("Indica o nome")
    # PIN: if "pin" in data:
    # PIN:     pin = valid_pin(data)
    # PIN:     if not pin:
    # PIN:         return erro("O PIN tem de ter 4 letras ou números")
    # PIN:     updates["pin_hash"] = generate_password_hash(pin)
    if "admin" in data:
        if person_id == g.person["id"] and not data["admin"]:
            return erro("Não podes retirar o teu próprio acesso de admin")
        updates["is_admin"] = int(bool(data["admin"]))
    if "role" in data:
        if data["role"] not in ROLES:
            return erro("Cargo desconhecido")
        updates["role"], updates["notion_sync"] = data["role"], 0
    if "departments" in data:
        chosen = data["departments"]
        if not isinstance(chosen, list) or any(department not in DEPARTMENTS for department in chosen):
            return erro("Departamento desconhecido")
        updates["department"], updates["notion_sync"] = ", ".join(d for d in DEPARTMENTS if d in chosen), 0
    if not updates:
        return erro("Nada para alterar")
    try:
        with db_connection() as connection:
            if connection.execute("SELECT 1 FROM people WHERE id = ?", (person_id,)).fetchone() is None:
                return erro("Pessoa não encontrada", 404)
            # As colunas vem da lista fixa acima; os valores seguem como parametros.
            connection.execute(f"UPDATE people SET {', '.join(f'{column} = ?' for column in updates)} WHERE id = ?",
                               (*updates.values(), person_id))
        return jsonify(msg="Pessoa atualizada")
    except DB_INTEGRITY_ERRORS:
        return erro("Já existe uma pessoa com esse nome", 409)
    except Exception as exc:
        return erro(str(exc), 500)


@app.delete("/api/people/<int:person_id>")
def apagar_pessoa(person_id):
    if (denied := require_admin()):
        return denied
    if person_id == g.person["id"]:
        return erro("Não podes apagar a tua própria conta")
    with db_connection() as connection:
        if connection.execute("SELECT 1 FROM people WHERE id = ?", (person_id,)).fetchone() is None:
            return erro("Pessoa não encontrada", 404)
        # O historico guarda o nome, por isso os movimentos desta pessoa continuam legiveis.
        connection.execute("DELETE FROM people WHERE id = ?", (person_id,))
    return jsonify(msg="Pessoa apagada")


if __name__ == "__main__":
    # Este bloco nao corre quando o modulo e apenas importado por testes ou WSGI.
    if os.environ.get("WERKZEUG_RUN_MAIN") in (None, "true"):
        # O reloader do Flask inicia o processo mais de uma vez; esta condicao
        # evita criar dois workers a sincronizar o mesmo Excel.
        start_excel_sync()
    # debug=True ativa recarregamento e mensagens detalhadas durante desenvolvimento;
    # host 0.0.0.0 aceita ligacoes locais na porta 5000.
    app.run(host="0.0.0.0", port=5000, debug=True)
