# Stocklart · Ferramentas da equipa LART

Interface em **Vue 3**, com componentes Single File (`.vue`) e Vite. A mesma
aplicação funciona com a API Flask e com o Google Apps Script.

## Design e páginas

O design usa o tema escuro e amarelo LART. A página inicial serve toda a equipa,
com recursos de oficina e ferramentas de engenharia.

A navegação agrupa **Inventário**, **Localizações**, **Etiquetas** e **Movimentos**
em **Recursos e oficina**; **Projetos PCB**, **Cablagem** e **Simulação analógica**
em **Engenharia**. **Compras e encomendas** aparece a administradores, Board e
líderes. As ligações usam fragmentos (`#/stock`, `#/pcbs`, etc.), com suporte para
novos separadores, teclado e aviso ao sair de uma etiqueta por guardar.
O inventário mantém filtros, ordenação, edição e sincronização offline.

- **PCB/BOM**: importa CSV, BOM ou TXT separados por vírgulas ou ponto e vírgula,
  incluindo campos entre aspas e descrições com várias linhas. Aceita cabeçalhos
  usuais (Reference, Value, Quantity, MPN, Description, Footprint e equivalentes
  portugueses); sem cabeçalhos, espera referência, valor e quantidade. Guarda
  projetos e permite consultar os componentes e apagar projetos.
- **Simulação analógica**: lista as placas analógicas com o modelo 3D e abre o emulador de cada uma (`board_emulation/`).
- **Movimentos**: histórico central, guardado no servidor (tabela `movements`), de
  entradas, saídas, ajustes e remoções, com a pessoa que fez cada alteração e
  pesquisa por pessoa, componente ou categoria.
- **Definições**: modo compacto do inventário e confirmações de alterações.
  Desativar confirmações mantém as mensagens de erro visíveis.

No servidor principal, os projetos PCB, BOMs, modelos STEP, etiquetas e localizações
são partilhados com a equipa. As preferências de interface ficam neste navegador.
O inventário apresenta 100 referências de cada vez e permite carregar mais.
O histórico filtra os últimos 1000 movimentos e apresenta-os em lotes de 100.
O estado indica dados em cache, alterações por sincronizar e erros de ligação.

## Modo local (por defeito)

O Flask usa SQLite em `data/stock.db` e guarda imagens em
`backend/uploads/`. Não precisa de Google, credenciais ou ligação à Internet
para gerir o stock. Os registos locais existentes são preservados. Faz cópias de
segurança da base de dados e da pasta de imagens. `npm run dev:api` define
`DB_PATH` para essa base, exceto quando já existe um valor no ambiente.
O backend também usa esse caminho por defeito quando o Flask é iniciado
diretamente. `DB_PATH` permite escolher outra base de dados.

### MySQL no aaPanel

O backend também suporta **MySQL 8.0/8.4 e MariaDB 10.11** com `DB_BACKEND=mysql` e as
variáveis `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER` e
`MYSQL_PASSWORD`. Para transferir os dados existentes, usa
`scripts/migrate_mysql.py`: verifica a cópia antes de confirmar e mantém
o ficheiro SQLite original. Segue o [guia de migração para aaPanel](docs/aapanel-mysql.md)
antes de iniciar a aplicação com MySQL. Mantém `STORAGE_MODE=local` e um
único worker de aplicação para escritas seguras.

O backend e o comando de migração carregam automaticamente o ficheiro `.env`
da raiz do projeto; variáveis já definidas no servidor têm prioridade.
Copia `.env.example` para `.env` e preenche `MYSQL_PASSWORD` com a password
criada no aaPanel. O ficheiro `.env` é ignorado pelo Git. Para usar SQLite,
define `DB_BACKEND=sqlite` nesse ficheiro ou no ambiente do processo.

`STORAGE_MODE` permite escolher `local` (valor por defeito), `excel` (sincronizar
com `Stock_sala.xlsx`) ou `google` (sincronizar com Google Sheets, requer
credenciais válidas). Em modo local não há sincronização automática com folhas
de cálculo. A implementação separada Apps Script continua a usar Google Sheets.

