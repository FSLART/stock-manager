# Migrar Stocklart para MySQL no aaPanel

Esta migração requer **MySQL 8.0 ou 8.4** (testada com 8.4). Não usar
MySQL 5.x ou MariaDB: o esquema usa collations específicas do MySQL 8.
SQLite continua disponível e é o modo por defeito.

## 1. Preparar a base de dados

No aaPanel, instala MySQL e abre **Databases → MySQL → Add DB**.
Cria uma base **vazia**, por exemplo `stocklart`, com um utilizador dedicado,
password e charset `utf8mb4`. Escolhe **Local server** nas permissões quando
a aplicação corre no mesmo servidor. Para outro servidor, autoriza apenas
o IP da aplicação e configura a ligação e firewall correspondentes.

Referência: [documentação MySQL do aaPanel](https://www.aapanel.com/docs/Function/MySQL.html).

Instala as dependências na pasta do projeto, usando o Python do ambiente
virtual da aplicação:

```sh
.venv/bin/python -m pip install -r backend/requirements.txt
```

## 2. Configurar a ligação

Configura o ficheiro `.env` na raiz do projeto (usa `.env.example` como
modelo) com os nomes reais e a password criados pelo painel. O backend e
a migração carregam esse ficheiro automaticamente; variáveis já definidas
no servidor têm prioridade. O ficheiro `.env` é ignorado pelo Git.

Também podes definir as variáveis no ambiente do projeto Python no aaPanel
e no terminal onde vais executar a migração. Os valores abaixo são exemplos.

```sh
export DB_BACKEND=mysql
export STORAGE_MODE=local
export MYSQL_HOST=127.0.0.1
export MYSQL_PORT=3306
export MYSQL_DATABASE=stocklart
export MYSQL_USER=stocklart
read -rs -p 'MySQL password: ' MYSQL_PASSWORD
export MYSQL_PASSWORD
```

O comando `read` acima é para Bash. Em Zsh usa
`read -rs 'MYSQL_PASSWORD?MySQL password: '` e depois `export MYSQL_PASSWORD`.
Em ligações remotas com TLS, define também `MYSQL_SSL_CA` com o caminho
do certificado CA; o cliente verifica o certificado e o hostname.

Mantém `STORAGE_MODE=local`: aqui significa que a API usa a base de dados,
sem sincronizar automaticamente com Excel ou Google Sheets.

## 3. Copiar e verificar os dados

Para a aplicação antes de migrar, para que não haja alterações de stock
durante a transferência. Faz uma cópia de segurança de `data/stock.db` e
de `backend/uploads/`. Se migrares noutro servidor, transfere primeiro
uma cópia consistente da base SQLite e as imagens para esse servidor.

Executa na raiz do projeto, **antes de iniciar a aplicação com MySQL**:

```sh
.venv/bin/python scripts/migrate_mysql.py --source data/stock.db
```

O comando cria as tabelas, recusa qualquer destino com registos e copia
categorias, propriedades, IDs, quantidades, referências das imagens e
metadados. Verifica todos os valores copiados antes de confirmar a
transação. Fontes antigas sem `image` ou `image_enabled` recebem os
valores vazios correspondentes; se faltar a marca de inicialização, ela
é acrescentada para impedir a recriação de categorias padrão.

Em caso de falha, as linhas copiadas são revertidas; as tabelas vazias
podem permanecer e o comando pode ser repetido após corrigir o problema.
Depois de uma migração bem-sucedida, uma nova execução é recusada e não
substitui os dados existentes. O ficheiro SQLite é aberto apenas para leitura.

MySQL limita nomes de categorias a 255 caracteres e compara esses nomes
sem distinguir maiúsculas/minúsculas, incluindo Unicode. Nomes que
colidam nesse critério ou outros dados incompatíveis fazem falhar a
migração sem confirmar dados parciais.

Os ficheiros de imagens não estão na base de dados: copia
`backend/uploads/` ou configura `UPLOAD_DIR` para a pasta correspondente.
Dados de PCB/BOM, sinais, movimentos e preferências guardados apenas no
navegador não fazem parte desta migração.

## 4. Iniciar e confirmar

Inicia/reinicia o projeto Python com as variáveis do passo 2. Usa **um
worker** (por exemplo, Gunicorn `--workers 1`): as operações atuais de
stock usam um lock por processo e não suportam vários workers a escrever
ao mesmo tempo. Usa um servidor WSGI de produção, sem debug Flask.

Abre o inventário e confirma categorias, quantidades e imagens. Verifica
uma alteração de stock e o seu valor depois de recarregar a página.
As tabelas `categories`, `items` e `meta` aparecem no MySQL/phpMyAdmin
do aaPanel. Configura backups da base MySQL e da pasta de imagens.

## Reverter

Para a aplicação e volta a definir `DB_BACKEND=sqlite` e `DB_PATH` para
o ficheiro SQLite preservado; depois reinicia. A base original não contém
alterações feitas no MySQL depois da migração: faz backup dessas alterações
antes de reverter. Esta migração não faz transferência inversa.

## Testes da migração

`tests/test_mysql_storage.py` usa uma base MySQL **descartável** chamada
`stock_qa` em `127.0.0.1`, com utilizador `root` e password `stock-qa-only`.
O teste apaga as três tabelas dessa base. Nunca o apontes à base real.
Para o executar contra um servidor de testes na porta 13316:

```sh
MYSQL_TEST_PORT=13316 .venv/bin/python -m unittest discover -s tests -p test_mysql_storage.py -v
```
