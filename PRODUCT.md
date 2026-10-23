# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Toda a equipa LART (Formula Student, IPLeiria). A eletrónica é quem mais altera o stock (tirar e repor componentes na sala, muitas vezes a meio de uma montagem de PCB); as outras áreas consultam. Entram com a conta Notion da LART.

## Product Purpose
Stocklart é o inventário de componentes eletrónicos da equipa: ver o que há, tirar e repor material, e saber quem fez cada alteração. Sucesso: o stock real bate com o do site e qualquer movimento é rastreável a uma pessoa.

## Positioning
- Rastreabilidade por pessoa: cada entrada/saída/edição/remoção fica registada no servidor com o nome (login Notion).
- Ligado ao resto da LART: mesma conta Notion, cablagem (stocklart.pt/harness), BOMs de PCB e simulação analógica no mesmo site.
- Categorias com propriedades à medida: cada categoria define os seus campos; filtros, CSV e edição sem mexer em código.
- Simplicidade: abre sem instalar nada, ver o stock é público e só alterar exige login.

## Operating Context
Servidor próprio (aaPanel, nginx, Flask + gunicorn, MariaDB). Uso na sala da equipa, em PC partilhado e telemóvel. Existe também uma cópia em Google Apps Script sem login nem histórico no servidor.

## Capabilities and Constraints
- Interface em pt-PT.
- Build gera um único HTML autónomo (Vue + Vite), servido pelo Flask e pelo Apps Script.
- Sem scroll horizontal da página (regra da equipa nas cablagens).
- Login só com Notion; o login por PIN está comentado no código, não apagado.
- Histórico mostra os últimos 1000 movimentos (sem paginação ainda).

## Brand Commitments
Tema escuro com amarelo LART e logótipo LART existentes (`frontend/src/assets/lartt-transparent.svg`); manter.

## Evidence on Hand
Stock real em produção (100 referências, 3422 unidades à data de 2026-10-23, só resistências e condensadores). Sem testemunhos, métricas ou casos de uso documentados.

## Product Principles
- Ver é livre, alterar é identificado.
- Cada alteração deixa rasto com nome.
- Poucos cliques para tirar ou repor um componente.
- Os dados da equipa vivem no servidor da equipa, não no browser de cada um.
