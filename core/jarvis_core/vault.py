"""Vault operations with the SCHEMA rules enforced, shared by the MCP server, hooks and CLI.

Rules enforced here (see knowledge/SCHEMA.md):
- Paths stay inside the vault; no hidden files, no symlinks.
- `raw/` is write-once: new files only, never edited.
- `me/` is the user's: only `me/_proposals.md` (append via propose), `me/onboarding.json` and
  `me/routines.md` are writable, plus first-time creation of the onboarding pages while onboarding runs.
- Private areas (PRIVATE) are never excerpted or searched with content, and reading them needs
  `read(..., allow_private=True)`, which the MCP server only offers through a tool that always asks.
- Writes are atomic, serialised with a lock, and the previous version of a changed page is kept in
  `.history/` so a bad write can be undone (`restore`).
- Every write appends one line to `log.md`; for private pages that line names the page, nothing more.
- Spaces: a folder with a SPACE.md (each company, each client) is a self-contained knowledge base with
  its own `raw/` (write-once), `log.md` (every change in it) and `index.md` (generated). Pages in a space
  shouldn't link outside it, so the folder can one day be shared on its own without leaking anything else;
  writes that do get a warning, and `space_check` reports what would leak.
- A client or project space has a `dev/` folder for code: each project inside it is its own git repo.
  dev/ is not part of the knowledge base: never indexed, searched, recalled, synced or shared, and the
  vault tools don't read or write it (coding tools do).
"""
from __future__ import annotations

import contextlib
import datetime as _dt
import fcntl
import json
import os
import re
import subprocess
import tempfile
from pathlib import Path

from . import config

# The one list of private areas. recall.py, the MCP server, the office dashboard and the docs follow it.
PRIVATE = ("life/health/", "life/finance/", "journal/", "relationships/", "frameworks/declarations/",
           "frameworks/deal-cards/")
TEXT_SUFFIXES = {".md", ".txt", ".json", ".csv", ".yaml", ".yml"}
ME_ALWAYS_WRITABLE = ("me/onboarding.json", "me/routines.md")
# Pages onboarding creates for the user (create only, never replace, and only until onboarding is complete).
ME_ONBOARDING_PAGES = re.compile(r"^me/(profile\.md|principles\.md|goals/[\w-]+\.md|frameworks/[\w-]+\.md|decision-tools/[\w-]+\.md)$")
HISTORY_KEEP = 20


class VaultError(ValueError):
    """A request broke a vault rule. The message says which and what to do instead."""


def today() -> str:
    return _dt.date.today().isoformat()


def resolve(rel: str) -> Path:
    root = config.vault().resolve()
    rel = (rel or "").strip().lstrip("/")
    # Reject hidden aliases and symlinks before resolution erases that information.
    parts = Path(rel).parts
    if any(part.startswith(".") and part not in (".", "..") for part in parts):
        raise VaultError(f"'{rel}' is a hidden path; hidden files aren't part of the vault.")
    current = root
    for part in parts:
        current = current / part
        if current.is_symlink():
            raise VaultError("Symlinks aren't supported inside the vault.")
    path = (root / rel).resolve()
    if path != root and root not in path.parents:
        raise VaultError(f"'{rel}' is outside the vault.")
    if any(part.startswith(".") for part in path.relative_to(root).parts):
        raise VaultError(f"'{rel}' is a hidden path; hidden files aren't part of the vault.")
    return path


DEV_DIR = "dev"
SKIP_DIRS = {"node_modules", "__pycache__"}


def walk(base: Path, suffixes: set[str] | None = None):
    """Files under `base`, skipping hidden folders, dependency folders, symlinks and each space's dev/."""
    for dirpath, dirnames, filenames in os.walk(base):
        here = Path(dirpath)
        dirnames[:] = sorted(d for d in dirnames if not d.startswith(".") and d not in SKIP_DIRS
                             and not (d == DEV_DIR and (here / "SPACE.md").is_file()))
        for name in sorted(filenames):
            p = here / name
            if name.startswith(".") or p.is_symlink() or (suffixes and p.suffix.lower() not in suffixes):
                continue
            yield p


