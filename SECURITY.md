# Security

Molenkopf is a local gateway for coding-agent traffic. Do not run it blindly on
a workstation with real provider accounts, private repositories, browser
sessions, or imported runtime credentials. Review the configuration and runtime
flags first.

## Safe Use

- Start on loopback only unless you intentionally need network access.
- Set a unique `MOLENKOPF_SESSION_SECRET` before starting Molenkopf. Do not
  commit `.env` files or bake secrets into Docker images.
- Do not use `--allow-public-bind` unless you intentionally need network access.
- First-run bootstrap is intentionally narrow. Before an admin exists, only
  health, session status, and first-run admin creation are usable.
- After setup, provider, plugin, routing, agent, stats, event, config metadata,
  and retention purge endpoints are admin-only. Normal users receive scoped
  usage and key data.
- Treat `.molenkopf/`, audit manifests, retrieval stores, SQLite
  files, runtime-auth profiles, and env files as sensitive local state.
- Do not commit provider keys, imported `auth.json`, Claude credentials,
  cookies, database files, audit files, retrieval stores, or screenshots with
  secrets.
- Prefer environment credential references or a private local config file over
  UI-entered provider credentials. File config rejects inline raw credentials.
- Read Docker and deployment settings before exposing a container port.

## Reports

When the repository is hosted on GitHub, prefer GitHub private vulnerability
reporting if it is enabled. If only public issues are available, post a
sanitized reproduction only and keep sensitive material private.

Do not open a public issue that contains tokens, prompts, responses, auth files,
provider credentials, cookies, or private repository content. Redact the
material first and include only the minimal reproduction details.
