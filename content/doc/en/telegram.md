# Telegram Bot

The company is two-way: a Telegram bot lets you check status, trigger runs, and **interview any agent live**.

## Commands

- `/status` — current state of every agent.
- `/agents` — the six agents and their cadence.
- `/run <dept>` — trigger an agent run on demand (for example `/run finx`).
- `/report <dept>` — the latest **published** report for a department.
- `/ask <dept> <question>` — ask an agent a question; it researches the web and answers with citations.

Departments: `finx`, `msx`, `aix`, `operx`, `ceox`, `cyberx`.

## Deep-dive focus sessions

After an `/ask`, that chat enters a **15-minute focus session** on that agent. You can then just type follow-up questions as plain messages — no command needed — and the agent continues the thread, researching further when useful.

- The agent keeps the last several turns as context.
- Type `/end` to close the session early, or let it expire after 15 minutes.

This makes the bot a real research assistant: ask once, then drill in conversationally.
