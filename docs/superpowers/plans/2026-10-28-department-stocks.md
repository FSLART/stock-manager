# Department stocks implementation plan

Goal: every LART department (the 7 in `DEPARTMENTS`) has its own stock, with its own categories. Two departments may have a category with the same name ("Parafusos" in Chassis and in Powertrain) without clashing.
Architecture: one `department` column on `categories` (and on `movements` for history). Items stay linked by `cat_id`, so they need no change. Category names become unique per department, not globally. The API keeps using names, plus a `department` field that defaults to `Electronics`, so old clients, tests and QR links keep working.
No new dependencies. Tests run on Node 22 (`PATH=/www/server/nodejs/v22.23.3/bin:$PATH`) and with `python -m unittest` in `tests/`.

## Key decisions

- **Identity = (department, name).** We do not switch the frontend to category ids, because about 32 places use `item.cat` as a name. The inventory page shows one department at a time, so names are still unique *inside the page*. If we filter `categories`/`items` by the active department when loading, all the existing name-keyed code works unchanged.
- **Default `Electronics`.** All existing categories, items and movements become Electronics stock when migrated. Any request without `department` means Electronics.
- **Sections editable per department.** A new `sections (id, department, name, position)` table with `UNIQUE (department, name)` replaces the hard-coded `SECTIONS` tuple. `categories.section` stays a name string, but it is now checked against the department's rows. The migration seeds Electronics with its current three sections and every other department with one section, "Geral", so each department can create a category straight away. Members of a department (or an admin) can create, rename, reorder and delete that department's sections. Electronics can edit its own sections the same way.
- **Permissions.** `electronics_denied()` becomes `department_denied(department)`: allowed for an admin or a member of *that* department. Reading stays open to everyone, as it is today.
- **Electronics-only tools stay Electronics-only.** PCB BOM, take-from-stock against BOMs, the parts catalog (Mouser/DigiKey) and the Excel/Google sheet only read Electronics items.

## Task 1 — Schema migration (backend/app.py)

- [ ] Test first (`tests/test_department_stocks.py`, SQLite and the MySQL harness in `test_mysql_storage.py`):
  - an old DB with categories and items migrates, and **every item survives** with `department = 'Electronics'`;
  - two categories named `Parafusos` in different departments can both be inserted;
  - inserting a duplicate inside one department (case-insensitive) still fails.
- [ ] MySQL `init_mysql_schema`:
  - in `CREATE TABLE categories`, add `department VARCHAR(64) NOT NULL DEFAULT 'Electronics'` and replace the `UNIQUE` on `name` with `UNIQUE KEY dept_name (department, name)`;
  - for existing DBs, use the usual `information_schema` guard: `ADD COLUMN department`, find the old unique index with `SHOW INDEX FROM categories WHERE Column_name='name' AND Non_unique=0`, then `DROP INDEX` it and `ADD UNIQUE KEY dept_name (department, name)`. The `as_ci` collation on `name` stays.
  - `movements`: `ADD COLUMN department VARCHAR(64) NOT NULL DEFAULT 'Electronics'`.
- [ ] SQLite `init_sqlite_schema`: a column `UNIQUE` cannot be dropped, so rebuild the table: `categories_new` with `UNIQUE (department, name)`, copy the rows, drop, rename.
  - **Risk:** `items` has `ON DELETE CASCADE` to `categories`. Run the rebuild with `PRAGMA foreign_keys=OFF` (outside a transaction) and turn it back on afterwards, or the `DROP` deletes every item. The test above guards this.
  - `movements`: `ADD COLUMN department TEXT NOT NULL DEFAULT 'Electronics'`.
- [ ] Both backends: `CREATE TABLE IF NOT EXISTS sections (id, department, name, position, UNIQUE (department, name))`. Name uses `as_ci` on MySQL and `COLLATE NOCASE` on SQLite. Seed it once, guarded by a `meta` key `sections_seeded`: Electronics gets its three sections, plus any extra `categories.section` values already in the DB so no category is orphaned. The six other departments get "Geral".
- [ ] Back up the production MySQL before deploying (`mysqldump stock_db categories movements`).

## Task 2 — Backend reads and writes by (department, name)

Every place that looks up a category by name only must also use the department:

