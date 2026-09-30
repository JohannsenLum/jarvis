# Production readiness and releases

Jarvis is a local macOS application distributed through a GitHub-backed installer. There is no hosted
application to deploy. CI validates source and installation; CD prepares a draft GitHub release after
an explicit version tag. It does not publish to npm, update anyone's personal vault or deploy a server.

## Checks

- **CI passed**: Node 22/Python 3.11 and Node 24/Python 3.13; JS/Python/shell/JSON syntax,
  protected-vault paths, persisted identity settings, recall filtering, dashboard Host/Origin/token
  checks, approval authentication, body-size handling, and installation from `npm pack`.
- **CodeQL**: JavaScript/TypeScript and Python with extended security queries, on pull requests and
  weekly on the default branch.
- **Dependabot**: weekly update PRs for SHA-pinned Actions, CI container bases and the optional
  Fireworks vendor package. The runtime itself has no npm/Python package dependencies.
- Workflow tokens default to read-only. Only CodeQL can upload security results, and only the final
  release job can write a release. PR workflows do not use `pull_request_target` or repository secrets.
- Tests run without external networking, with dummy HOME/vault data, a read-only repository, a 256 MiB
  scratch filesystem, and CPU/memory/process/file-size/time bounds. A separate loopback namespace
  supports local HTTP fixtures. No live Claude session, tmux session or user vault is used.

To run the same Linux test sandbox (Docker and GNU `timeout` required):

```bash
docker build -t jarvis-ci .github/ci
bash scripts/test-isolated.sh jarvis-ci
```

`npm run check` and `npm test` are available for a trusted developer checkout; use the isolated runner
only after reviewing the launcher and Dockerfiles. They execute outside the container and are part of
the trusted harness. For untrusted contributions, run the entire checkout inside a disposable VM
without credentials or shared host mounts, or use a separately trusted harness/image. GitHub’s
disposable runner is CI’s outer isolation boundary. Do not point tests at a real Jarvis instance.

## Release process

1. Merge reviewed changes after CI passes and CodeQL finishes. Review the code-scanning alerts for
   the exact release commit and resolve or explicitly triage every applicable alert; successful
   analysis/upload alone does not mean there are no vulnerabilities. Manually check macOS installation/update,
   Office/Command, chat resizing, tmux, approval prompts and Obsidian with a disposable vault.
2. Update `package.json`'s version in a reviewed change. Create and push the matching `vX.Y.Z` tag.
3. The tag workflow reruns CI, requires the tag to match the package version, packs with lifecycle
   scripts disabled, and creates a **draft** release containing the `.tgz` and `SHA256SUMS`.
4. Verify the tagged commit’s CodeQL alert review, release notes and checksums before publishing the
   draft. The tag workflow gates draft creation on CI, not on CodeQL alert severity; this manual
   security review is required. Install a reviewed release with
   `npx github:JohannsenLum/jarvis#vX.Y.Z`. `jarvis update` currently follows its configured Git source,
   usually `main`; it does not consume or verify release assets automatically.

Checksums detect altered downloads but are not signatures or attestations. Protect release tags and
review workflow changes. This change does not create a tag, publish a release or change existing users'
installations.

## Focused security review

Method: [Cloudflare security-audit skill](https://github.com/cloudflare/security-audit-skill), guidance
mode, source-first review of the vault/MCP boundary, local dashboard, installer and release workflow.
Independent reviewers examined the affected source and proposed fixes. This is a focused review, not
the skill's full six-phase audit or a penetration-test certification.

Source concerns addressed here:

| Boundary | Remediation | Regression coverage |
|---|---|---|
| Agent paths → protected vault pages | Normalize policy paths; reject hidden and symlinked paths; protect case aliases and append-only files | Protected aliases, outside/hidden paths, allowed writes and logging |
| Writable onboarding → identity templates | Validate persisted role/tone/autonomy against enums before selecting a template | Malformed values and outside-file marker |
| Recall/dashboard → vault data | Apply guarded paths to reads, including current focus and metadata | Link filtering and confined page reads |
| Browser → local dashboard | Remove public token bootstrap; owner launch fragment; exact Host/Origin checks and anti-framing headers | Anonymous/hostile requests, authorized dummy reads |
| Local listener → permission hook | Nonce-bound request and response HMAC; no shared key on the wire; reject replay/invalid response | Signature checks, unsigned response rejection, replay |
| HTTP input → server resources | Bound request bytes and duration; reject malformed input; cap connections | Oversized and interrupted bodies |

A source hypothesis is not a confirmed exploit. Isolated tests establish only their tested paths;
browser DNS-rebinding/clickjacking behavior, multiple real macOS users and malicious concurrent file
replacement are not validated by this suite. Symlink checks are not race-proof against an adversarial
writer. The updater trusts its source, follows `main` by default and is not transactional; interrupted
updates and rollback remain release-readiness work. Optional Hermes/voice/connector dependencies and
provider-side permission policies need their own reviews.

## Repository settings

Private vulnerability reporting, Dependabot alerts/automatic security fixes, and secret-scanning
push protection are enabled. Branch protection has not been configured by this change. Recommended
merge requirements: **CI passed**, both CodeQL language checks, a code-scanning ruleset requiring
CodeQL with high/critical security alerts blocked, no force pushes or branch deletion, and review of
workflow/security changes. Until that ruleset is configured, manually inspect applicable alerts
before merging and publishing. Workflow success alone is not a vulnerability gate.
