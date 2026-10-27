# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Toda a equipa LART (Formula Student, IPLeiria). A eletrónica é quem mais altera o stock (tirar e repor componentes na sala, muitas vezes a meio de uma montagem de PCB); as outras áreas consultam. Entram com a conta Notion da LART.

## Product Purpose
Stocklart é o espaço de ferramentas partilhadas da equipa LART: encontrar material e localizações, organizar a oficina, consultar projetos PCB, explorar cablagem e simular placas. A página inicial serve toda a equipa; as ações de alteração respeitam o departamento, cargo e permissões da conta. Sucesso: cada membro encontra uma ferramenta útil rapidamente, e o stock mantém-se correto e rastreável.

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
- Histórico mostra os últimos 1000 movimentos do servidor, com filtros e apresentação progressiva em lotes de 100.
- Inventário apresenta referências em lotes de 100; QR e pesquisa mantêm o contexto.
- Alterações de stock, localizações e projetos PCB: Electronics/admin; etiquetas: pessoas com sessão; compras: admins, Board e líderes.
- Recursos específicos dos restantes departamentos precisam de destinos reais mantidos; não criar áreas vazias nem dados de exemplo.

## Brand Commitments
Tema escuro com amarelo LART e logótipo LART existentes (`frontend/src/assets/lartt-transparent.svg`); manter.

## Evidence on Hand
Stock real em produção (100 referências, 3422 unidades à data de 2026-10-23, só resistências e condensadores). Sem testemunhos, métricas ou casos de uso documentados.

## Product Principles
- Ver é livre, alterar é identificado.
- Cada alteração deixa rasto com nome.
- Poucos cliques para encontrar material, abrir um projeto ou consultar uma ferramenta.
- A organização e os nomes devem fazer sentido para todos os departamentos.
- Os dados da equipa vivem no servidor da equipa, não no browser de cada um.
