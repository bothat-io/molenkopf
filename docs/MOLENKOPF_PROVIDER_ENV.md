# Molenkopf Provider ENV Setup

This documents environment-based provider setup. The JSON config path for
providers, agent bindings, plugin policies, and team distribution is
[MOLENKOPF_JSON_CONFIG_PLAN.md](MOLENKOPF_JSON_CONFIG_PLAN.md).

Use this when you want several upstream provider profiles in one local
Molenkopf instance. Credentials stay in environment variables. Molenkopf only
stores and displays the variable names.

## Do Not Use

- Do not paste Claude, ChatGPT, Codex, or browser login/session tokens here.
- Do not commit a file with real keys.
- Do not give employees upstream provider keys. Later they get Molenkopf tokens.

Use provider API keys for API routing:

- OpenAI API key: `OPENAI_API_KEY` or your own named env key.
- Anthropic/Claude API key: `ANTHROPIC_API_KEY` or your own named env key.
- Codex CLI / Claude CLI login sessions are supported through JSON config and
  runtime-auth import flows. They are not configured through env provider blocks.

## Single Built-In Profiles

PowerShell:

```powershell
Copy-Item .env.example .env
# Edit .env and set MOLENKOPF_SESSION_SECRET.
$env:OPENAI_API_KEY = "replace-with-openai-api-key"
$env:ANTHROPIC_API_KEY = "replace-with-anthropic-api-key"
npm run dev
```

Then open:

```text
http://127.0.0.1:8787/__molenkopf/dashboard
```

Built-in provider IDs:

```text
openai-env
anthropic-env
ollama-local
lmstudio-local
```

## Multiple Provider Profiles

Use `MOLENKOPF_PROVIDER_IDS` plus one block per ID. The ID is converted to an
env suffix by uppercasing and replacing `-` with `_`.

Example:

```powershell
$env:MOLENKOPF_PROVIDER_IDS = "openai-main,openai-backup,claude-main,claude-work"

$env:MOLENKOPF_PROVIDER_OPENAI_MAIN_NAME = "OpenAI Main"
$env:MOLENKOPF_PROVIDER_OPENAI_MAIN_TARGET = "https://api.openai.com/v1"
$env:MOLENKOPF_PROVIDER_OPENAI_MAIN_CREDENTIAL_ENV = "OPENAI_MAIN_API_KEY"
$env:OPENAI_MAIN_API_KEY = "replace-with-openai-main-api-key"

$env:MOLENKOPF_PROVIDER_OPENAI_BACKUP_NAME = "OpenAI Backup"
$env:MOLENKOPF_PROVIDER_OPENAI_BACKUP_TARGET = "https://api.openai.com/v1"
$env:MOLENKOPF_PROVIDER_OPENAI_BACKUP_CREDENTIAL_ENV = "OPENAI_BACKUP_API_KEY"
$env:OPENAI_BACKUP_API_KEY = "replace-with-openai-backup-api-key"

$env:MOLENKOPF_PROVIDER_CLAUDE_MAIN_NAME = "Claude Main"
$env:MOLENKOPF_PROVIDER_CLAUDE_MAIN_TARGET = "https://api.anthropic.com/v1"
$env:MOLENKOPF_PROVIDER_CLAUDE_MAIN_CREDENTIAL_ENV = "ANTHROPIC_MAIN_API_KEY"
$env:MOLENKOPF_PROVIDER_CLAUDE_MAIN_AUTH = "x-api-key"
$env:ANTHROPIC_MAIN_API_KEY = "replace-with-anthropic-main-api-key"

$env:MOLENKOPF_PROVIDER_CLAUDE_WORK_NAME = "Claude Work"
$env:MOLENKOPF_PROVIDER_CLAUDE_WORK_TARGET = "https://api.anthropic.com/v1"
$env:MOLENKOPF_PROVIDER_CLAUDE_WORK_CREDENTIAL_ENV = "ANTHROPIC_WORK_API_KEY"
$env:MOLENKOPF_PROVIDER_CLAUDE_WORK_AUTH = "x-api-key"
$env:ANTHROPIC_WORK_API_KEY = "replace-with-anthropic-work-api-key"

npm run dev
```

## Private Env File

`.env` is ignored by git and loaded automatically by source runs. It may contain
the required session secret and provider environment variables. Replace the
placeholder session secret before starting Molenkopf:

```env
MOLENKOPF_SESSION_SECRET=replace-with-at-least-32-random-characters
MOLENKOPF_PROVIDER_IDS=openai-main,claude-main
MOLENKOPF_PROVIDER_OPENAI_MAIN_NAME=OpenAI Main
MOLENKOPF_PROVIDER_OPENAI_MAIN_TARGET=https://api.openai.com/v1
MOLENKOPF_PROVIDER_OPENAI_MAIN_CREDENTIAL_ENV=OPENAI_MAIN_API_KEY
OPENAI_MAIN_API_KEY=replace-with-openai-main-api-key
MOLENKOPF_PROVIDER_CLAUDE_MAIN_NAME=Claude Main
MOLENKOPF_PROVIDER_CLAUDE_MAIN_TARGET=https://api.anthropic.com/v1
MOLENKOPF_PROVIDER_CLAUDE_MAIN_CREDENTIAL_ENV=ANTHROPIC_MAIN_API_KEY
MOLENKOPF_PROVIDER_CLAUDE_MAIN_AUTH=x-api-key
ANTHROPIC_MAIN_API_KEY=replace-with-anthropic-main-api-key
```

`--env-file FILE` remains available when you intentionally want a different
private file. Docker does not automatically read host `.env` files; pass the
file explicitly with `docker run --env-file .env ...`.

## Fields

```text
MOLENKOPF_PROVIDER_<ID>_NAME
MOLENKOPF_PROVIDER_<ID>_TARGET
MOLENKOPF_PROVIDER_<ID>_CREDENTIAL_ENV
MOLENKOPF_PROVIDER_<ID>_AUTH=bearer | x-api-key | none
MOLENKOPF_PROVIDER_<ID>_KIND=api | local
MOLENKOPF_PROVIDER_<ID>_ENABLED=false
```

When a configured provider is selected, Molenkopf strips incoming client auth
and injects the configured server-side env credential at the forwarding
boundary.