def in_dev(rel: str) -> bool:
    """Is this path inside a space's dev/ folder (code, not knowledge)?"""
    root = config.vault().resolve()
    parts = Path(rel.strip("/")).parts
    return any(parts[i] == DEV_DIR and (root.joinpath(*parts[:i]) / "SPACE.md").is_file() for i in range(1, len(parts)))


def rel_of(path: Path) -> str:
    return path.resolve().relative_to(config.vault().resolve()).as_posix()


def is_private(rel: str) -> bool:
    rel = rel.casefold().strip("/")
    return any(rel.startswith(p) or rel + "/" == p for p in PRIVATE)


@contextlib.contextmanager
def _locked():
    """Serialise writes from every process (sessions, cron, MCP servers) touching this vault."""
    root = config.vault()
    root.mkdir(parents=True, exist_ok=True)
    with open(root / ".jarvis.lock", "a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(lock, fcntl.LOCK_UN)


def _atomic_write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".tmp-", suffix=path.suffix)
    try:
        with os.fdopen(fd, "w") as f:
            f.write(text)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    except BaseException:
        with contextlib.suppress(OSError):
            os.unlink(tmp)
        raise


def _history_dir(rel: str) -> Path:
    return config.vault().resolve() / ".history" / rel


def _snapshot(path: Path, rel: str) -> None:
    """Keep the version about to be changed, newest last, at most HISTORY_KEEP per page."""
    if not path.exists():
        return
    folder = _history_dir(rel)
    folder.mkdir(parents=True, exist_ok=True)
    stamp = _dt.datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    (folder / f"{stamp}{path.suffix}").write_bytes(path.read_bytes())
    versions = sorted(folder.iterdir())
    for old in versions[:-HISTORY_KEEP]:
        with contextlib.suppress(OSError):
            old.unlink()


def _one_line(text: str, limit: int = 300) -> str:
    """Log entries are one line: no newlines that could forge extra entries."""
    return re.sub(r"\s+", " ", str(text or "")).strip()[:limit]


DEV_MESSAGE = ("is in a client's dev/ folder: code lives there in its own git repos, outside the knowledge base. "
               "Use your coding tools for it; the vault tools don't read or write it.")


def read(rel: str, max_chars: int = 20_000, allow_private: bool = False) -> str:
    path = resolve(rel)
    if in_dev(rel):
        raise VaultError(f"'{rel}' {DEV_MESSAGE}")
    rel = path.relative_to(config.vault().resolve()).as_posix() if path != config.vault().resolve() else ""
    if rel and is_private(rel) and not allow_private:
        raise VaultError(f"'{rel}' is in a private area. Open it with jarvis_read_private, which asks the user first, "
                         "and only when this request needs it.")
    if not path.exists():
        raise VaultError(f"'{rel}' doesn't exist. Use jarvis_search to find the right page.")
    if path.is_dir():
        items = sorted(p.name + ("/" if p.is_dir() else "") for p in path.iterdir() if not p.name.startswith("."))
        return "\n".join(items) or "(empty folder)"
    text = path.read_text(errors="replace")
    return text if len(text) <= max_chars else text[:max_chars] + f"\n… (truncated at {max_chars} characters)"


def _log_line(entry: str, kind: str) -> str:
    line = f"## [{today()}] {_one_line(kind, 20) or 'update'} | {_one_line(entry)}"
    path = resolve("log.md")
    with path.open("a") as f:
        f.write(line + "\n")
    return line


def log(entry: str, kind: str = "update") -> str:
    with _locked():
        return _log_line(entry, kind)


def _onboarding_active() -> bool:
    data = _load_onboarding(strict=False)
    return data.get("status") != "complete"


