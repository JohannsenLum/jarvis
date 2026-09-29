---
name: jarvis-models
description: Run a specific job on a specific AI model when the user asks - "use GPT Astra for this", "use Claude Opus for the proposal", "have Sonnet summarise these" - and answer "which model are you using". Hands the job to a board task pinned to that model (or to the Codex / Claude Code coding agents for code), then reports back.
version: 1.0.0
metadata:
  hermes:
    tags: [jarvis, models, routing, kanban]
    category: jarvis
---

# Using a specific model for a job

## When to Use
- "Use <model> for <job>", "ask Astra to…", "get Opus to…", "run this on Sonnet/Luna/Sol".
- "Which model are you using?" / "what models can I use?"
- "Switch to <model>" for the rest of the conversation or permanently.

## Model names
| User says | Provider | Model id | Needs |
|---|---|---|---|
| Claude, Opus, Claude Opus, Opus 5.5 | `claude-subscription-directsdk-experimental` | `claude-opus-5-5` | Claude subscription |
| Sonnet, Sonnet 5 | same | `claude-sonnet-5` | Claude subscription |
| Haiku | same | `haiku` | Claude subscription |
| GPT, ChatGPT, Codex (for a non-coding job), Sol, GPT-6 Sol | `openai-codex` | `gpt-6-sol` | ChatGPT/Codex subscription |
| Luna, GPT-6 Luna | `openai-codex` | `gpt-6-luna` | ChatGPT/Codex subscription |
| Astra, GPT-6 Astra | `openai-codex` | `gpt-6-astra` | ChatGPT/Codex plan that includes Astra |

Check the provider is available before promising anything. If it isn't, say so in one line and offer
setup. Don't substitute a different model silently.

## How to run a job on another model, per tool
| You're running in | Same vendor, other model | Other vendor |
|---|---|---|
| Hermes | Board task: `kanban_create` with `model` + `provider`, `assignee: default` | Same (board task pinned to e.g. `openai-codex` / `gpt-6-astra`) |
| Claude Code | A subagent with the model set (`opus`, `sonnet`, `haiku`) | Run the other vendor's CLI headless, e.g. `codex exec -m gpt-6-astra "<task>"` |
| Codex | A subagent/`codex exec -m <model>` | `claude -p --model claude-opus-5-5 "<task>"` |
| DeepSeek Harness, OpenClaw, others | Their own model switch or subagent feature | The other vendor's CLI headless, as above |

Headless CLI runs need that CLI installed and logged in (`claude`, `codex`). Give the worker the full
context it needs, and pass the Jarvis identity path (`~/.jarvis/AGENTS.md`) so it behaves as Jarvis.

## Procedure

**First, decide how to run it:**
| Request | How |
|---|---|
| The named model is the one this conversation already runs on (e.g. "use Claude" while on Opus 5.5) | Just do the job here. No task, no extra agent. Say "Doing it here on Opus 5.5." |
| A different model, one job | One job pinned to that model (table above; board task in Hermes) |
| Several models on the same job ("have Claude and GPT both draft the intro") | One pinned job per model, then compare the results side by side |
| A coding job ("use Claude to fix the repo", "use Codex on this bug") | The `claude-code` or `codex` agent skill, working in the repo |
| A big job with independent parts, no model named | Split it with `delegate_task` (helpers run on the current model) |


**A job on a named model in Hermes** ("use Astra for the pricing analysis"; elsewhere use the table above):
1. Restate the job in one line and which model will do it.
2. Create a board task with `kanban_create`, `assignee: default` (Jarvis's own profile; tasks without
   an assignee never run), a clear title, a body with everything the worker needs
   (the goal, relevant facts or vault page paths, the output wanted, where to save it), `model` and
   `provider` from the table. For work on the vault, use workspace `dir:<vault path>`; otherwise the
   default scratch workspace, and ask the worker to attach its result.
3. Tell the user it's running on that model and that the result comes back here when done (the
   gateway's dispatcher picks tasks up within about a minute).
4. When it completes, relay the result briefly, file anything durable with `brain-ingest`, and say
   which model produced it.

**Coding jobs** ("use Codex to fix the repo", "have Claude Code refactor this"): prefer the bundled
`codex` or `claude-code` agent skills, which run those coding agents directly in the repo. Pass the
requested model if the user named one.

**"Switch to <model>":**
- For the rest of this conversation: the user types their tool's model command (`/model <model id>` in
  Hermes, Claude Code and Codex) (it's their command; you
  can't switch your own model). Give the exact line to type, e.g. `/model gpt-6-sol`. The chat history
  carries over; it applies to this conversation only (add `--global` to make it the default). Mention
  once that the first message after a switch re-reads the whole conversation at full price, so it's
  cheapest early in a chat. Switching back: `/model claude-opus-5-5`.
- Permanently: `hermes model` (Hermes), `/model` then save (Claude Code), `~/.codex/config.toml` (Codex). Scheduled jobs keep their own model (`cron.model`,
  Sonnet 5 or GPT-6 Luna by default); don't change it unless asked.

**"Which model are you using?"**: say which tool you're running in and its model. In Hermes also the
scheduled-jobs model and backup (`~/.hermes/config.yaml`: `model.default`, `cron.model`, `fallback_providers`).

## Pitfalls
- Promising a model the user's plan doesn't include (Astra especially). If a pinned task fails with a
  model/plan error, say so and offer Sol or Opus instead.
- Sending private areas (`life/health`, `life/finance`, `journal`) to a worker without the user asking.
- Pinning scheduled (cron) jobs to a model. Model choices for cron belong to the user's config.

## Verification
The reply names the model and tool that produced the result (in Hermes, `hermes kanban show <id>` shows the pinned model).
