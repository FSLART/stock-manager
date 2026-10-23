from unittest.mock import patch


def as_person(test, module, person=None):
    # Os testes de stock correm com uma pessoa em sessao; o login real e testado em test_auth.py.
    patcher = patch.object(module, 'current_person', return_value=person or {'id': 1, 'name': 'Tester', 'admin': True, 'notion': False})
    patcher.start()
    test.addCleanup(patcher.stop)