def write(rel: str, content: str, mode: str = "create", reason: str = "") -> str:
    """mode: create (fail if it exists; the default) | replace | append."""
    if mode not in ("create", "replace", "append"):
        raise VaultError("mode must be create, replace or append.")
    path = resolve(rel)
    rel = path.relative_to(config.vault().resolve()).as_posix()
    if in_dev(rel):
        raise VaultError(f"'{rel}' {DEV_MESSAGE}")
    # macOS volumes are commonly case-insensitive; protect both spellings on every OS.
    policy = rel.casefold()
    if path.suffix.lower() not in TEXT_SUFFIXES:
        raise VaultError(f"Only text files can be written ({', '.join(sorted(TEXT_SUFFIXES))}).")
    with _locked():
        exists = path.exists()
        space = space_of(rel)
        if (policy.startswith("raw/") or "/raw/" in policy) and exists:
            raise VaultError("Files in raw/ are never edited. Save a new source instead.")
        if space and rel == f"{space}/index.md":
            raise VaultError(f"{rel} is generated from the space's pages. Write the pages; the index updates itself.")
        if space and rel in (f"{space}/log.md",) and mode != "append":
            raise VaultError(f"{rel} is append-only (it's this space's change log).")
        if space and rel == f"{space}/{SPACE_FILE}" and exists and mode != "replace":
            raise VaultError(f"{rel} describes the space. Read it, then replace it if it must change.")
        if policy.startswith("me/") and policy not in ME_ALWAYS_WRITABLE + ("me/_proposals.md",):
            if not (ME_ONBOARDING_PAGES.match(policy) and mode == "create" and not exists and _onboarding_active()):
                raise VaultError("me/ belongs to the user. Use jarvis_propose to suggest the change instead"
                                 " (onboarding may only create its pages, once).")
        if policy in ("log.md", "me/_proposals.md") and mode != "append":
            raise VaultError(f"{rel} is append-only. Use jarvis_log or jarvis_propose.")
        if mode == "create" and exists:
            raise VaultError(f"'{rel}' already exists. Read it first, then use mode=append to add to it or "
                             "mode=replace to rewrite it (the old version is kept and can be restored).")
        body = content.rstrip("\n") + "\n"
        if mode == "append" and exists:
            old = path.read_text(errors="replace")
            body = old + ("" if not old or old.endswith("\n") else "\n") + body
        if exists and policy != "log.md":
            _snapshot(path, rel)
        if mode == "create":
            path.parent.mkdir(parents=True, exist_ok=True)
            try:
                fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            except FileExistsError:
                raise VaultError(f"'{rel}' was just created by someone else. Read it, then append or replace.")
            with os.fdopen(fd, "w") as f:
                f.write(body)
        else:
            _atomic_write(path, body)
        verb = {"create": "create", "replace": "update" if exists else "create", "append": "update"}[mode]
        # Private pages: the log names the page and nothing about what changed.
        _log_line(rel if is_private(rel) or not reason else f"{rel}: {reason}", verb)
        note = ""
        if space and rel != f"{space}/log.md":
            _space_log(space, f"{rel[len(space) + 1:]}{': ' + _one_line(reason) if reason else ''}", verb)
            _space_index(space)
            outside = _outside_links(space, content)
            if outside:
                note = (f" Note: this page links outside its space ({', '.join(outside[:5])}). If {space} is ever shared,"
                        " those links break or point at private pages; copy the facts it needs into this space instead.")
    return f"{'Updated' if exists else 'Created'} {rel}.{note}" if note else f"{'Updated' if exists else 'Created'} {rel}"


def history(rel: str) -> list[str]:
    path = resolve(rel)
    rel = path.relative_to(config.vault().resolve()).as_posix()
    folder = _history_dir(rel)
    return sorted(p.name for p in folder.iterdir()) if folder.is_dir() else []


def restore(rel: str, version: str = "") -> str:
    """Put back an earlier version of a page (the latest saved one by default). The current version is
    saved first, so a restore can itself be undone."""
    path = resolve(rel)
    rel = path.relative_to(config.vault().resolve()).as_posix()
    if rel.casefold().startswith("raw/"):
        raise VaultError("raw/ sources are never edited, so there is nothing to restore.")
    versions = history(rel)
    if not versions:
        raise VaultError(f"No earlier versions of '{rel}' are saved.")
    pick = version or versions[-1]
    if pick not in versions:
        raise VaultError(f"Unknown version. Saved versions: {', '.join(versions[-10:])}")
    with _locked():
        old = (_history_dir(rel) / pick).read_text(errors="replace")
        _snapshot(path, rel)
        _atomic_write(path, old)
        _log_line(f"{rel}: restored version {pick}", "restore")
    return f"Restored {rel} to the version saved {pick[:8]} {pick[9:15]}."


