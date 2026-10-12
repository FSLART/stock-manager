"""Opt-in API regression check against the configured MariaDB deployment."""
import os
import unittest


@unittest.skipUnless(os.getenv('MARIADB_DEPLOYMENT_TEST') == '1', 'requires configured MariaDB deployment')
class MariaDBDeploymentTest(unittest.TestCase):
    def test_inventory_api_loads_on_mariadb(self):
        from backend import app
        self.assertEqual(app.DB_BACKEND, 'mysql')
        with app.db_connection() as connection:
            self.assertIn('MariaDB', connection.execute('SELECT VERSION() AS version').fetchone()['version'])
        response = app.app.test_client().get('/api/data')
        self.assertEqual(response.status_code, 200, response.json)
        self.assertIsInstance(response.json, dict)


if __name__ == '__main__':
    unittest.main()
