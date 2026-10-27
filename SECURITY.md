# Security policy

## Supported versions

Security fixes target the latest code on the repository's default branch.
Older revisions do not have a separate security maintenance or backport policy.
When reporting a problem, include the affected commit and whether it reproduces
on the latest revision, if you can check safely.

## Reporting a vulnerability

Please report suspected vulnerabilities privately. Do not include exploit details,
credentials, session cookies, personal data, or database dumps in public issues
or pull requests.

Use **Report a vulnerability** on the repository's
[Security page](https://github.com/FSLART/stock-manager/security) if private
vulnerability reporting is enabled. If that option is unavailable and you do not
already have a private contact for a maintainer, open an issue requesting a private
reporting channel, without describing the vulnerability. This repository does not
currently document a dedicated security email address.

Include the following in your private report:

- The affected commit, deployment type (Flask or Google Apps Script), storage
  backend, and relevant configuration with secrets removed.
- The affected endpoint or feature, the access needed to exploit it, and the
  potential impact.
- Minimal reproduction steps or a proof of concept using synthetic data.
- Any suggested mitigation and a way to contact you for follow-up.

Test only deployments and data you are authorized to use. Coordinate public
disclosure with the maintainers after they have assessed the report and a fix or
mitigation is available. No fixed response or remediation timeline is published.

## Access model and deployment guidance

- **Public data:** the Flask deployment exposes stock and movement history,
  including recorded names, without login. Uploaded stock images are also served
  publicly. Do not put confidential information in these records or images; use
  additional deployment access restrictions if they must remain private.
- **Authenticated operations:** Flask API writes require a session. Stock,
  location, and PCB/BOM changes require an administrator or the Electronics
  department; PCB updates and deletions additionally require project ownership
  or administrator access. Purchase data
  requires an administrator, Board member, or Department Leader; people management
  requires an administrator. Notion workspace membership can automatically create
  accounts, so review `NOTION_WORKSPACE_ID`, workspace membership, and assigned
  roles. Roles and departments require administrator review; editable Notion
  profile names never grant permissions. Legacy automatic grants are revoked
  when the database initializes. The legacy PIN login is disabled and should
  remain disabled.
- **Production hosting:** serve the application over HTTPS through a reverse
  proxy and a production WSGI server, with Flask debug disabled. Set
  `PUBLIC_BASE_URL` to the canonical HTTPS URL, register the matching Notion OAuth
  callback, and configure a strong, persistent `SECRET_KEY`. Secure session cookies
  are enabled when `PUBLIC_BASE_URL` starts with `https://`. Keep one application
  worker as documented in the [deployment guide](docs/aapanel-mysql.md), because
  stock write locks are local to each process.
- **Secrets and files:** keep `.env`, database files, backups, purchase documents,
  Notion membership exports, and Google service-account credentials out of Git
  and public web directories. Configure the reverse proxy to deny direct access
  to these files and serve only intended application routes and public assets.
  Git ignore rules do not provide web access protection. Use `.env.example` as a
  template without adding real credentials to it.
- **Databases and backups:** use a dedicated database account, restrict database
  network access, and configure `MYSQL_SSL_CA` for remote MySQL connections.
  Back up the active database and `backend/uploads/`, protect backup access, and
  verify restoration. See the [deployment guide](docs/aapanel-mysql.md) before
  migrations. Never run destructive database tests against production data.
- **Browser storage:** cached stock, queued offline changes, PCB/BOM data, and
  preferences may persist in browser storage. Signing out does not guarantee
  removal of these local records. Use trusted browser profiles and clear site
  data before transferring a shared device, after resolving pending changes.
- **Google Apps Script:** this is a separate backend; Flask's Notion sessions and
  role checks do not protect its API. Restrict web-app access and execution
  identity in the deployment settings, review Sheets and Drive sharing, and
  verify access with an unauthorized account before deploying.

If a secret is exposed, revoke or rotate it at its provider and update the
server configuration. Rotating `SECRET_KEY` invalidates existing Flask sessions.
Removing a secret from the current file does not remove it from Git history.