def propose(change: str, why: str = "", source: str = "") -> str:
    with _locked():
        path = resolve("me/_proposals.md")
        if not path.exists():
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("# Proposed changes to me/\n\nJarvis suggests; you decide. Say yes/no to each.\n\n")
        entry = f"- [ ] {today()}: {_one_line(change, 1000)}"
        if why:
            entry += f"\n  - Why: {_one_line(why, 1000)}"
        if source:
            entry += f"\n  - Source: {_one_line(source, 300)}"
        with path.open("a") as f:
            f.write(entry + "\n")
        _log_line(f"me/_proposals.md: {_one_line(change, 80)}", "propose")
    return "Added to me/_proposals.md"


def search(query: str, limit: int = 10, space: str = "") -> list[dict]:
    """Case-insensitive search over file names and contents. Private areas only ever return the path
    (open them with jarvis_read_private if the request needs it); log.md, raw/ and templates are skipped."""
    root = config.vault()
    terms = [t for t in re.split(r"\s+", query.lower().strip()) if t]
    if not terms:
        return []
    results = []
    for path in walk(root, TEXT_SUFFIXES):
        try:
            resolve(path.relative_to(root).as_posix())
            rel = rel_of(path)
        except (VaultError, ValueError, OSError):
            continue
        low_rel = rel.casefold()
        if space and not low_rel.startswith(space.casefold().strip("/") + "/"):
            continue
        if any(part.startswith(".") for part in Path(rel).parts) or low_rel.startswith(("raw/", "_templates/")) or low_rel.endswith("log.md") or "/raw/" in low_rel:
            continue
        try:
            text = path.read_text(errors="ignore")
        except OSError:
            continue
        hay = (rel + "\n" + text).lower()
        if not all(t in hay for t in terms):
            continue
        # Rank: hits in the path count most; long pages don't win on raw counts alone.
        score = sum(5 for t in terms if t in low_rel) + sum(min(hay.count(t), 5) for t in terms)
        entry = {"path": rel, "score": score}
        if is_private(rel):
            entry["snippet"] = "(private area: open with jarvis_read_private only if this request needs it)"
        else:
            low = text.lower()
            i = max(0, low.find(terms[0]) - 80)
            entry["snippet"] = re.sub(r"\s+", " ", text[i:i + 240]).strip()
        results.append(entry)
    results.sort(key=lambda e: -e["score"])
    return results[:limit]


def _load_onboarding(strict: bool) -> dict:
    path = resolve("me/onboarding.json")
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text())
    except (OSError, ValueError):
        if strict:
            raise VaultError("me/onboarding.json is damaged, so it wasn't changed. Fix or restore it first "
                             "(jarvis_restore me/onboarding.json).")
        return {}
    return data if isinstance(data, dict) else {}


def onboarding() -> dict:
    try:
        return _load_onboarding(strict=False)
    except VaultError:
        return {}


MERGED_LISTS = {"pending": "question", "imports": "source"}


def update_onboarding(patch: dict) -> dict:
    """Deep-merge a patch into me/onboarding.json. `pending` and `imports` are merged by question/source
    (send `{"pending": []}` inside `replace_lists` to clear); other lists are replaced."""
    replace = set(patch.pop("replace_lists", []) or [])

    def merge(a: dict, b: dict, top: bool) -> dict:
        for k, v in b.items():
            if isinstance(v, dict):
                a[k] = merge(a.get(k, {}) if isinstance(a.get(k), dict) else {}, v, False)
            elif top and k in MERGED_LISTS and isinstance(v, list) and k not in replace and isinstance(a.get(k), list):
                key = MERGED_LISTS[k]
                by = {json.dumps(x.get(key), sort_keys=True) if isinstance(x, dict) else json.dumps(x): x for x in a[k]}
                for x in v:
                    by[json.dumps(x.get(key), sort_keys=True) if isinstance(x, dict) else json.dumps(x)] = x
                a[k] = list(by.values())
            else:
                a[k] = v
        return a
    with _locked():
        data = merge(_load_onboarding(strict=True), patch, True)
        path = resolve("me/onboarding.json")
        if path.exists():
            _snapshot(path, "me/onboarding.json")
        _atomic_write(path, json.dumps(data, indent=2, ensure_ascii=False) + "\n")
        _log_line(f"me/onboarding.json: {', '.join(patch)}", "update")
    return data


# ---------- spaces: one self-contained knowledge base per company and per client ----------

SPACE_FILE = "SPACE.md"
SPACE_KINDS = ("company", "client", "project", "team")


