# People Graph: query demo

An interactive demo of how querying a **people graph** works. A people graph models workforce data as a network of connected entities (people, roles, skills, courses, certifications, teams), so questions like *"which skills separate my current role from the next one?"* become traversals rather than chains of joins.

**▶ Live demo: https://lstehlik2809.github.io/people-graph-query-demo/**

The demo uses a fictional company of 1,000 employees (about 20,000 relationships). You pick a question, set its inputs, and watch the query walk the graph step by step. The equivalent Cypher (graph) and SQL (Snowflake-style) are shown side by side.

> **All data is synthetic.** Every name, role, skill level and number is generated from a fixed random seed. No real organisation or person is represented.

## The eight questions

| # | Question | Typical use case | Graph advantage over SQL* |
|---|---|---|---|
| 1 | Skills gap to a target role | Career self-service | Low |
| 2 | Reachable career paths (1–2 observed moves) | Career self-service | High |
| 3 | Internal talent for a role | Talent mobility, staffing | Low–Medium |
| 4 | Learning path with prerequisites and mentors | Adaptive learning | High |
| 5 | Succession bench, inside and beyond the reporting line | Succession planning | Medium |
| 6 | Who bridges two departments? | Organisational network analysis | Medium |
| 7 | Certification gaps (missing, expired, expiring) | Compliance | Low |
| 8 | Skill concentration risk | Strategic workforce planning | Low |

\* The author's assessment, not a benchmark. Graphs pay off mainly for **variable-length paths** (career moves, prerequisite chains, reporting lines) and open-ended exploration. Aggregations and simple joins remain a better fit for the relational warehouse, which stays the source of truth.

Clicking any node runs a *"what is this connected to?"* query and offers follow-up questions about that person, role or department.

## How it works

- **One static page, no backend.** `index.html` contains the data generator, a small in-memory graph, the query engine and a canvas renderer. Nothing is sent anywhere.
- **The queries really run.** Each question is executed by the JavaScript engine in `src/graph.js`, and the trace counts the relationships it actually reads. The animation then replays that traversal step by step.
- **The Cypher and SQL are illustrative.** They show how you would write each query in a graph database or a warehouse. They have not been executed against Neo4j or Snowflake.

## Data model

Seven node types: `Person`, `Role`, `Skill`, `Course`, `Certification`, `Team`, `Department`. Fifteen relationship types, with properties on the relationships where they belong:

- `HAS_SKILL {level, source, confidence}`
- `REQUIRES {level}` (role → skill)
- `MOVED_TO {moves}` (role → role, derived from job history)
- `CERTIFIED {expires}`
- plus `REPORTS_TO`, `COLLABORATES_WITH`, `HOLDS`, `HELD`, `MEMBER_OF`, `PART_OF`, `HEADS`, `TEACHES`, `COMPLETED`, `REQUIRES_COURSE`, `REQUIRES_CERT`

Open **Data model** in the app for a diagram with relationship counts.

## Definitions and assumptions

- **Skill levels** run 1–5; 0 means no evidence.
- **Skill fit** is the sum of a person's levels, each capped at the required level, divided by the sum of the required levels.
- **Cut-offs are demo assumptions, not recommendations:** ≥ 70% fit for talent matching; *ready now* = fit ≥ 80% and performance ≥ 4; *critical skill* = ≤ 3 experts (level 4–5) for ≥ 5 positions.
- **Compliance status** is calculated against the snapshot date, 18 Nov 2026.

## Repository layout

```
index.html          built, self-contained page (served by GitHub Pages)
src/graph.js        synthetic data generator, graph store, query engine
src/ui.js           canvas renderer, query console, trace and results UI
src/template.html   page shell and styles
src/verify.js       recomputes headline numbers directly from the raw edges
build.py            inlines the sources into index.html
```

To change something, edit the files in `src/`, then run:

```bash
python build.py        # rebuild index.html
node src/verify.js     # optional: independent check of headline numbers
```

## Limitations

- The questions are presets with inputs; there is no free-text Cypher box.
- Exploring by clicking the graph needs a pointer. The question list, inputs and result rows work with a keyboard.
- In the graph, status is shown mainly by colour. The result tables carry the same information as text.
- In a real deployment, collaboration data (for network analysis) and performance ratings need governance, access control and, in many countries, works-council and data-protection approval.
