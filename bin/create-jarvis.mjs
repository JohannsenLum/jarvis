#!/usr/bin/env node
// create-jarvis: make your own Jarvis folder.
//
//   npx github:JohannsenLum/jarvis            interactive wizard
//   npx github:JohannsenLum/jarvis -- --yes --dir ~/Jarvis --name Alex --role coach
//
// The folder is yours. Jarvis's framework lives in <folder>/.jarvis and is replaced wholesale by
// `jarvis update`; your vault (knowledge/), your skills (skills/) and anything you write outside
// Jarvis's marked blocks are never touched. No dependencies beyond Node 18+, Python 3 and git.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FRAMEWORK = ["skills", ...JSON.parse(fs.readFileSync(path.join(PKG, "framework.json"), "utf8")).parts];
const SKIP_NAMES = new Set([".git", "node_modules", "__pycache__", ".pytest_cache", ".DS_Store"]);
const ROLES = [
  ["chief-of-staff", "Chief of Staff: runs your priorities, preps you, pushes back"],
  ["executive-assistant", "Executive Assistant: calendar, admin, logistics"],
  ["thinking-partner", "Thinking Partner: strategy and decisions, challenges you"],
  ["coach", "Coach: goals, habits, accountability"],
  ["life-manager", "Life Manager: family, home, money, personal time"],
];
const TONES = [["warm", "Warm: friendly and casual"], ["formal", "Formal: polite and precise"], ["direct", "Direct: short and blunt"]];
const AUTONOMY = [
  ["act-and-tell", "Act and tell me: small things, then a one-line note"],
  ["ask-first", "Ask first: always check with me"],
  ["handle-quietly", "Handle it quietly: small things, summarised daily"],
];
const WORK = [["agency", "Agency or studio"], ["employee", "Employee"], ["ceo", "Founder or CEO"], ["freelancer", "Freelancer"], ["student", "Student"]];

const c = (code, s) => (process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);
const gold = (s) => c("33", s), green = (s) => c("32", s), dim = (s) => c("2", s), bold = (s) => c("1", s);

function parseArgs(argv) {
  const out = { yes: false, git: true, link: true, office: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => argv[++i];
    if (a === "--yes" || a === "-y") out.yes = true;
    else if (a === "--no-git") out.git = false;
    else if (a === "--no-link") out.link = false;
    else if (a === "--office") out.office = true;
    else if (a === "--no-office") out.office = false;
    else if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=");
      out[k] = v ?? val();
    }
  }
  return out;
}

// Line reader that works both in a terminal and with piped answers (readline's question() drops lines
// that arrive before it's called, which breaks scripted installs).
function makeAsker() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY });
  const queue = [], waiters = [];
  let closed = false;
  rl.on("line", (l) => (waiters.length ? waiters.shift()(l) : queue.push(l)));
  rl.on("close", () => { closed = true; while (waiters.length) waiters.shift()(""); });
  return {
    question(q) {
      process.stdout.write(q);
      return new Promise((res) => {
        if (queue.length) res(queue.shift());
        else if (closed) res("");
        else waiters.push(res);
      }).then((a) => { if (!process.stdin.isTTY) process.stdout.write(a + "\n"); return a; });
    },
    close() { rl.close(); },
  };
}

const expand = (p) => path.resolve(p.replace(/^~(?=$|\/)/, os.homedir()));
const which = (cmd) => spawnSync("sh", ["-c", `command -v ${cmd}`]).status === 0;

async function ask(rl, q, def = "") {
  const a = (await rl.question(`  ${q}${def ? dim(` [${def}]`) : ""} `)).trim();
  return a || def;
}

async function choose(rl, q, options, { skip = true, def = 1 } = {}) {
  console.log(`  ${q}`);
  options.forEach(([, label], i) => console.log(`    ${i + 1}) ${label}${i + 1 === def ? dim("  (recommended)") : ""}`));
  if (skip) console.log(`    ${options.length + 1}) Skip for now`);
  const a = (await rl.question(`  Choose 1-${options.length + (skip ? 1 : 0)} ${dim(`[${def}]`)} `)).trim() || String(def);
  const n = Number(a);
  return n >= 1 && n <= options.length ? options[n - 1][0] : null;
}

async function chooseMany(rl, q, options) {
  console.log(`  ${q}`);
  options.forEach(([, label], i) => console.log(`    ${i + 1}) ${label}`));
  const a = (await rl.question(`  Numbers separated by commas, Enter to skip: `)).trim();
  return [...new Set(a.split(/[,\s]+/).map(Number).filter((n) => n >= 1 && n <= options.length).map((n) => options[n - 1][0]))];
}