def space_of(rel: str) -> str | None:
    """The nearest folder above `rel` (or `rel` itself, for a folder) that is a space."""
    root = config.vault().resolve()
    parts = Path(rel.strip("/")).parts
    for i in range(len(parts), 0, -1):
        candidate = "/".join(parts[:i])
        if (root / candidate / SPACE_FILE).is_file() and not (root / candidate).is_symlink():
            return candidate
    return None


def _space_log(space: str, entry: str, kind: str) -> None:
    path = config.vault().resolve() / space / "log.md"
    if not path.exists():
        path.write_text(f"# Change log: {space}\n\nEvery change in this space, newest last. Append-only.\n\n")
    with path.open("a") as f:
        f.write(f"## [{today()}] {_one_line(kind, 20)} | {_one_line(entry)}\n")


def _title(path: Path) -> str:
    try:
        text = path.read_text(errors="ignore")[:4000]
    except OSError:
        return path.stem
    m = re.search(r"^#\s+(.+)$", text, re.M)
    return m.group(1).strip() if m else path.stem.replace("-", " ")


def _space_pages(space: str) -> tuple[list[Path], list[str]]:
    """Pages that belong to this space (not to a space nested inside it), and the nested spaces."""
    root = config.vault().resolve()
    base = root / space
    pages, nested = [], []
    for dirpath, dirnames, filenames in os.walk(base):
        here = Path(dirpath)
        keep = []
        for d in sorted(dirnames):
            if d.startswith(".") or d in SKIP_DIRS or (d == DEV_DIR and (here / SPACE_FILE).is_file()) or (here / d).is_symlink():
                continue
            if (here / d / SPACE_FILE).is_file():
                nested.append((here / d).relative_to(root).as_posix())   # its pages belong to it
                continue
            keep.append(d)
        dirnames[:] = keep
        pages += [here / n for n in sorted(filenames) if n.endswith(".md") and not n.startswith(".") and not (here / n).is_symlink()]
    return pages, nested


def _space_index(space: str) -> None:
    root = config.vault().resolve()
    meta = _space_meta(space)
    pages, nested = _space_pages(space)
    lines = [f"# {meta.get('name') or space.split('/')[-1]}: index", "",
             "_Generated by Jarvis from this space's pages. Don't edit; it's rewritten on every change._", ""]
    groups: dict[str, list[str]] = {}
    for p in pages:
        rel_in = p.relative_to(root / space).as_posix()
        if rel_in in ("index.md", "log.md", SPACE_FILE) or rel_in.startswith("raw/"):
            continue
        folder = str(Path(rel_in).parent)
        groups.setdefault("" if folder == "." else folder, []).append(f"- [[{rel_in[:-3]}|{_title(p)}]]")
    for folder in sorted(groups):
        if folder:
            lines += ["", f"## {folder}"]
        lines += groups[folder]
    if nested:
        lines += ["", "## Spaces inside this one"] + [f"- [[{n[len(space) + 1:]}/index|{_space_meta(n).get('name') or n.split('/')[-1]}]]" for n in nested]
    raw = root / space / "raw"
    if raw.is_dir():
        n = sum(1 for _ in walk(raw))
        lines += ["", f"_{n} source file(s) in raw/._"]
    _atomic_write(root / space / "index.md", "\n".join(lines) + "\n")


def _space_meta(space: str) -> dict:
    try:
        text = (config.vault().resolve() / space / SPACE_FILE).read_text()
    except OSError:
        return {}
    m = re.match(r"^---\n(.*?)\n---", text, re.S)
    return dict(re.findall(r"^(\w+):\s*(.+)$", m.group(1), re.M)) if m else {}


def _page_keys(path: Path, root: Path) -> set[str]:
    rel = path.relative_to(root).as_posix()[:-3].casefold()
    return {rel, rel.split("/")[-1]}


