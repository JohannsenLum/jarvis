#!/usr/bin/env python3
"""Find existing folders worth bringing into Jarvis's vault.

Reads only names, sizes and dates, never file contents. Prints JSON: one entry per candidate folder
with counts, a guessed kind (client, project, work, finance, health, code, media, other) and a few
sample document names, so Jarvis can ask the user what to import.

Usage: python3 hermes/scan_folders.py [--roots DIR ...] [--out FILE] [--max-files 4000]
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

HOME = Path.home()
REPO = Path(__file__).resolve().parent.parent

DOCS = {".pdf", ".doc", ".docx", ".md", ".txt", ".rtf", ".pages", ".key", ".numbers", ".xlsx", ".xls",
        ".csv", ".pptx", ".ppt", ".odt", ".ods", ".odp", ".eml", ".html"}
MEDIA = {".jpg", ".jpeg", ".png", ".heic", ".gif", ".mov", ".mp4", ".m4v", ".mp3", ".wav", ".m4a", ".psd",
         ".ai", ".sketch", ".fig", ".raw", ".cr2", ".dng"}
CODE_MARKERS = {".git", "package.json", "pyproject.toml", "Cargo.toml", "go.mod", "Gemfile", "pom.xml"}
SKIP_DIRS = {"node_modules", ".git", ".venv", "venv", "__pycache__", ".next", "dist", "build", ".cache",
             "Library", "Applications", ".Trash"}
SKIP_SUFFIXES = (".app", ".photoslibrary", ".musiclibrary", ".tvlibrary", ".fcpbundle", ".imovielibrary")

# Folder names whose children are the real candidates (Documents/Clients/Brightlabs).
CONTAINERS = re.compile(r"^(clients?|customers?|projects?|work|jobs?|agency|company|companies|freelance|accounts)$", re.I)
KINDS = [
    ("finance", re.compile(r"\b(tax|taxes|bank|statement|payslip|salary|invoice[s]? paid|insurance|mortgage|loan|cpf|iras|budget|receipts?)\b", re.I)),
    ("health", re.compile(r"\b(medical|health|clinic|hospital|lab results?|prescription|dental|vaccin\w*|doctor)\b", re.I)),
    ("client", re.compile(r"\b(client|customer|brief|proposal|contract|sow|statement of work|retainer|quote|invoice)\b", re.I)),
    ("project", re.compile(r"\b(project|roadmap|spec|requirements|kickoff|deliverables?|milestone|launch)\b", re.I)),
    ("work", re.compile(r"\b(meeting|minutes|report|okr|strategy|pitch|deck|board|investor|hiring|sop|policy)\b", re.I)),
]


def default_roots() -> list[Path]:
    roots = [HOME / "Documents", HOME / "Desktop", HOME / "Downloads",
             HOME / "Library" / "Mobile Documents" / "com~apple~CloudDocs"]
    cloud = HOME / "Library" / "CloudStorage"
    if cloud.is_dir():
        roots += sorted(p for p in cloud.iterdir() if p.is_dir())
    return [r for r in roots if r.is_dir()]


def excluded(path: Path) -> bool:
    jarvis_dirs = {REPO, REPO.parent / "jarvis-voice", HOME / ".jarvis-voice"}
    return (path.name.startswith(".") or path.name in SKIP_DIRS or path.name.endswith(SKIP_SUFFIXES)
            or any(path == d or d in path.parents for d in jarvis_dirs))


def summarize(folder: Path, max_files: int, deadline: float) -> dict | None:
    files = docs = media = size = 0
    newest = 0.0
    samples: list[str] = []
    names_for_guess: list[str] = [folder.name]
    is_code = any((folder / m).exists() for m in CODE_MARKERS)
    truncated = False
    for dirpath, dirnames, filenames in os.walk(folder):
        dirnames[:] = [d for d in dirnames if not excluded(Path(dirpath) / d)]
        if any(m in dirnames or m in filenames for m in CODE_MARKERS) and dirpath != str(folder):
            is_code = is_code or len(Path(dirpath).relative_to(folder).parts) <= 1
        for name in filenames:
            if name.startswith("."):
                continue
            files += 1
            ext = Path(name).suffix.lower()
            try:
                st = os.stat(os.path.join(dirpath, name))
                size += st.st_size
                newest = max(newest, st.st_mtime)
            except OSError:
                pass
            if ext in DOCS:
                docs += 1
                if len(samples) < 6:
                    samples.append(name)
                if len(names_for_guess) < 60:
                    names_for_guess.append(Path(name).stem)
            elif ext in MEDIA:
                media += 1
            if files >= max_files or time.monotonic() > deadline:
                truncated = True
                break
        if truncated:
            break
    if files == 0:
        return None
    text = " ".join(names_for_guess).replace("_", " ").replace("-", " ")
    if is_code:
        kind = "code"
    elif media > max(docs * 3, 20):
        kind = "media"
    else:
        kind = next((k for k, rx in KINDS if rx.search(text)), "other")
    return {
        "path": str(folder), "name": folder.name, "kind": kind,
        "files": files, "documents": docs, "media": media, "size_mb": round(size / 1_048_576, 1),
        "last_modified": time.strftime("%Y-%m-%d", time.localtime(newest)) if newest else None,
        "sample_documents": samples, "truncated": truncated,
    }


def candidates(root: Path) -> list[Path]:
    out: list[Path] = []
    try:
        children = sorted(p for p in root.iterdir() if p.is_dir() and not excluded(p))
    except PermissionError:
        return out
    for child in children:
        if CONTAINERS.match(child.name):
            try:
                inner = sorted(p for p in child.iterdir() if p.is_dir() and not excluded(p))
            except PermissionError:
                inner = []
            out += inner or [child]
        else:
            out.append(child)
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--roots", nargs="*", type=Path, help="folders to scan (default: Documents, Desktop, Downloads, iCloud, cloud drives)")
    ap.add_argument("--out", type=Path, help="write JSON here instead of stdout")
    ap.add_argument("--max-files", type=int, default=4000, help="stop counting a folder after this many files")
    ap.add_argument("--time-limit", type=float, default=60.0, help="overall seconds before stopping")
    args = ap.parse_args()

    roots = [r.expanduser() for r in args.roots] if args.roots else default_roots()
    deadline = time.monotonic() + args.time_limit
    found, skipped = [], []
    for root in roots:
        for folder in candidates(root):
            if time.monotonic() > deadline:
                skipped.append(str(folder))
                continue
            entry = summarize(folder, args.max_files, deadline)
            if entry:
                entry["root"] = str(root)
                found.append(entry)
    order = {"client": 0, "project": 1, "work": 2, "other": 3, "finance": 4, "health": 5, "code": 6, "media": 7}
    found.sort(key=lambda e: (order.get(e["kind"], 9), -(e["documents"])))
    result = {"scanned_at": time.strftime("%Y-%m-%dT%H:%M:%S"), "roots": [str(r) for r in roots],
              "folders": found, "not_scanned_time_limit": skipped,
              "note": "Names, sizes and dates only. No file contents were read."}
    text = json.dumps(result, indent=2, ensure_ascii=False)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(text)
        kinds: dict[str, int] = {}
        for e in found:
            kinds[e["kind"]] = kinds.get(e["kind"], 0) + 1
        print(f"Found {len(found)} folders: " + ", ".join(f"{v} {k}" for k, v in sorted(kinds.items(), key=lambda kv: order.get(kv[0], 9))))
        print(f"Saved to {args.out}")
    else:
        sys.stdout.write(text + "\n")


if __name__ == "__main__":
    main()
