"""`jarvis schedule`: run Jarvis's routines from the always-on runtime of your choice.

    jarvis schedule install [--runner R]   create the jobs (default runner: the configured home runtime)
    jarvis schedule status                 show the runner and jobs
    jarvis schedule remove                 remove the jobs from the current runner
    jarvis schedule run <job>              run one job now (for testing)

Runners
  hermes          Hermes cron (default). Delivers to Telegram when connected.
  launchd-claude  macOS launchd runs `claude -p` on Sonnet 5, locally. Vault never leaves the Mac.
  launchd-codex   macOS launchd runs `codex exec` on GPT-6 Luna, locally.
  openclaw        OpenClaw automations (prints the commands to run).
  claude-routines Claude cloud routines (prints steps; needs the vault in a private GitHub repo).

Jobs: morning-briefing, weekly-review, consolidate, lint. Times come from me/onboarding.json → rhythm.
"""
from __future__ import annotations

import argparse
import plistlib
import shlex
import shutil
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "core"))
from jarvis_core import config, vault  # noqa: E402

HOME = Path.home()
AGENTS_DIR = HOME / "Library" / "LaunchAgents"
RUNNERS = ["hermes", "launchd-claude", "launchd-codex", "openclaw", "claude-routines"]
DAYS = {"sunday": 0, "monday": 1, "tuesday": 2, "wednesday": 3, "thursday": 4, "friday": 5, "saturday": 6}
NOTIFY = ("When done, show the user a one-line macOS notification with the headline: "
          "osascript -e 'display notification \"<headline>\" with title \"Jarvis\"'.")


def jobs() -> dict[str, dict]:
    rhythm = vault.onboarding().get("rhythm", {}) or {}
    bh, bm = (rhythm.get("morning_briefing") or "07:30").split(":")
    day = DAYS.get(str(rhythm.get("weekly_review") or "Sunday").lower(), 0)
    return {
        "morning-briefing": {"skill": "jarvis-morning-briefing", "hour": int(bh), "minute": int(bm), "weekday": None, "tell": True},
        "weekly-review": {"skill": "jarvis-weekly-review", "hour": 18, "minute": 0, "weekday": day, "tell": True},
        "consolidate": {"skill": "brain-consolidate", "hour": 1, "minute": 30, "weekday": None, "tell": False},
        "lint": {"skill": "brain-lint", "hour": 2, "minute": 0, "weekday": None, "tell": False},
    }


def prompt(job: dict, notify: bool) -> str:
    text = f"You are Jarvis, running a scheduled job. Load and follow the {job['skill']} skill now. The vault is {config.vault()}."
    return text + (" " + NOTIFY if notify and job["tell"] else "")


def cron_expr(job: dict) -> str:
    return f"{job['minute']} {job['hour']} * * {'*' if job['weekday'] is None else job['weekday']}"


def headless_command(runner: str, text: str) -> str:
    if runner == "launchd-claude":
        tools = "mcp__jarvis Read Write Edit Glob Grep Bash(osascript:*)"
        return f"claude -p {shlex.quote(text)} --model claude-sonnet-5 --permission-mode acceptEdits --allowedTools {shlex.quote(tools)}"
    if runner == "launchd-codex":
        return f"codex exec --model gpt-6-luna --sandbox workspace-write --skip-git-repo-check {shlex.quote(text)}"
    raise ValueError(runner)


def plist_path(name: str) -> Path:
    return AGENTS_DIR / f"ai.jarvis.{name}.plist"


def install_launchd(runner: str) -> None:
    binary = "claude" if runner == "launchd-claude" else "codex"
    if not shutil.which(binary):
        raise SystemExit(f"`{binary}` isn't installed or not on PATH. Install and log in to it first.")
    logs = config.home() / "logs"
    logs.mkdir(parents=True, exist_ok=True)
    AGENTS_DIR.mkdir(parents=True, exist_ok=True)
    for name, job in jobs().items():
        interval = {"Hour": job["hour"], "Minute": job["minute"]}
        if job["weekday"] is not None:
            interval["Weekday"] = job["weekday"]
        plist = {
            "Label": f"ai.jarvis.{name}",
            # A login shell, so PATH includes Homebrew, ~/.local/bin and the user's Node.
            "ProgramArguments": ["/bin/zsh", "-lc", headless_command(runner, prompt(job, notify=True))],
            "WorkingDirectory": str(config.vault()),
            "StartCalendarInterval": interval,          # missed while asleep → runs once on wake
            "StandardOutPath": str(logs / f"{name}.log"),
            "StandardErrorPath": str(logs / f"{name}.log"),
        }
        path = plist_path(name)
        subprocess.run(["launchctl", "bootout", f"gui/{_uid()}/ai.jarvis.{name}"], capture_output=True)
        with path.open("wb") as f:
            plistlib.dump(plist, f)
        subprocess.run(["launchctl", "bootstrap", f"gui/{_uid()}", str(path)], capture_output=True)
        when = f"{job['hour']:02d}:{job['minute']:02d}" + ("" if job["weekday"] is None else f" on day {job['weekday']}")
        print(f"  ✓ {name}: {when} via {binary}")