def _outside_links(space: str, content: str) -> list[str]:
    """[[links]] in `content` that point at a page outside this space (or into a private area)."""
    root = config.vault().resolve()
    targets = [t.strip() for t in re.findall(r"\[\[([^\]|#]+)", content)]
    if not targets:
        return []
    inside: set[str] = set()
    for p in _space_pages(space)[0]:
        rel_in = p.relative_to(root / space).as_posix()[:-3].casefold()
        inside |= {rel_in, rel_in.split("/")[-1]}
    out = []
    for t in targets:
        key = t.casefold().removesuffix(".md")
        if key in inside or key.startswith(space.casefold() + "/"):
            continue
        hit = next((p for p in walk(root, {".md"}) if key in _page_keys(p, root)), None)
        if hit:
            out.append(hit.relative_to(root).as_posix())
    return sorted(set(out))


def space_create(path: str, kind: str = "client", name: str = "", sharing: str = "private") -> str:
    """Make `path` a space (or finish one that's missing its parts). Never touches existing pages."""
    if kind not in SPACE_KINDS:
        raise VaultError(f"kind must be one of {', '.join(SPACE_KINDS)}.")
    folder = resolve(path)
    rel = folder.relative_to(config.vault().resolve()).as_posix()
    if not rel or is_private(rel) or rel.casefold().startswith(("me/", "raw/", "_templates/", "journal/")):
        raise VaultError("Spaces are for work: a company, client, project or team folder (for example work/acme/clients/brightlabs).")
    name = _one_line(name or rel.split("/")[-1].replace("-", " ").title(), 80)
    made = []
    with _locked():
        folder.mkdir(parents=True, exist_ok=True)
        manifest = folder / SPACE_FILE
        if not manifest.exists():
            parent = space_of(str(Path(rel).parent)) if "/" in rel else None
            manifest.write_text(
                f"---\ntype: space\nkind: {kind}\nname: {name}\nsharing: {sharing}\ncreated: {today()}\n"
                + (f"inside: {parent}\n" if parent else "") + "---\n"
                f"# {name}\n\nA self-contained knowledge base for this {kind}. Everything about {name} lives in this folder:\n"
                "pages, the sources they came from (`raw/`, never edited), and the change log (`log.md`).\n\n"
                "Rules, so this folder can be shared on its own one day:\n"
                "- Facts about this " + kind + " go here, nowhere else. Link only to pages inside this folder.\n"
                "- Nothing personal: no notes about the user's own life, health, money or private relationships.\n"
                "- Contacts at this " + kind + " get a page in `contacts/`.\n"
                + ("- Code goes in `dev/`: each project its own git repo. dev/ isn't part of this knowledge base and is never\n"
                   "  indexed, searched, synced or shared with it.\n" if kind in ("client", "project") else ""))
            made.append(SPACE_FILE)
        if not (folder / "overview.md").exists():
            (folder / "overview.md").write_text(f"---\ntype: {kind}\nstatus: active\nupdated: {today()}\n---\n# {name}\n\n**In one line:**\n")
            made.append("overview.md")
        raw = folder / "raw"
        if not raw.exists():
            raw.mkdir()
            (raw / "README.md").write_text(f"# Sources for {name}\n\nOriginal files (briefs, contracts, transcripts), filed as raw/YYYY/MM/<name>. Never edited.\n")
            made.append("raw/")
        if not (folder / "log.md").exists():
            _space_log(rel, "space created", "create")
            made.append("log.md")
        if kind in ("client", "project") and not (folder / DEV_DIR).exists():
            (folder / DEV_DIR).mkdir()
            (folder / DEV_DIR / "README.md").write_text(
                f"# Code for {name}\n\nEach project here is its own git repo (`git init` or `git clone` inside a subfolder).\n"
                "This folder isn't part of the knowledge base: Jarvis doesn't index, search, sync or share it,\n"
                "and the Jarvis folder's own git ignores it.\n")
            made.append("dev/")
        if kind in ("client", "project"):
            _obsidian_ignore(f"{rel}/{DEV_DIR}/")
        _space_index(rel)
        parent = space_of(str(Path(rel).parent)) if "/" in rel else None
        if parent:
            _space_index(parent)                                   # the company's index lists its client spaces
        _log_line(f"{rel}: became a {kind} space" + (f" (added {', '.join(made)})" if made else ""), "create")
    return f"{rel} is a {kind} space" + (f" (added {', '.join(made)})." if made else " (already complete).")


