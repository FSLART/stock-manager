# Stocklart UX and design review

27 October 2026. Method: independent design assessment by `/root/design_review` and technical assessment by `/root/technical_review`. Technical findings were withheld until the design assessment finished.

## Main finding

Make Stocklart a shared LART workspace. Its useful tools and authentic team material are stronger than its current homepage hierarchy. The large electronics carousel, three inventory-related shortcuts, components-only subtitle and inventory-oriented navigation make other departments feel secondary.

Keep the dark palette, LART yellow, logo, real photographs, QR workflows and engineering tools. Rebuild the entry point around useful destinations. A genuinely all-team hub also needs maintained resources for the seven departments already represented in accounts; changing the headline alone cannot supply that usefulness.

This is a report, not an implemented redesign. Application code, permissions and site data were not changed. PRODUCT.md describes the older electronics-focused purpose; the user's requested broader direction supersedes that scope for these recommendations.

## Coverage and limitations

All ten main routes were inspected in source and captured at 1440×1000 and 390×844: home, inventory, locations, labels, movements, purchases, PCB projects, settings, analog simulation and harness. Five routes additionally received 320px technical checks. Review covered inventory dialogs, catalog, CSV, scanning, bulk operations, labels/templates/printing, PCB/BOM/STEP/production, people administration, harness subtools and BSPD.

Browser sessions were anonymous and read-only, with write requests blocked. Privileged workflows, OAuth, Bluetooth hardware, physical printing and offline conflicts were not executed. Permission/draft findings rely on source where stated. Scores are expert judgments, not user-testing results or accessibility certification.

## Design health: 23/40

| Heuristic | /4 | Main finding |
|---|---:|---|
| System status | 3 | Counts/loading/feedback exist; save/sync state varies. |
| Match with users' world | 2 | Real boxes/boards help; components-only identity and mixed terminology narrow the audience. |
| User control | 3 | Cancel/clear/undo exist; navigation and draft protection vary. |
| Consistency | 2 | Main app, harness and simulator feel disconnected. |
| Error prevention | 3 | CSV preview, constraints and destructive confirmations are useful. |
| Recognition | 2 | Long taxonomies and raw property summaries make scanning harder. |
| Efficiency | 2 | Good scanning/bulk tools; navigation and dense lists add work. |
| Minimalism/hierarchy | 2 | Promotional home and unavailable boards compete with tasks. |
| Error recovery | 2 | Errors display; retry/next-step guidance varies. |
| Help | 2 | Useful tutorials; limited shared task-focused guidance. |

Technical audit: accessibility **2/4**, performance **3/4**, responsive design **3/4**, theming **3/4**, implementation integrity **2/4** — **13/20**. No blocking P0 defect was proven.

## Five priorities

### 1. P1 — Replace the homepage hierarchy

Three of four prominent actions concern inventory. A 610px desktop carousel leads with electronics; on phones, the image delays useful tools and Cablagem sits below the first screen. Category administration is unnecessarily prominent for most members.

Use **“Ferramentas da equipa LART”**, a compact introduction and immediately visible destinations. Move category administration inside inventory. Keep a smaller team/car photograph if useful. Reduce layered borders and uppercase action labels.

Surface existing tools now, then add real tools/documentation/procedures for Aerodynamics, Autonomous Driving, Chassis and Structures, Communication and Logistics, Dynamics, Electronics and Powertrain. Avoid empty department dashboards.

Evidence: `frontend/src/pages/HomePage.vue:11`, `:26`, `:57`; `frontend/src/style.css:349`. Suggested workflows: `$impeccable shape`, `$impeccable distill`.

### 2. P1 — Organize navigation around work

Inventory subpages receive top-level prominence while engineering tools sit under “Mais.” Every shared workspace header returns to inventory, including PCB and settings. The brand subtitle says “Gestão simples de componentes.”

Proposed groups: **Início**, **Recursos e oficina** (inventory, locations, labels, movements), **Engenharia** (PCB, harness, simulation), and authorized **Compras e encomendas**. Put settings in the account area; use contextual breadcrumbs. Keep direct destinations available within each group.

Use anchors for routes, meaningful page titles and deliberate focus on route changes. Mobile Menu should close on Escape and return focus, matching desktop “Mais.”

Evidence: `frontend/src/components/AppNavigation.vue:40`, `:55`, `:65`, `:81`, `:88`; `frontend/src/components/WorkspacePage.vue:36`. Workflows: `$impeccable shape`, `$impeccable harden`.

### 3. P1 — Make access and sharing truthful