### Login e pessoas

Ver o stock é público. Qualquer alteração (entradas, saídas, edição, CSV, categorias,
imagens) exige sessão: sem sessão aparece um popup com **Entrar com Notion**. O login
usa a ligação OAuth "Stocklart" do Notion (`NOTION_CLIENT_ID` e `NOTION_CLIENT_SECRET`
no `.env`, redirect URI `https://stocklart.pt/api/auth/notion/callback`). Quem entra
pelo workspace `NOTION_WORKSPACE_ID` (LART) e ainda não está na lista é adicionado
automaticamente; contas de outros workspaces só entram se já estiverem na lista.
A sessão fica aberta até carregar em **Sair**.

Os admins gerem pessoas em **Definições → Pessoas** (cargo, departamentos,
dar ou tirar admin, apagar). O Notion confirma a identidade; o nome do perfil
não atribui permissões. Novas contas começam como Member sem departamento.
Atribuições automáticas antigas são removidas na inicialização e precisam de
revisão por um admin; as atribuições já feitas por um admin são preservadas.
Só Electronics e admins alteram stock, localizações e projetos PCB/BOM.
Além do departamento, editar ou apagar um projeto PCB exige ser o seu criador
ou admin. Pessoas de outros departamentos continuam a consultar os projetos.
Apagar uma pessoa mantém o nome nos movimentos já registados. O `.env` precisa de
`SECRET_KEY` (assina os cookies; mudá-lo termina todas as sessões) e de
`PUBLIC_BASE_URL`.

O login com PIN de 4 caracteres está desativado mas continua no código, comentado
com `PIN`, em `backend/app.py`, `LoginDialog.vue`, `PeopleAdmin.vue`, `SettingsPage.vue`
e `api.js`; para o voltar a ativar, descomenta esses blocos.

### Editar componentes e categorias

O stock aparece numa tabela compacta com colunas para as propriedades presentes
nos componentes. Clica num cabeçalho para ordenar; clica novamente para inverter
a ordem. Os painéis de filtros permitem pesquisar e selecionar vários valores
da mesma propriedade. Valores da mesma propriedade são alternativas; propriedades
diferentes, pesquisa, categoria, stock e imagens são combinados. Usa **Limpar
filtros** para voltar a todos os componentes. Em ecrãs estreitos, os painéis e a
tabela permitem deslocamento horizontal.