def remove_launchd() -> None:
    for name in jobs():
        subprocess.run(["launchctl", "bootout", f"gui/{_uid()}/ai.jarvis.{name}"], capture_output=True)
        plist_path(name).unlink(missing_ok=True)
        print(f"  ✓ removed {name}")


def _uid() -> str:
    import os
    return str(os.getuid())


def install_hermes() -> None:
    telegram = bool(subprocess.run(["zsh", "-c", "grep -q '^TELEGRAM_ALLOWED_USERS=.' ~/.hermes/.env"], capture_output=True).returncode == 0)
    for name, job in jobs().items():
        deliver = "telegram" if (telegram and job["tell"]) else "local"
        cmd = ["hermes", "cron", "create", cron_expr(job), prompt(job, notify=False), "--name", f"jarvis-{name}",
               "--skill", job["skill"], "--deliver", deliver]
        ok = subprocess.run(cmd, capture_output=True, text=True).returncode == 0
        print(f"  {'✓' if ok else '!'} {name}: {cron_expr(job)} → {deliver}{'' if ok else ' (failed: run `hermes cron list` and add it by hand)'}")


def print_openclaw() -> None:
    print("Run these in a terminal (OpenClaw automations; check `openclaw automations --help` for the exact flags):")
    for name, job in jobs().items():
        print(f"  openclaw automations add --name jarvis-{name} --cron {shlex.quote(cron_expr(job))} "
              f"--prompt {shlex.quote(prompt(job, notify=False))}")


def print_routines() -> None:
    print("Claude cloud routines run in Anthropic's cloud on a fresh clone of a GitHub repo, so:")
    print("  1. Your vault (knowledge/) must be pushed to a PRIVATE GitHub repo, which means it leaves this Mac.")
    print("     Private areas (health, money, relationships, journal) would be in that repo too.")
    print("  2. Skills must be in that repo (the Jarvis plugin works) because routines don't read ~/.claude/skills.")
    print("  3. Create each routine at claude.ai/code/routines (schedule minimum: hourly):")
    for name, job in jobs().items():
        print(f"     - {name}: cron {cron_expr(job)}: \"{prompt(job, notify=False)}\"")
    print("For local, private scheduling instead: jarvis schedule install --runner launchd-claude")


def main(argv: list[str]) -> None:
    ap = argparse.ArgumentParser(prog="jarvis schedule", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("action", choices=["install", "status", "remove", "run"])
    ap.add_argument("job", nargs="?")
    ap.add_argument("--runner", choices=RUNNERS)
    a = ap.parse_args(argv)
    cfg = config.load()
    runner = a.runner or cfg.get("schedule_runner") or config.home_runtime()

    if a.action == "install":
        print(f"Scheduling Jarvis's routines with {runner}:")
        if runner in ("launchd-claude", "launchd-codex"):
            install_launchd(runner)
        elif runner == "hermes":
            install_hermes()
        elif runner == "openclaw":
            print_openclaw()
        elif runner == "claude-routines":
            print_routines()
        if runner in ("hermes", "launchd-claude", "launchd-codex"):   # print-only runners aren't recorded
            cfg["schedule_runner"] = runner
            config.save(cfg)
    elif a.action == "remove":
        if runner.startswith("launchd"):
            remove_launchd()
        elif runner == "hermes":
            print("Remove the jarvis-* jobs with `hermes cron list` then `hermes cron remove <id>`.")
        else:
            print(f"Remove the jarvis-* jobs in {runner} itself.")
    elif a.action == "status":
        print(f"Runner: {runner}")
        for name, job in jobs().items():
            extra = ""
            if runner.startswith("launchd"):
                extra = "  (loaded)" if plist_path(name).exists() else "  (not installed)"
            print(f"  {name:<17} {cron_expr(job):<14} skill {job['skill']}{extra}")
    elif a.action == "run":
        if a.job not in jobs():
            raise SystemExit(f"Choose a job: {', '.join(jobs())}")
        job = jobs()[a.job]
        if runner.startswith("launchd"):
            subprocess.run(["/bin/zsh", "-lc", headless_command(runner, prompt(job, notify=True))], cwd=config.vault())
        elif runner == "hermes":
            print("Run it from Hermes: `hermes cron list`, then `hermes cron run <id>`, or ask Jarvis to run the skill.")
        else:
            print(prompt(job, notify=False))


if __name__ == "__main__":
    main(sys.argv[1:])
