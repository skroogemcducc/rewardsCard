# Bend & Brew Rewards Card

A mobile-first Rewards Card for Patrick and a scanner-first Staff view for recording Qualifying Drinks.

## Local development

Node.js 24 is required.

```sh
npm ci
npm test
npm start
```

Without environment variables, the app uses an in-memory database and the development Staff PIN `demo-staff-code`. Local data is intentionally discarded when the process stops.

## Production

Production runs on Cloudflare Workers Free and stores its authoritative activity ledger in Turso. Configure these Worker secrets:

- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `STAFF_ACCESS_CODE`

Deploy with `npm run deploy`. Cloudflare serves the static phone interface and routes `/api/*` and `/health` through the Worker. Never deploy production without all three secrets.

The Member opens `/`. Staff open `/staff`, enter the private Staff PIN, and scan the Member's permanent Rewards Card QR.
