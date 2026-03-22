---
name: tempo
description: Call APIs, discover services, and access external data with automatic payment handling via the Tempo micropayment protocol. Use when making API requests, discovering paid services, or when the user mentions tempo, paid APIs, or service discovery.
---

# Tempo Skill

Use the Tempo CLI to call APIs with automatic micropayment handling.

## Setup

```bash
# Install
curl -fsSL https://tempo.xyz/install | bash

# Login (requires browser/passkey)
"$HOME/.tempo/bin/tempo" wallet login

# Verify
"$HOME/.tempo/bin/tempo" wallet -t whoami
```

## Critical Rules

- **Always use full absolute paths**: `$HOME/.tempo/bin/tempo` — never just `tempo`
- **Discover before requesting**: Use service metadata to build URLs
- **Use `--dry-run`** for potentially expensive requests
- **Check balance** after multi-request workflows
- On HTTP 422: consult the endpoint's `docs` URL or service's `llms.txt` for exact field specs

## Common Workflows

### Check wallet and balance
```bash
"$HOME/.tempo/bin/tempo" wallet -t whoami
```

### Discover available services
```bash
"$HOME/.tempo/bin/tempo" wallet -t services --search <query>
```

### Make a paid API request
```bash
"$HOME/.tempo/bin/tempo" request <url> [--dry-run]
```

## Troubleshooting

- "legacy V1 keychain" error → reinstall
- `ready=false` in wallet → re-login
- Insufficient balance → fund wallet
- Service not found → broaden search terms
