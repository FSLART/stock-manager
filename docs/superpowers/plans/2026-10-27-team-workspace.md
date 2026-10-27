# LART team workspace implementation plan

> For agentic workers: execute tasks against the approved report; use focused independent agents where files do not overlap.

Goal: implement the approved team-wide home/navigation, clearer pages, reliable editing and coherent desktop/mobile styles.
Architecture: preserve Vue main app, React/Mantine harness and the standalone BSPD emulator. Use native links/details/dialogs and existing API/permission models. No new dependencies.
Spec: docs/ux-design-review-2026-10-27.md, approved by user with “implement that”.

## Global constraints

- pt-PT interface; dark warm LART palette and yellow identity remain.
- Preserve current Electronics/admin mutation rules and leader-only purchases; latest main includes new server enforcement.
- No fictional department resources, task feeds or progress metrics. Use working existing routes; publish real department links only when supplied.
- Preserve QR/hash links, stock APIs, labels, catalog/scanning/import, shared PCB data and engineering functionality.
- Worktree /root/.codex/worktrees/team-workspace/stock-manager; branch codex/team-workspace. Do not alter original working tree or deploy.
- Reuse installed dependencies and Node 22.23.3. Baseline system Node is too old; use PATH=/www/server/nodejs/v22.23.3/bin:$PATH.

## Review focus

- Anonymous and non-Electronics users see useful, truthful read-only routes; admin/leader restrictions persist.
- Modified-click links open normally, keyboard/Escape works, direct hash changes preserve drafts and focus.
- Empty/no-result/error states contain a useful action; dates and limits are explicit.
- Phone 320/390px, desktop 1440px, zoom and printing remain usable.
- Shared API writes, local preferences and drafts are distinguished; refresh/navigation do not silently lose work.

## Task 1 — Shared shell and team home (parent)

Files: HomePage.vue, AppNavigation.vue, WorkspacePage.vue, App.vue, composables/useNavigation.js, style.css, LoginDialog.vue, stockText.js/StockItem.vue as needed; tests/team-workspace.test.js and existing navigation assertions.

- [x] Add behavior tests for grouped anchor routes, all-team home, role-restricted purchases, Escape and safe navigation guard; run red.
- [x] Build compact home with working shared resources/engineering lists and restrained team imagery; replace promotional carousel/admin shortcuts.
- [x] Implement grouped route links and contextual page breadcrumbs, main landmark/focus, reliable draft-aware navigation with native link modifiers intact.
- [x] Improve inventory categories, bounded list, meaningful item descriptions and persistent synchronization state, keeping API semantics.
- [x] Consolidate relevant style rules; improve functional type/touch sizes; remove decorative home rules.
- [x] Verify focused tests green.

## Task 2 — Page workflows (independent agent)

Files: LabelsPage.vue, LocationsPage.vue, MovementsPage.vue, BatchesPage.vue, PcbBomPage.vue, SettingsPage.vue; own tests/workspace-pages.test.js. Do not edit shared style.css/App/navigation or server permissions.
Interfaces: useNavigation provides push(path), beforeLeave(check) returning unregister; check returns boolean. Labels registers dirty/discard guard and native beforeunload; no global router dependency. Existing inventory context unchanged.

- [x] Add/run failing tests for draft protection, filters/limits, retry and truthful settings where behavioral.
- [x] Labels: protect every exit and reload; searchable list/templates; advanced editor disclosure; preserve previews/printing.
- [x] Locations: search and better empty/access states; retain current Electronics mutations.
- [x] Movements: date/person/type filters, bounded rendering and history-coverage/retry; readable identity.
- [x] Purchases: user-facing name/copy, scope/empty/retry guidance.
- [x] PCB: saved projects first, explicit new-project flow, truthful shared/read-only state and partial-withdrawal explanation; retain current restrictions.
- [x] Settings: separate device/session/team data/admin people and correct persistence copy.
- [x] Verify own tests; report any existing assertion changes needed to parent.

## Task 3 — Specialist coherence (independent agent)

Files: harness/web/src and board_emulation/bspd_emulator.html; frontend/src/pages/AnalogSimulationPage.vue, HarnessPage.vue. No other main-app files or generated builds.

- [x] Harmonize harness warm dark/yellow styles, typography and interactive sizes; preserve meaningful diagram colors.
- [x] Lookup first, issue detail on demand; clear terminology; bounded wires; retain tool capabilities and accessible alternatives where practical.
- [x] Improve simulator catalog (available first, planned collapsed); visible headings. Align BSPD initial theme/language, guide/result/advanced controls.
- [x] Support local wrapper preview via import.meta.env.DEV harness route; preserve production canonical harness URL.
- [x] Run harness tests/build in isolation; no publish/copy to production directory.

## Task 4 — Integrate, verify and document (parent)

- [x] Update PRODUCT.md to approved scope and record durable DESIGN.md decisions.
- [x] Update navigation-dependent existing tests to approved behavior, preserving security/functional assertions.
- [x] Run frontend suite, build/smoke build and harness suite/build with Node 22.
- [x] Inspect desktop/mobile in one batched browser round with read-only real data; fix detected issues in a single batch, confirm once.
- [x] Request a fresh correctness review; resolve material findings with targeted tests.
- [x] Leave changes reviewable in attached worktree; report preview/evidence, verification and any remaining data-dependent resources. No deployment.

## Progress / rulings

- User approval covers the report's recommended shared-tools direction and practical existing-capability upgrades. Future search/assignment/department data features are not invented.
- Native managed worktree created. Existing changes to permission policy were committed to main before checkout and are preserved.
- System Node baseline failed due missing crypto.hash; project-supported Node 22 is selected for actual verification.

## Final verification

- Frontend: 126 tests passed across 13 files.
- npm run test:build passed for Flask and Apps Script bundles.
- Harness: 35 tests passed and production build passed (existing chunk-size advisory remains).
- BSPD smoke: pt/dark defaults, explicit preferences retained, advanced calibration works, trip at 0.450 seconds.
- Browser: 24 desktop/phone/320px captures, no page-wide overflow or page errors. Final eight-route/device confirmation and real browser Back-cancel-accept preserve the prior destination. Live write requests blocked.
- Fresh correctness review resolved loaded-row selection scope, history restoration, persistent initial error and specialist main landmarks; regression tests passed.
- Original checkout and live deployment unchanged. Changes remain reviewable in the managed worktree on codex/team-workspace.
- Real department-specific resource destinations remain a data-dependent future addition; none were invented.
