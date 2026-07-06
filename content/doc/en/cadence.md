# Cadence & Provenance

## When each agent runs

Agents run on a **mixed schedule** (UTC), not all at once:

- **CyberX** — daily
- **OperX** — daily
- **FinX** — Monday / Wednesday / Friday (rotating theme)
- **AIX** — Tuesday / Thursday
- **M&SX** — Monday / Thursday
- **CEOX** — Sunday (weekly synthesis)

Schedules are defined in `vercel.json` as Vercel Cron jobs. You can also trigger any agent on demand from the [Admin Console](/doc/admin) or the [Telegram bot](/doc/telegram).

## Provenance: how to trust a chart

Every artifact carries a badge:

- **`api`** — built deterministically from a real API response. The numbers are exactly what the source returned.
- **`web · cited`** — built from the agent's web research, where **every figure has a citation** (`url`, `title`, `date`). Uncited data is dropped before the chart is built.

The model only ever writes the prose narrative. Charts are assembled by deterministic code from validated data, so a chart can't be malformed or hallucinated. This is the project's core invariant: **never uncited**.

## Sources

On any agent detail page, the **Sources** section lists every citation behind that report's web-researched figures, with a date and a link you can verify yourself.