Home/login imply all LART members can change material, but client/server restrict all stock changes to Electronics/admin. Settings also claims PCB projects are browser-only, while current code saves shared projects on the server.

Show permitted actions and explain read-only access. Keep permissions aligned with responsibilities; any future department-level resource ownership needs a separate explicit policy. Correct sharing copy to distinguish **partilhado com a equipa** from **só neste dispositivo**. Make saved/pending/error state visible where it affects decisions.

Evidence: `frontend/src/pages/HomePage.vue:63`; `frontend/src/App.vue:57`, `:255`; `backend/app.py:345`; `frontend/src/components/LoginDialog.vue:52`; `frontend/src/pages/SettingsPage.vue:27`; `frontend/src/pages/PcbBomPage.vue:49`. Workflows: `$impeccable clarify`, `$impeccable harden`.

### 4. P2 — Share styles and improve readability

Main-app warm dark/yellow styling changes to blue/teal/glass in harness and a different initial theme/language in BSPD. Share palette, typography, spacing, controls and statuses, while preserving meaningful engineering diagram colors.

Browser measurements found 65 low-stock badges at 10px and two settings descriptions at approximately 10.83px. Raise functional secondary text to 12–14px. Reserve yellow for useful emphasis, focus and selection; reduce decorative borders/shadows.

Consolidate mobile overrides: category buttons measured 40px tall and fold controls 32×40px. Target comfortable 44px controls and offer a discoverable category selector rather than a scrollbar-hidden strip. These dimensions alone do not prove WCAG failure.

Evidence: `frontend/src/style.css:196`, `:1280`, `:1448`, `:1470`; `harness/web/src/styles.css:14`, `:31`. Workflows: `$impeccable typeset`, `$impeccable adapt`, `$impeccable layout`.

### 5. P2 — Protect work and disclose complexity gradually

Label editor buttons check for unsaved changes, but global navigation can replace the component without that check. The draft is component-local. Protect every exit or offer recoverable drafts. This was source-verified, not exercised through authenticated editing.

Standardize item summaries with value/unit, package and useful identifiers. Keep quantity/location prominent. Disclose advanced label styling progressively. Put harness lookup before detailed warning lists while keeping severe findings visible. Add retry beside recoverable load errors.

Evidence: `frontend/src/pages/LabelsPage.vue:33`, `:70`; `frontend/src/components/AppNavigation.vue:74`; `frontend/src/App.vue:459`; `frontend/src/pages/MovementsPage.vue:81`. Workflows: `$impeccable harden`, `$impeccable clarify`, `$impeccable distill`.

## Proposed homepage

1. Compact identity: **Ferramentas da equipa LART**.
2. Shared tools: **Recursos e oficina** and **Engenharia**, with short descriptions and direct destinations.
3. Relevant department resources, once real maintained links are identified. Keep shared tools reachable by everyone who may view them.
4. **Compras e encomendas** for eligible users.
5. Small, clearly scoped information from real data. Total stock is an inventory metric, not team progress.

Global search, favorites/recent tools, assignments, deadlines, approvals and cross-team activity are future proposals. They require data/workflow decisions and are unnecessary for the first homepage improvement. Inventory should remain accurately scoped while its data and permissions concern electronics.

## Page-by-page upgrades

| Page | Recommendation |
|---|---|
| Início | Replace carousel/admin shortcuts; bring useful tools into the first phone screen. |
| Inventário | Search, readable identity, quantity and location first; improve mobile taxonomy; preserve scanning/bulk; group maintenance tools. Add bounded loading as the list grows. |
| Localizações | Preserve photos/QR; make viewing material primary; group printing/management; add search and useful empty-box guidance. |
| Etiquetas | Search/group templates; start with content/size; disclose styling; retain live preview; protect drafts; clarify print destinations. |
| Movimentos | Reuse readable item naming; add date/person/type filters and explicit history coverage/pagination. Current server limit is 1000 movements. Separate admin reversion. |
| Batches | Rename **Compras e encomendas**; remove server-path wording; distinguish unit/total price and source documents. Order-status/approval tracking would be new functionality. |
| PCB e os seus BOMs | Rename **Projetos PCB**; lead with saved projects and Novo projeto; separate opening from production quantities; explain shortages and partial consumption. |
| Simulação analógica | Visible heading/purpose; feature available BSPD; group four planned boards compactly; explain the test before specialist controls. |
| Cablagem | Harmonize shell; lookup/harness choice before statistics and warning details; keep specialist views directly accessible. |
| Definições | Separate device preferences, session and people administration; correct sharing claims; keep essential feedback dependable. |