Componentes sem fotografia mostram um ícone padrão da categoria (resistências,
conectores, condensadores, LEDs, díodos, transístores, potenciómetros, indutores
e cristais), ou um ícone genérico para outras categorias. Os ícones estão
incluídos no HTML e funcionam offline; fotografias carregadas têm prioridade.
Os filtros de imagens continuam a distinguir componentes com e sem fotografia
própria. Os ícones são do [Tabler Icons](https://github.com/tabler/tabler-icons)
(licença MIT incluída em `frontend/src/assets/component-icons/LICENSE`), com um
símbolo original para transístores.

No servidor principal em modo local, usa **Editar** junto a um componente para
alterar as propriedades, a quantidade total ou a imagem. Sem selecionar outra
imagem, a atual é mantida; podes removê-la explicitamente.

Usa **Editar** junto a uma categoria para mudar o nome, permitir imagens ou
adicionar, renomear e remover propriedades. Renomear campos mantém os valores
dos componentes. A remoção de campos pede confirmação e alterações que tornem
dois componentes iguais são rejeitadas. Os controlos de edição só aparecem nas
implementações que suportam estas operações (servidor principal em modo local).

### Importar componentes por CSV

No **Inventário**, seleciona **Importar CSV**, escolhe o ficheiro e revê a
pré-visualização antes de confirmar. Disponível no servidor principal em modo
local; requer ligação online. Não é adicionado à fila offline.

O CSV deve ter `categoria`, `quantidade` e os nomes das propriedades configuradas
para cada categoria. Aceita vírgulas ou ponto e vírgula, UTF-8 (com ou sem BOM),
campos entre aspas e valores com quebras de linha. Quantidades devem ser inteiros
positivos. O botão **Descarregar modelo** fornece os cabeçalhos da categoria
selecionada (ou da primeira categoria), prontos para preencher. Por exemplo:

```csv
categoria;quantidade;cor;tamanho
LEDs;10;vermelho;5 mm
LEDs;20;azul;3 mm
```

Para misturar categorias, inclui as colunas necessárias para todas e deixa vazias
as propriedades que não pertencem à categoria da linha. Uma categoria desconhecida,
propriedade em falta ou quantidade inválida impede a importação completa.
Componentes com as mesmas propriedades somam quantidades e mantêm ID e imagem.
O servidor grava o lote numa única transação. Limites: 5 MB e 5000 linhas por CSV.

## Desenvolvimento

Requer Node.js 22.12+ ou 24+ e npm.

```sh
npm ci
npm run dev
```

Inicia também o servidor Flask na porta 5000. Na raiz do projeto, prepara o
ambiente Python uma vez:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.txt
```

No Windows, usa `python -m venv .venv` e
`.venv\Scripts\python.exe -m pip install -r backend/requirements.txt`.

Depois, mantém dois terminais abertos:

```sh
# Terminal 1: backend Flask
npm run dev:api
# Terminal 2: frontend Vue
npm run dev
```

O Vite encaminha `/api` e `/uploads` para o Flask; abre o endereço HTTP indicado
pelo Vite, não o ficheiro `index.html` diretamente. `ECONNREFUSED 127.0.0.1:5000`
significa que o backend não está iniciado.

## Build e testes

```sh
npm test
npm run build
npm run test:build
.venv/bin/python -m unittest discover -s tests -p test_local_storage.py -v
```

Edita `frontend/src/`, não os HTML gerados. O build inclui o runtime Vue, o
JavaScript e o CSS num único HTML, sem dependência de CDN para arrancar a app.
As fontes Google continuam opcionais, com fontes locais como alternativa.
O build atualiza:

- `backend/templates/index.html` — servidor principal;
- `apps_script/index.html` — implementação Google Apps Script;
- `dist/index.html` — artefacto local de build.

Os HTML gerados estão versionados para que o arranque habitual do Flask continue
a funcionar sem instalar Node.js no servidor. Para publicar no Apps Script,
copia o novo `apps_script/index.html` e o `Code.gs` existente para o projeto e
publica uma nova versão da aplicação web. O frontend deteta `google.script.run`
automaticamente; fora do Apps Script usa os endpoints HTTP do Flask.

## Estrutura

- `frontend/src/App.vue`: estado reativo, filtros, atualizações e movimentos;
- `frontend/src/components/`: lista de stock e formulários;
- `frontend/src/api.js`: transportes Flask/Apps Script, cache, fila offline e imagens;
- `frontend/src/style.css`: estilos e layout responsivo;
- `scripts/build.mjs`: build autónomo para ambas as plataformas;
- `tests/`: testes de componentes, APIs e compatibilidade offline.

Mantêm-se as chaves `stock.pending.v1` e `stock.data.v1`, incluindo o formato das
operações pendentes de cada implementação. Se o browser bloquear o armazenamento,
as operações online continuam disponíveis; as escritas offline apresentam erro
em vez de indicar falsamente que foram guardadas.

O backend Python continua responsável pelo SQLite, Excel, Google Sheets e
ficheiros carregados; o Apps Script continua responsável pela integração com
Sheets/Drive. As cópias antigas do código e o ZIP de origem foram removidos.
As bases de dados ficam em `data/` e não são versionadas; inclui essa pasta nas
cópias de segurança.

Para reverter a migração, restaura os ficheiros da revisão anterior com Git.
Não é necessária uma migração de dados.
