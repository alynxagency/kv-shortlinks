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

[Bun](https://bun.sh). Wrangler runs via `bunx` from dev dependencies.
`bun run dev` (local server) additionally needs Node.js on `PATH`; deploys and
KV commands work with Bun alone.

## Setup

```sh
bun install
bunx wrangler login
bunx wrangler kv namespace create LINKS        # note the printed id
cp wrangler.example.jsonc wrangler.jsonc       # gitignored; holds your real values
```

Edit `wrangler.jsonc`:

- `name` — Worker name.
- `vars.ROOT_URL` — where `/` redirects (`""` to return 404).
- `routes` — your hostname(s), e.g. `short.example.com/*`. Only listed
  hostnames reach the Worker; add `www.` explicitly if wanted.
- `kv_namespaces[0].id` — the id from above. Keep the binding name `LINKS`.

Then:

```sh
bun run check      # generate Worker types + typecheck
bun run deploy
```

### DNS

Routes only fire for proxied hostnames. If the hostname has no DNS record,
add a proxied placeholder in Cloudflare DNS: `AAAA  <name>  100::  Proxied`.

### Origin fallback

Unknown paths return `404`. If an origin sits behind the hostname and
should serve non-link paths, replace the last line of `src/index.ts` with
`return fetch(request);`.

## Managing links

**Dashboard:** Storage & Databases → Workers KV → your namespace → KV Pairs.
Key `s/xyz`, value `https://…` (no quotes). Changes reach all edges within ~60 s;
no redeploy needed.

**CLI** (always `--remote`; Wrangler 4 defaults to local storage):

```sh
bunx wrangler kv key put    --binding LINKS --remote meet  "https://cal.com/you"
bunx wrangler kv key put    --binding LINKS --remote s/xyz "https://example.org/page"
bunx wrangler kv key get    --binding LINKS --remote meet
bunx wrangler kv key list   --binding LINKS --remote
bunx wrangler kv key delete --binding LINKS --remote meet
```

## Testing

```sh
curl -sI https://example.com/meet     # 302, location: <stored URL>
curl -sI https://example.com/         # 302, location: ROOT_URL
curl -sI https://example.com/missing  # 404
```

## CI/CD

`.github/workflows/deploy.yml`:

- Pull requests: typecheck against `wrangler.example.jsonc`. No secrets, no deploy.
- Push to `main` / manual run: typecheck, then `wrangler deploy`.

Repository secrets (Settings → Secrets and variables → Actions):

| Secret | Value |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | API token from the "Edit Cloudflare Workers" template, scoped to your account and zone |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account id |
| `WRANGLER_JSONC` | Full contents of your local `wrangler.jsonc` |

## License

MIT
