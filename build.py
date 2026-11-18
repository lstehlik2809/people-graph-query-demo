"""Rebuild index.html from the sources in src/.

    python build.py

Inlines src/graph.js (data generator + query engine) and src/ui.js (renderer + UI)
into src/template.html, producing one self-contained index.html.
"""
from pathlib import Path

root = Path(__file__).parent
src = root / "src"
page = (src / "template.html").read_text(encoding="utf-8")
graph = (src / "graph.js").read_text(encoding="utf-8")
ui = (src / "ui.js").read_text(encoding="utf-8")
assert "</script" not in graph and "</script" not in ui
page = page.replace("/*__GRAPH__*/", graph).replace("/*__UI__*/", ui)
(root / "index.html").write_text(page, encoding="utf-8")
print(f"index.html written ({len(page):,} characters)")
