# Stocklart · Stock de componentes

Interface em **Vue 3**, com componentes Single File (`.vue`) e Vite. A mesma
aplicação funciona com a API Flask e com o Google Apps Script.

## Design e páginas

O design usa tema escuro, amarelo LART,
menu responsivo e fotografias incluídas no HTML gerado. A página inicial mostra
o stock real e permite consultar o inventário, gerir categorias e adicionar material.

O menu inclui **Início**, **Inventário**, **Sinais de placas**, **Movimentos**,
**PCB e os seus BOMs** e **Definições**. A navegação usa fragmentos (`#/stock`,
`#/pcbs`, etc.), compatíveis com Flask e Apps Script sem configurar novas rotas
no servidor. O inventário mantém filtros, ordenação, edição e sincronização offline.

- **PCB/BOM**: importa CSV, BOM ou TXT separados por vírgulas ou ponto e vírgula,
  incluindo campos entre aspas e descrições com várias linhas. Aceita cabeçalhos
  usuais (Reference, Value, Quantity, MPN, Description, Footprint e equivalentes
  portugueses); sem cabeçalhos, espera referência, valor e quantidade. Guarda
  projetos e permite consultar os componentes e apagar projetos.
- **Sinais de placas**: guarda placa, sinal, tensão de referência, ligação e notas.
- **Movimentos**: histórico de entradas, saídas, ajustes e remoções feitos neste
  navegador desde esta atualização. Operações registadas offline têm essa indicação;
  este histórico não constitui um registo central do servidor.
- **Definições**: modo compacto do inventário e confirmações de alterações.
  Desativar confirmações mantém as mensagens de erro visíveis.

Projetos PCB, sinais, histórico e preferências usam armazenamento do navegador.
Não são partilhados entre dispositivos e não migram para a base de dados Flask.
O stock continua a usar a API e as chaves offline existentes. Erros ao guardar
os novos dados locais são apresentados, sem confirmar falsamente a gravação.

## Modo local (por defeito)

O Flask usa SQLite em `data/stock.db` e guarda imagens em
`backend/uploads/`. Não precisa de Google, credenciais ou ligação à Internet
para gerir o stock. Os registos locais existentes são preservados. Faz cópias de
segurança da base de dados e da pasta de imagens. `npm run dev:api` define
`DB_PATH` para essa base, exceto quando já existe um valor no ambiente.
O backend também usa esse caminho por defeito quando o Flask é iniciado
diretamente. `DB_PATH` permite escolher outra base de dados.

### MySQL no aaPanel

O backend também suporta **MySQL 8.0/8.4** com `DB_BACKEND=mysql` e as
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
