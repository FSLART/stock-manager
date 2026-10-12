import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class EnvConfigTest(unittest.TestCase):
    def test_project_env_loads_outside_project_and_environment_takes_priority(self):
        with tempfile.TemporaryDirectory() as temp:
            project = Path(temp)
            (project / 'backend').mkdir()
            shutil.copyfile(ROOT / 'backend/app.py', project / 'backend/app.py')
            (project / '.env').write_text(
                'DB_BACKEND=mysql\nSTORAGE_MODE=local\nMYSQL_DATABASE=stocklart\n'
                'MYSQL_USER=stocklart\nMYSQL_PASSWORD="literal${value}#password"\n'
                'MYSQL_PORT=3307\n', encoding='utf-8',
            )
            env = {key: value for key, value in os.environ.items()
                   if not key.startswith(('MYSQL_', 'DB_', 'STORAGE_MODE'))}
            probe = (
                'import importlib.util; '
                f'spec=importlib.util.spec_from_file_location("env_stock", {str(project / "backend/app.py")!r}); '
                'app=importlib.util.module_from_spec(spec); spec.loader.exec_module(app); '
                'assert app.DB_BACKEND == "mysql"; '
                'assert app.MYSQL_SETTINGS["database"] == "stocklart"; '
                'assert app.MYSQL_SETTINGS["port"] == 3307; '
                'assert app.MYSQL_SETTINGS["password"] == "literal${value}#password"'
            )
            result = subprocess.run([sys.executable, '-c', probe], env=env, cwd='/tmp', capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            probe = probe[:probe.index('assert app.DB_BACKEND')] + 'assert app.DB_BACKEND == "sqlite"'
            result = subprocess.run([sys.executable, '-c', probe], env={**env, 'DB_BACKEND': 'sqlite'},
                                    cwd='/tmp', capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
