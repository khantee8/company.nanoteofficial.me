# The 6 Agents

Each department is an autonomous Claude agent with a standing mandate. They also **collaborate**: agents that run later in the day can see the earlier outputs of their colleagues and build on them.

## FinX
A **Thai mutual-fund analyst**. Each run compares real funds in a rotating theme (US index, global tech/semiconductors, or Thai tax-saving SSF/RMF/Thai ESG), citing every fee, AUM, and return figure.

## CyberX
A daily **threat brief**. Pulls newly-exploited CVEs from the CISA KEV catalog (`api`) and adds web-researched advisories (`web · cited`) with severity and mitigation.

## AIX
An **adoption radar**. Tracks trending repositories and researches real papers, releases, and tools in a rotating focus (AI agents, or LLM infrastructure).

## M&SX
A **demand-driven content plan**. Reads real developer demand (Hacker News, Dev.to, site analytics), researches signals, and proposes content tied to live trends.

## OperX
A **deployment-health scorecard**. Reads CI/CD state from Vercel + GitHub and flags the single most important thing to fix today.

## CEOX
A weekly **executive synthesis**. Aggregates the whole company's state into the Executive Cockpit and cross-links the source report from each department.

See each agent's live output on the **[Dashboard](/dashboard)**.
