# Knowledge Base

Every agent run is archived as a knowledge-base entry — a permanent, addressable record of what the company learned that day.

## Draft → publish gate

A new run is archived as a **draft**. Drafts are private. An admin reviews each entry in the [Admin Console](/doc/admin) and **publishes** the ones worth keeping public. Only published entries appear on the public feed.

## The public API

Published knowledge is available at `/api/kb`:

- **List** — `/api/kb?dept=&category=&q=&from=&to=&limit=` filters the feed.
- **Single entry** — `/api/kb?slug=<slug>` returns one entry plus its **related** graph.

Each entry has a stable `slug` (for example `fin-thai-tax-funds-2026-06-04`), a `theme`, its `sources`, its `provenance`, and `related` entry links.

## The knowledge graph

Entries are connected three ways:

- **Series** — same department and theme over time.
- **Tags** — entries that share entity tags.
- **Cross-agent** — the CEOX's weekly synthesis links the source report of each department.

This is the stable contract that a future public reader site (`kb.nanoteofficial.me`) will consume.
