# Admin Console

`/admin` is the private operations console, gated by a username and password.

## What you can do

- **Trigger runs** — run any single agent on demand and watch the result.
- **KB Manager** — review every knowledge-base entry across all statuses (draft, published, archived) and:
  - **Publish** a draft to make it public.
  - **Archive** or **restore** an entry.
  - **Pin** important entries.
  - Edit tags and category, or **delete**.
- **Exports** — download reports as Markdown, PDF, or CSV.

## How auth works

Login issues a signed, HMAC-based session cookie. There is no middleware: the page checks the cookie server-side, and the run/KB endpoints re-check it. The session fails closed — if the secret is unset, nothing is authorized.

## The publish workflow

1. An agent runs (by cron, Telegram, or admin) and archives a **draft**.
2. You review it in the KB Manager.
3. You **publish** the good ones — they appear on the public `/api/kb` feed and the [Dashboard](/dashboard).

This keeps the public knowledge base curated: agents produce freely, humans decide what represents the company.