- [ ] `db_categories()` and `db_items()` return `department`; `/api/movements` returns `department`.
- [ ] `/api/move`, `/api/items/import`, `/api/items/consume`: read `department` from the body (default Electronics), look up the category with `name = ? AND department = ?`, and call `department_denied(department)`.
- [ ] `/api/items/<id>` (step, delete, patch) and `/api/items/location`: get the department from the item's category and check `department_denied` against it.
- [ ] `POST /api/categories`: check duplicates inside the department only, and validate `section` against that department's sections. `PATCH/DELETE /api/categories/<name>?department=…`: look up by both fields. `resolve_parent` only finds parents in the same department.
- [ ] Section routes, all guarded by `department_denied(department)`:
  - `POST /api/sections {department, name}` adds the section at the end of the department's list;
  - `PATCH /api/sections {department, name, new_name?, position?}` renames the section and does `UPDATE categories SET section = new WHERE department = ? AND section = old` in the same transaction; changing `position` reorders it;
  - `DELETE /api/sections?department=&name=` returns 409 "Move ou apaga as categorias primeiro" if any category still uses the section, and refuses to delete a department's last section.
- [ ] Tests: renaming a section moves its categories with it; you can't delete a section that has categories or the last one left; a section name can repeat across departments but not within one; Powertrain gets 403 when editing Electronics sections.
- [ ] `record_movements` writes `m["department"]`; every caller passes it.
- [ ] `save_items`, `sync_excel_to_db` and `sync_google_to_db` map categories by `(department, casefold(name))`. **Risk:** `save_items`/the syncs do `DELETE FROM items` and re-insert everything. Make sure non-Electronics items go through `save_items` with their department. The sheet syncs must only delete/replace Electronics items (`DELETE FROM items WHERE cat_id IN (Electronics categories)`), or a sheet sync would wipe the other departments.
- [ ] Rename `electronics_denied` to `department_denied(department="Electronics")` (19 callers). Location and label routes keep the Electronics default.
- [ ] `seed_categories`/`split_sections` insert with `department='Electronics'`.
- [ ] Tests: extend `test_department_permissions.py` so that Powertrain can add to Powertrain stock, gets 403 on Electronics and Aerodynamics, and an admin can edit all of them. Add tests for same-name categories in two departments with independent quantities and movements, and for deleting one of them leaving the other intact.

## Task 3 — Inventory view (frontend/src/App.vue, CategoryForm.vue, api.js)

- [ ] Add a department switch above the category sidebar, built with the existing `toggle-chips` (as in `PeopleAdmin.vue`, no native select). Each chip shows the department's unit total. Default: the user's first department, or Electronics. Remember the choice with `readStored/writeStored('stocklart-department')`.
- [ ] Keep `allCategories`/`allItems` from `/api/data`. The `categories`/`items` refs that the page already uses become `computed` values filtered by the active department, so the rest of App.vue stays the same.
- [ ] `electronicsEditor` becomes `canEdit = admin || user.department.split(', ').includes(activeDepartment)`, mirroring `department_denied`.
- [ ] `api.js`: add `department` to the move, import, consume and category create/edit/delete calls (as body field or query).
- [ ] `CategoryForm.vue`: the section options come from the active department, so the hard-coded `SECTIONS` goes away. Send them in `/api/data` as `sections: {department: [names in position order]}`. The sidebar uses this order, so an empty section still shows up.
- [ ] Section editing in the sidebar, for editors only: a "+ Secção" button at the end of the section list, and rename / move up / move down / delete in a small menu on each section heading. Use the existing dialog/toggle-chip styles, not native prompts. If a delete is refused, show the server's message.
- [ ] Heading/breadcrumb shows the department ("Powertrain › Parafusos").
- [ ] An empty department gets an empty state with a "Criar primeira categoria" action for editors and a read-only note for everyone else.

## Task 4 — Other pages

- [ ] `MovementsPage.vue`: add department filter chips. Rows show the department next to the category name.
- [ ] `PcbBomPage.vue`, `TakeFromStock.vue`, `pcbStock.js`, `PartsCatalog.vue`: filter items to `department === 'Electronics'`, so a "Resistências" in another department never matches a BOM.
- [ ] `HomePage.vue`: link to the stock for the user's department (only if they have one).
- [ ] `PeopleAdmin.vue`: change the hint "Electronics pode alterar o stock eletrónico" to "Cada departamento altera o seu stock".

## Task 5 — Verify

- [ ] `python -m unittest discover tests` and `npx vitest run` both pass.
- [ ] Run the migration on a copy of the production MySQL. Check that the item count and total units are the same before and after.
- [ ] Take screenshots (headless_shell, phone 390px and desktop 1440px) of the department chips, the section editor, an empty department and two "Parafusos" in different departments, in the dark theme.
- [ ] Build and deploy only after the user approves.

## Out of scope

- Per-department locations, labels or purchases (locations stay shared boxes).
- Moving a category between departments (delete and recreate it instead; can be added later as a PATCH field).
- Excel/Google sheet export for non-Electronics stock.
