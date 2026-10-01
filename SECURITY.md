# Security policy

Jarvis stores a personal vault and can send input to an AI agent's terminal. Treat it as trusted local
software with the permissions of your macOS account, not as a multi-user hosted service.

## Reporting a vulnerability

Please use [GitHub private vulnerability reporting](https://github.com/JohannsenLum/jarvis/security/advisories/new)
when available. Do not put tokens, transcripts, personal vault files or working exploits against live
systems in public issues. Include the version/commit, affected component, prerequisites and a minimal
reproduction using fictional data. If private reporting is unavailable, open an issue requesting a
private contact without including vulnerability details.

Security fixes target the latest source on `main`. There is no backport or response-time commitment yet.

## Boundaries and limitations

- The dashboard binds to loopback only. It is not designed for internet exposure, tunnels, reverse
  proxies or shared-user access. Exact Host/Origin checks and frame restrictions protect browser entry
  points, but they are not a reason to expose the port.
- `jarvis office` opens a URL containing an owner-only token in its fragment. The page moves it into
  session storage and removes the fragment from the address bar. Never share the launch URL. Reopen
  through the CLI after the server restarts. The unauthenticated landing page contains no token.
- Approval hooks authenticate requests and decisions with a per-run HMAC key; the key is not sent to
  the listener. Invalid, unsigned or unavailable responses leave approval to the terminal. This
  protocol requires matching dashboard and hook versions.
- Vault tools reject outside, hidden and symlinked paths, apply protected-write rules to canonical
  paths, and validate saved role settings before selecting templates. These checks are not a sandbox
  against another process with your OS account, a hostile concurrent filesystem writer, or an agent
  that has independent shell/filesystem tools.
- Private areas (`life/health/`, `life/finance/`, `relationships/`, `journal/`, `frameworks/declarations/`,
  `frameworks/deal-cards/`) are enforced in code: search and recall show only page names, `jarvis_read`
  refuses them, and `jarvis_read_private` is set to ask every time. Writes to private pages log the page
  name only. Agents that can browse the web cannot open private pages.
- Vault writes default to create (never overwrite), are atomic and locked, and keep the previous version
  in `.history/` (`jarvis_restore` undoes a change). A damaged `onboarding.json` is never overwritten.
- Scheduled jobs run without shell, web or raw file tools; they change the vault only through the Jarvis
  tools and cannot read private areas. The finished notification is posted by launchd, not the model.
- Jarvis folders, the vault, `~/.jarvis` and `~/.jarvis-office` are created owner-only (umask 077); existing
  folders are tightened on every render/update. The terminal transcript log is off unless
  `JARVIS_OFFICE_SESSION_LOG=1`.
- `me/` changes go through proposals; raw sources cannot be overwritten; the change log is append-only
  through the vault API. Direct filesystem access has the permissions of the local account.
- Model providers still receive the context sent to them. Keeping files locally does not mean inference
  is offline. Review the provider and connector settings you use.
- `--dangerously-skip-permissions` bypasses Claude's normal permission prompts. Quick-command
  confirmation is a UI safeguard, not a replacement for those permissions or two-factor authentication.
- Updates and optional integrations execute trusted upstream software. Review sources and keep your
  personal instance remote private. Do not store credentials in tracked files.

## Automated checks

CI runs syntax checks, protected-vault and identity tests, local dashboard/authentication tests, and
an installation smoke test from the packed release. Runtime tests use dummy data in a container with
no external network, a read-only checkout, a scratch-only writable filesystem and resource limits.
CodeQL checks JavaScript and Python; Dependabot tracks Actions, test images and the optional vendor
package. These checks provide regression coverage, not a guarantee that all vulnerabilities are found.

See [production readiness and release notes](docs/production-readiness.md) for coverage and remaining
validation work. Desktop integration behavior still needs macOS testing before a release.
