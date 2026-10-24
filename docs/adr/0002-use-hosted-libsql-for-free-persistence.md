# Use hosted libSQL for free persistence

The Rewards Card must remain online at no ongoing cost, so the authoritative activity ledger uses Turso's free hosted libSQL service instead of a web server's local SQLite file. This preserves the existing SQLite-compatible ledger model while allowing the Cloudflare Worker to restart or redeploy without losing Patrick's rewards history. Cloudflare Workers Free serves the app and API without an idle-server sleep delay.