## Secondary options and specialist tools

- **Stock/categories/catalog:** retain expert quantity steps; make affected items explicit. Distinguish catalog parts from physical stock; explain consequences of changing category fields.
- **CSV/scanning/bulk:** preserve preview/templates/validation and camera/photo alternatives. Show recognized information and operation scope before committing. Camera/OCR performance was not benchmarked.
- **Printing:** retain live previews, templates, Phomemo and PNG fallback; present understandable destination choices. Hardware was not tested.
- **PCB/BOM/STEP:** preserve shared ownership, attachments, stock comparison and consumption confirmation. Distinguish production preview from committed movements; clearly state partial withdrawals.
- **People/offline:** distinguish Notion-managed membership from local overrides. Show pending/saved/error state persistently; separately test offline conflict recovery.
- **Harness overview:** search and selection first; concise issue counts, then detailed findings.
- **Connectors/pinouts/wires:** keep harness/reference/mating side/endpoints visible; show key facts before wide mobile tables. Replace the 400-row wire cutoff with explicit load-more/pagination.
- **Trace/2D/formboard:** ordered circuit path, legend, clear assembly-versus-connection explanation, visible fit/zoom and equivalent selectable lists.
- **3D/coordinates:** distinguish inspection/editing and saved/unsaved positions; provide text-based selection and clear access state.
- **BOM/cut list:** group parts/wire lengths, expose missing specifications and label estimates.
- **Issues/Validate:** use **Problemas** consistently; show severity and correction source. Distinguish published-file checks from local preview that does not upload/save.
- **BSPD:** preserve live verdict, units, thresholds, guide, glossary and reset. Start with a guided test; keep result/explanation together; disclose calibration as advanced. Align initial language/theme with the surrounding app.

## User impact

New members outside Electronics lack an obvious destination for their work. Frequent users face long taxonomies and distant quantities despite useful scanning/bulk tools. Keyboard users lose native route-link behavior; mobile Escape is inconsistent. Phone users encounter photography and warning details before useful tools.

Four cognitive-load weaknesses recur: hierarchy, too many competing decisions, doing one thing at a time and progressive disclosure. Harness exposes eight sections before login; five simulation boards receive similar prominence despite only one being available. Real boxes, boards and circuit paths are the strongest useful moments; bring them earlier and end tasks with clear saved/shared state.

## Technical verification

- No page-wide overflow in all 20 main captures at 1440/390px or five additional sampled routes at 320px.
- Sampled solid-background contrast passed: muted text 6.06:1, stock headings 5.29:1, yellow CTA text 12.35:1. Photo overlays were not certified.
- Visible focus outlines, labeled inputs and native dialogs are strengths. WebP images are roughly 32–118KB; PCB thumbnails lazy-load; 3D loads/renders on demand. No severe performance defect demonstrated.
- Inventory renders all 198 references, producing an approximately 11,866px desktop document. Bounded loading is a growth recommendation, not proof of slow runtime.
- CLI detector ran once: six findings, five warnings/one advisory. Locations: printed-label Arial `frontend/src/style.css:1642`; home stripe `:517`; diagram Inter `harness/web/src/styles.css:136`, `:143`; gradient text `:31`; background grid `:14`.
- Printed-label Arial is contextually appropriate; popular diagram fonts are not defects themselves. The other CLI items are cosmetic signals.
- Browser overlays on home/stock/settings reported 8/72/8 element groups, 10/74/9 individual findings. Useful corroboration: small stock badges/settings text. Hidden dialogs inflated shadow counts; padded-table/missing-value findings were partly false positives. No broken clipping was reproduced.
- Overlays existed only in headless review tabs, with screenshots. No live user-visible overlay is available. Helper server PID 186811 was stopped and browser contexts closed.

## Recommended delivery order

1. Home/navigation and truthful copy: `$impeccable shape`, `$impeccable distill`, `$impeccable clarify`.
2. Draft/navigation/save reliability: `$impeccable harden`.
3. Shared typography/mobile/layout: `$impeccable typeset`, `$impeccable adapt`, `$impeccable layout`.
4. Focused page improvements and maintained department resources.
5. Finish with `$impeccable polish` and a bounded desktop/mobile verification pass.

Validate with several departments: recognize a useful destination within five seconds, reach it without unnecessary stock navigation, find material/box/circuit, understand access, retain drafts and recognize saved work. These are proposed acceptance checks, not outcomes measured here.

Next decisions: **shared tools hub** versus **department dashboard**; **home/navigation first** versus **phased whole-site redesign**. Recommended: shared tools hub first, then phased improvements.