def space_list() -> list[dict]:
    root = config.vault().resolve()
    out = []
    for manifest in (p for p in walk(root) if p.name == SPACE_FILE):
        rel = manifest.parent.relative_to(root).as_posix()
        meta = _space_meta(rel)
        pages, nested = _space_pages(rel)
        content = [p for p in pages if p.name not in ("index.md", "log.md", SPACE_FILE) and "raw" not in p.relative_to(manifest.parent).parts]
        out.append({"path": rel, "kind": meta.get("kind", "?"), "name": meta.get("name", rel), "sharing": meta.get("sharing", "private"),
                    "pages": len(content), "spaces_inside": nested})
    return out


def space_check(path: str) -> dict:
    """What would leak, or break, if this space's folder were shared on its own."""
    root = config.vault().resolve()
    rel = resolve(path).relative_to(root).as_posix()
    if space_of(rel) != rel:
        raise VaultError(f"{rel} isn't a space. Make it one with jarvis_space (action create).")
    pages, _ = _space_pages(rel)
    personal: dict[str, str] = {}
    people = root / "relationships" / "people"
    if people.is_dir():
        for p in people.glob("*.md"):
            for n in {_title(p), p.stem.replace("-", " ").title()}:
                if len(n) >= 3:                                   # case-sensitive below: "Sam" the person, not "sam"
                    personal[n] = p.relative_to(root).as_posix()
    report = {"space": rel, "pages": len(pages), "links_outside": {}, "mentions_personal_contacts": {}, "missing": []}
    for p in pages:
        text = p.read_text(errors="ignore")
        page = p.relative_to(root).as_posix()
        out = _outside_links(rel, text)
        if out:
            report["links_outside"][page] = out
        names = sorted(n for n in personal if re.search(rf"(?<![\w-]){re.escape(n)}(?![\w-])", text))
        if names:
            report["mentions_personal_contacts"][page] = names
    for part in ("overview.md", "log.md", "raw"):
        if not (root / rel / part).exists():
            report["missing"].append(part)
    dev = root / rel / DEV_DIR
    if dev.is_dir():
        report["dev_repos_not_shared"] = sorted(p.name for p in dev.iterdir() if p.is_dir() and not p.name.startswith("."))
    report["ok_to_share"] = not (report["links_outside"] or report["mentions_personal_contacts"])
    return report



def _obsidian_ignore(prefix: str) -> None:
    """Hide a folder from Obsidian (Settings → Files and links → Excluded files) without touching anything else."""
    path = config.vault().resolve() / ".obsidian" / "app.json"
    try:
        data = json.loads(path.read_text()) if path.exists() else {}
    except (OSError, ValueError):
        return                                            # don't rewrite a settings file we can't read
    filters = data.get("userIgnoreFilters") or []
    if prefix not in filters:
        data["userIgnoreFilters"] = filters + [prefix]
        path.parent.mkdir(parents=True, exist_ok=True)
        _atomic_write(path, json.dumps(data, indent=2) + "\n")


def dev_new(space: str, name: str) -> str:
    """A new project repo in a client's dev/: dev/<name> with its own git repository."""
    root = config.vault().resolve()
    rel = resolve(space).relative_to(root).as_posix()
    if space_of(rel) != rel or _space_meta(rel).get("kind") not in ("client", "project"):
        raise VaultError(f"{rel} isn't a client or project space. Make it one first (jarvis_space create).")
    slug = re.sub(r"[^a-z0-9._-]+", "-", name.lower()).strip("-.")
    if not slug:
        raise VaultError("Give the project a name, e.g. website or mobile-app.")
    target = root / rel / DEV_DIR / slug
    if target.exists():
        return f"{rel}/{DEV_DIR}/{slug} already exists. Open it with your coding tools (full path: {target})."
    (root / rel / DEV_DIR).mkdir(exist_ok=True)
    target.mkdir()
    ok = subprocess.run(["git", "init", "-q", "-b", "main"], cwd=target, capture_output=True).returncode == 0
    _obsidian_ignore(f"{rel}/{DEV_DIR}/")
    with _locked():
        _space_log(rel, f"dev/{slug}: new project repo", "create")
        _log_line(f"{rel}/dev/{slug}: new project repo", "create")
    return (f"Created {target}" + (" with its own git repo." if ok else " (git isn't available, so run `git init` there yourself).")
            + " It stays out of the knowledge base. To use an existing repo instead, `git clone <url>` inside "
            f"{root / rel / DEV_DIR}.")
