# LART harness

Rastreabilidade e validação da cablagem do T26e — https://stocklart.pt/harness/

No git ficam só o código e `data/t26/std/` (o que o site já publica); `data/t26/legacy/` e `data/t26/model/` (CAD em bruto, 527 MB)
ficam só no servidor, em `/opt/lart-harness`.

- `data/t26/legacy/` — cópia da pasta Harness do OneDrive (uma pasta = um harness, Excels no formato antigo)
- `data/t26/std/` — um Excel standard por harness (`ACCU.xlsx`, `CAR.xlsx`, …) + `index.json` (lista, acoplamentos entre harnesses)
- `tools/migrate.py` — converte `legacy/` em `std/`. Lista de pastas, códigos e prefixos de interface no topo do ficheiro
- `tools/config_accu.py` — correções curadas do acumulador (Fase 1); os outros harnesses são migrados automaticamente e
  o que não bate certo fica na folha Issues de cada um
- `data/t26/std/model.glb` — modelo 3D (GLB comprimido com meshopt: `npx @gltf-transform/cli@4.5.1 meshopt in.glb model.glb`).
  Não usar `optimize`/`join`: os conectores ancoram-se aos nomes das peças
- `data/t26/std/positions.csv` — posição 3D dos conectores que não está no Excel: `harness,ref,anchor_3d,x_m,y_m,z_m,notes`
  (nome da peça do modelo OU x/y/z em metros). O modo pick do site gera estas linhas. Aceita `;` e vírgula decimal
- `data/t26/std/boards.json` — que conectores pertencem a que placa, para abrir o projeto no Altium 365
- `data/t26/std/layout.json` — disposição das fichas no diagrama 2D, por harness (colunas como estão no carro; nomes por expressão regular).
  As fichas que não estão na lista vão para a coluna com que partilham mais fios; as da lista que não existem no Excel aparecem a tracejado
- `data/t26/std/catalog.json` — fichas e crimps (lista da equipa no Notion · Connectors Harness + desenho do Handcart): que
  contacto leva cada ficha, por AWG, preço por unidade. O site escolhe o crimp de cada ponta a partir daqui
  (secção `photos`: foto do fabricante servida pela Digi-Key + página do produto; nada é copiado para o servidor)
- `tools/config_parts.py` — propõe P/N/género/crimp a cada metade (caixas: RTS7 fêmea / car harness: RTS6 macho;
  placas: Micro MATE-N-LOK pelo nº de pinos). Vai para o Excel como proposta (itálico laranja)
- `tools/config_drawings.py` — topologia transcrita dos PDFs RapidHarness (AD Box, Side Panel) e dados do desenho do Handcart
- Cada linha de Connectors é UMA ficha (metade do conector, coluna `gender` M/F): um conector = ficha macho + ficha fêmea,
  uma em cada harness, ou a outra é o header da placa
- `web/` — site (Vite + React + Mantine; three.js na página 3D). Regras do validador em `web/src/lib/validate.js`, trace em `web/src/lib/harness.js`

## Migrar outra vez (pasta Harness nova)

O `migrate.py` reescreve os `.xlsx` e o `index.json` de `std/`; não apagar a pasta (tem também `model.glb`, `positions.csv` e `boards.json`).

```bash
python tools/migrate.py data/t26/legacy data/t26/std   # requer openpyxl
```

Uma pasta nova aparece sozinha no site. Para a ligar ao car harness, acrescenta-a a `HARNESSES` em `tools/migrate.py`
com o prefixo dos seus conectores de interface (ex.: `'LVBox_Harness': ('LVBOX', 'LV Box', 'car', ['LVBOX'])`).

## Site

```bash
cd web
export PATH=/www/server/nodejs/v22.23.3/bin:$PATH   # Node 22 (o do sistema é 18, curto para o Vite 8)
npm test         # regras do validador e trace, sobre os Excels de data/t26/std
npm run dev      # desenvolvimento
npm run build    # gera web/dist para servir em /harness/
```

## Publicar (stocklart.pt/harness)

O nginx serve `/www/wwwroot/harness` em `/harness/` (bloco em `/www/server/panel/vhost/rewrite/node_stock_manager.conf`,
cópia anterior em `/root/node_stock_manager.rewrite.bak-1022`). O site lê sozinho `data/t26/index.json` e os Excels.

Atualizar **só os dados** (sem rebuild):

```bash
cp -p data/t26/std/* /www/wwwroot/harness/data/t26/ && chown -R www:www /www/wwwroot/harness/data
```

Atualizar **o site** (depois do build):

```bash
rm -rf /www/wwwroot/harness/assets /www/wwwroot/harness/data && cp -r web/dist/. /www/wwwroot/harness/ && cp -p data/t26/std/* /www/wwwroot/harness/data/t26/ && chown -R www:www /www/wwwroot/harness
```