function copyFiltered(src, dst, rel = "") {
  fs.cpSync(src, dst, {
    recursive: true,
    filter: (p) => {
      const r = path.relative(PKG, p);
      const base = path.basename(p);
      if (SKIP_NAMES.has(base)) return false;
      if (r.startsWith(path.join("skills", "learned") + path.sep)) return false;
      return true;
    },
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`\n${gold(bold("  JARVIS"))}  ${dim("your own personal assistant, in a folder you own")}\n`);

  process.umask(0o077);   // the folder holds a private vault: owner-only files and folders
  if (!which("python3")) { console.error("  Python 3 is required (it ships with macOS developer tools: xcode-select --install)."); process.exit(1); }
  if (!which("git")) { console.error("  git is required (xcode-select --install)."); process.exit(1); }

  const rl = args.yes ? null : makeAsker();
  const answers = { user: {}, skipped: [] };
  const pick = async (key, q, list, def) => {
    if (args[key]) return args[key];
    if (args.yes) return list[0][0];
    const v = await choose(rl, q, list, { def });
    if (!v) answers.skipped.push(["hello_role", q.replace(/\?$/, "")]);
    return v;
  };

  const dir = expand(args.dir || (args.yes ? "~/Jarvis" : await ask(rl, "Where should your Jarvis folder live?", "~/Jarvis")));
  if (fs.existsSync(path.join(dir, ".jarvis"))) {
    console.log(`\n  ${dir} is already a Jarvis folder. To get the latest version: ${bold(`cd ${dir} && jarvis update`)}\n`);
    rl?.close();
    return;
  }
  if (fs.existsSync(dir) && fs.readdirSync(dir).filter((f) => !f.startsWith(".")).length) {
    console.error(`\n  ${dir} already has files in it. Pick a new or empty folder so nothing of yours is mixed in.\n`);
    rl?.close();
    process.exit(1);
  }

  answers.user.name = args.name ?? (args.yes ? "" : await ask(rl, "What should Jarvis call you?"));
  answers.assistant = args.assistant ?? (args.yes ? "Jarvis" : await ask(rl, "What do you want to call your assistant?", "Jarvis"));
  answers.user.role = await pick("role", "What role should it play?", ROLES, 1);
  answers.user.tone = await pick("tone", "How should it talk to you?", TONES, 1);
  answers.user.autonomy = await pick("autonomy", "How much should it do without asking?", AUTONOMY, 1);
  answers.work = args.work ? String(args.work).split(",") : args.yes ? [] : await chooseMany(rl, "What does your work look like? (optional)", WORK);
  if (!answers.work.length) answers.skipped.push(["work", "What does your work look like"]);
  answers.next_step = answers.work.length ? "work_details" : "life";
  answers.home_runtime = "claude-code";
  let link = args.link;
  if (!args.yes && link) {
    const a = (await ask(rl, "Add the `jarvis` command to your terminal (~/.local/bin)?", "Y")).toLowerCase();
    link = !a.startsWith("n");
  }
  let office = args.office;
  if (office === null) {
    office = args.yes ? false : !(await ask(rl, "Set up the office dashboard (watch Jarvis and its sub-agents, type and approve from your browser)?", "Y")).toLowerCase().startsWith("n");
  }
  rl?.close();

  // 1. Framework into .jarvis, vault template into knowledge/
  console.log(`\n${gold("▸")} Building ${dir}`);
  fs.mkdirSync(path.join(dir, ".jarvis"), { recursive: true });
  for (const part of FRAMEWORK) {
    const src = path.join(PKG, part);
    if (fs.existsSync(src)) copyFiltered(src, path.join(dir, ".jarvis", part));
  }
  fs.mkdirSync(path.join(dir, ".jarvis", "skills", "learned"), { recursive: true });
  const kv = path.join(dir, "knowledge");
  for (const sub of ["inbox", "raw", "me"]) fs.mkdirSync(path.join(kv, sub), { recursive: true });
  fs.copyFileSync(path.join(PKG, "knowledge", "SCHEMA.md"), path.join(kv, "SCHEMA.md"));
  fs.cpSync(path.join(PKG, "knowledge", "_templates"), path.join(kv, "_templates"), { recursive: true });
  for (const keep of ["inbox", "raw"]) fs.writeFileSync(path.join(kv, keep, ".gitkeep"), "");

  // 2. Wire it up (identity, skills, sub-agents, MCP, recall) with the framework's own CLI
  const answersDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-answers-"));
  fs.chmodSync(answersDir, 0o700);
  const answersFile = path.join(answersDir, "answers.json");
  let r;
  try {
    fs.writeFileSync(answersFile, JSON.stringify(answers), { mode: 0o600, flag: "wx" });
    r = spawnSync("python3", [path.join(dir, ".jarvis", "bin", "jarvis_cli.py"), "init-instance", answersFile], { stdio: "inherit" });
  } finally { fs.rmSync(answersDir, { recursive: true, force: true }); }
  if (r.status !== 0) { console.error("  Setup of the folder failed (see above)."); process.exit(1); }

  // 3. Your folder, your private git repo
  fs.writeFileSync(path.join(dir, ".gitignore"),
    "# Private Jarvis folder. Keep any remote PRIVATE: your vault is in here.\n.env\n.DS_Store\n**/__pycache__/\n.jarvis/logs/\nknowledge/.history/\nknowledge/.jarvis.lock\n.obsidian/workspace*.json\n");
  if (args.git) {
    spawnSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
    spawnSync("git", ["add", "-A"], { cwd: dir });
    const hasIdentity = spawnSync("git", ["config", "user.email"], { cwd: dir }).stdout?.toString().trim();
    if (hasIdentity) spawnSync("git", ["commit", "-q", "-m", "Create my Jarvis folder"], { cwd: dir });
    console.log(`  ${green("✓")} Private git repo${hasIdentity ? " with a first commit" : " (commit when you've set git user.name/email)"}`);
  }

  // 4. The jarvis command
  if (link) {
    const binDir = path.join(os.homedir(), ".local", "bin");
    const target = path.join(binDir, "jarvis");
    fs.mkdirSync(binDir, { recursive: true });
    let ours = true;
    try { ours = fs.readlinkSync(target).includes("jarvis"); } catch { ours = !fs.existsSync(target); }
    if (ours) {
      try { fs.unlinkSync(target); } catch {}
      fs.symlinkSync(path.join(dir, ".jarvis", "bin", "jarvis"), target);
      console.log(`  ${green("✓")} \`jarvis\` command linked (open a new terminal if it's not found)`);
    } else {
      console.log(`  ! ${target} exists and isn't Jarvis's; left it alone. Use ${dir}/.jarvis/bin/jarvis`);
    }
  }

  // 5. The office dashboard needs tmux to type into your Claude session
  if (office) {
    const brew = ["/opt/homebrew/bin/brew", "/usr/local/bin/brew"].find((p) => fs.existsSync(p)) || (which("brew") ? "brew" : null);
    const hasTmux = which("tmux") || ["/opt/homebrew/bin/tmux", "/usr/local/bin/tmux"].some((p) => fs.existsSync(p));
    if (hasTmux) console.log(`  ${green("✓")} Office dashboard ready (tmux found)`);
    else if (brew) {
      console.log(`${gold("▸")} Installing tmux for the office dashboard (brew install tmux)…`);
      const t = spawnSync(brew, ["install", "tmux"], { stdio: "inherit" });
      console.log(t.status === 0 ? `  ${green("✓")} tmux installed` : "  ! tmux didn't install. Try later: brew install tmux");
    } else {
      console.log("  ! The office needs tmux to type into your session, and Homebrew isn't installed.\n" +
        "    Install Homebrew (https://brew.sh), then: brew install tmux. The dashboard still works read-only without it.");
    }
  }

  const name = answers.assistant || "Jarvis";
  console.log(`
${gold(bold(`  ${name} is ready.`))}

  Start talking:        open ${bold(dir)} in the Claude app (Code), or ${bold(`cd ${dir} && claude`)}
                        ${dim(`(also works with codex, gemini and others opened in this folder)`)}
  Say hi. ${name} takes you through five short chapters (about eight minutes) and builds your
  second brain as you answer. Skip anything, pause any time.

  Your vault:           ${kv}   ${dim("(open it in Obsidian)")}
  Your own skills:      ${path.join(dir, "skills")}   ${dim("(yours win over Jarvis's; updates never touch them)")}
  Updates:              ${bold("jarvis update")}   ${dim("(replaces only .jarvis/, no merge conflicts)")}

  Optional:
    Watch Jarvis and its sub-agents work, type and approve from the browser:  ${bold("jarvis office")}
    Always-on (Telegram, scheduled briefings, desk voice) with Hermes:  ${bold("jarvis setup hermes")}
    Scheduled routines through Claude on this Mac:                     ${bold("jarvis schedule sync")}
    Jarvis in every folder, not just this one:                         ${bold("jarvis install claude-code --global")}
`);
}

main().catch((e) => { console.error(e); process.exit(1); });
