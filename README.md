# kv-shortlinks

Tiny URL shortener: one Cloudflare Worker, one Workers KV namespace, zero
runtime dependencies (~0.8 KiB bundle).

`https://example.com/meet` → `302` → whatever KV key `meet` holds.

| Request | Response |
| --- | --- |
| `/` | `302` to `ROOT_URL` (or `404` if empty) |
| `/meet`, `/s/xyz`, `/a/b/c` | `302` to the URL stored under `meet`, `s/xyz`, `a/b/c` |
| unknown key, non-`http(s)` value, bad path | `404` |
| non-`GET`/`HEAD` | `405` |

- Path segments: `A-Z a-z 0-9 _ -`, separated by single `/`, 256 chars max.
  No empty segments, trailing slash, dots or `%`-escapes.
- KV key = path **without** the leading slash (`/s/xyz` → key `s/xyz`).
- Query strings are not forwarded.
- Exactly one KV read per redirect; bad paths never touch KV.

## Requirements

- A Cloudflare account with the target domain added as a zone.
- [Bun](https://bun.sh). Wrangler runs via `bunx` from dev dependencies.
  `bun run dev` (local server) additionally needs Node.js on `PATH`; deploys
  and KV commands work with Bun alone.

## Deploy

Placeholders: `<YOUR_DOMAIN>` (e.g. `go.example.com`), `<YOUR_ZONE>` (the
Cloudflare zone, e.g. `example.com`), `<ROOT_URL>`, `<KV_ID>`, `<ACCOUNT_ID>`.

### 1. Install and log in

```sh
git clone https://github.com/<owner>/kv-shortlinks && cd kv-shortlinks
bun install
bunx wrangler login
bunx wrangler whoami        # shows <ACCOUNT_ID>
```

### 2. Create the KV namespace

```sh
bunx wrangler kv namespace create LINKS
```

Note the printed `id` (`<KV_ID>`). If Wrangler offers to add it to your
config, answer no — you'll set it in the next step with the binding name `LINKS`.

### 3. Configure

```sh
cp wrangler.example.jsonc wrangler.jsonc     # gitignored
```

Edit `wrangler.jsonc`:

```jsonc
"name": "kv-shortlinks",                       // any Worker name
"vars": { "ROOT_URL": "<ROOT_URL>" },          // where "/" redirects; "" → 404
"routes": [
  { "pattern": "<YOUR_DOMAIN>/*", "zone_name": "<YOUR_ZONE>" }
  // add "www.<YOUR_DOMAIN>/*" only if www should be served too
],
"kv_namespaces": [{ "binding": "LINKS", "id": "<KV_ID>" }]
```

Optional: add `"remote": true` to the KV entry to make `bun run dev` read
production links instead of local ones.

```sh
bun run check               # generate Worker types + typecheck
```

### 4. DNS

Routes only fire for hostnames proxied by Cloudflare. If `<YOUR_DOMAIN>` has
no DNS record yet, add one in Cloudflare → your zone → DNS → Records:

| Type | Name | Content | Proxy status |
| --- | --- | --- | --- |
| `AAAA` | `<YOUR_DOMAIN>` (`@` for the apex) | `100::` | Proxied |

`100::` is a discard address — the Worker answers every request, so no
origin is needed.

### 5. Deploy

Manually:

```sh
bun run deploy
```

Or via GitHub Actions — see [CI/CD](#cicd).

### 6. Add links and test

```sh
bunx wrangler kv key put --binding LINKS --remote meet "https://cal.com/you"
curl -sI https://<YOUR_DOMAIN>/meet          # 302, location: https://cal.com/you
curl -sI https://<YOUR_DOMAIN>/              # 302, location: <ROOT_URL>
curl -sI https://<YOUR_DOMAIN>/missing       # 404
```

## Managing links

**Dashboard:** Storage & Databases → Workers KV → your namespace → KV Pairs.
Key `s/xyz`, value `https://…` (no quotes). Changes reach all edges within
~60 s; no redeploy needed.

**CLI** (always `--remote`; Wrangler 4 defaults to local storage):

```sh
bunx wrangler kv key put    --binding LINKS --remote meet  "https://cal.com/you"
bunx wrangler kv key put    --binding LINKS --remote s/xyz "https://example.org/page"
bunx wrangler kv key get    --binding LINKS --remote meet
bunx wrangler kv key list   --binding LINKS --remote
bunx wrangler kv key delete --binding LINKS --remote meet
```

## CI/CD

`.github/workflows/deploy.yml`:

- Pull requests: typecheck against `wrangler.example.jsonc`. No secrets, no deploy.
- Push to `main` / manual run: typecheck, then `wrangler deploy`.

### API token

Cloudflare → My Profile → API Tokens → Create Token → Create Custom Token:

| Scope | Permission | Access | Resource |
| --- | --- | --- | --- |
| Account | Workers Scripts | Edit | your account |
| Zone | Workers Routes | Edit | `<YOUR_ZONE>` only |
| Zone | Zone | Read | `<YOUR_ZONE>` only |

No KV or DNS permissions are needed: deploy only attaches the namespace by id.

### Repository secrets

```sh
gh secret set CLOUDFLARE_API_TOKEN                     # paste the token
gh secret set CLOUDFLARE_ACCOUNT_ID --body <ACCOUNT_ID>
gh secret set WRANGLER_JSONC < wrangler.jsonc          # full local config
gh secret list
```

Re-run the last command whenever you change `wrangler.jsonc` — CI deploys
from the secret, not your local file. Secret values are masked in Actions logs.

### Run

```sh
git push                    # or: gh workflow run deploy.yml
gh run watch                # pick the run when prompted
```

## License

MIT
