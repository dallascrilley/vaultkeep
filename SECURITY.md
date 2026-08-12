# Security

## What Vaultkeep is

Vaultkeep (`ops`) is a local command-line wrapper around the 1Password CLI
(`op`). It runs entirely on your machine. It has no server component, makes no
network requests of its own, and collects no telemetry. Every vault operation
is delegated to the `op` binary you installed and signed in to, so 1Password
remains the authority for authentication, authorization, and audit.

Vaultkeep never asks for, stores, or transmits your 1Password account
password or secret key.

## Reporting a vulnerability

Please report security issues privately to **dallas@dallascrilley.com** rather
than opening a public issue. Include the version (`ops --version`), your OS,
and reproduction steps.

Use [GitHub issues](https://github.com/dallascrilley/vaultkeep/issues) for
ordinary bugs and feature requests that carry no security impact.

This is a personal project. Responses are best-effort, with no bug bounty and
no formal SLA. Please give me a reasonable window to ship a fix before
disclosing publicly.

## What the tool does with secret values

Being precise here matters more than sounding reassuring, so this section
states the actual behavior, including its limits.

### Secrets are printed when you ask for them

`ops get`, `ops get-many`, and `ops export` write retrieved secret values to
stdout or to a file you name. `ops copy` writes a value to the OS clipboard.
That is the tool's purpose, not a defect. Be deliberate about shell history,
terminal scrollback, CI logs, and any file you redirect output into.

`ops run --verbose` deliberately does not do this: it prints
`(secret value hidden)` per injected key instead of the value
(`src/commands/run.ts:186`).

### No log files

Vaultkeep writes no log, trace, or debug file. There is no verbose mode that
dumps secret values. All diagnostic output goes to stdout and stderr only, and
the sole file writes are the two caches described below plus the export file
you explicitly request with `--output`.

### What is cached on disk

Two files, both created with mode `0600` inside a directory created `0700`:

- `~/.config/ops-cli/session.json` caches 1Password CLI session tokens
  (`OP_SESSION_*`) so you are not prompted to sign in repeatedly. It holds
  **no vault item values**, but a session token is still a live credential:
  anyone who reads it can reach every vault your signed-in account can reach
  until the session expires. Set `OPS_NO_SESSION_CACHE=1` to disable this
  cache.
- `~/.config/ops-cli/templates.json` stores custom template names,
  descriptions, and the list of field *names* a template prompts for. It
  contains no values.

## Known limitations

These are real, currently unfixed, and easy to confirm from the source. They
are listed rather than omitted so you can decide whether they matter for your
threat model.

### 1. Secret values are passed to `op` as command-line arguments on writes

`ops set`, `ops import`, and `ops template apply` deliver a new value to `op`
as a `field=value` argv entry (`src/utils/op.ts:527`, `:565`, `:588`). For the
lifetime of that short-lived subprocess, the value is visible to other local
users through `ps` and `/proc`. Vaultkeep does not use stdin or an environment
variable for this path.

This matters only on a machine where you do not trust every other local user.
`ops run` is unaffected: it injects secrets through the child process
environment, never argv (`src/commands/run.ts:191-198`). Reads are also
unaffected, since their argv carries only item titles and `op://` references.

### 2. A failed write can echo the secret value into the error message

Because of limitation 1, when the underlying `op item edit` or `op item create`
exits non-zero, Node's `execFileSync` embeds the full argv into the thrown
`error.message`. Vaultkeep wraps that message and prints it to stderr
(`src/utils/op.ts:539`, `:570`, `:592`). The secret value can therefore appear
in stderr on a failed `ops set`, `ops import`, or `ops template apply`.

Realistic triggers include a mistyped vault name, a locked or read-only item,
an expired `op` session, or a network failure mid-write. If a write fails in an
environment that captures stderr, such as CI, treat that value as exposed and
rotate it.

### 3. The clipboard clear is best-effort and usually does not fire

`ops copy` schedules a clipboard clear after a TTL (default 30 seconds) and on
`SIGINT`/`SIGTERM`, but the timer is `unref()`'d
(`src/commands/copy.ts:133-140`). Nothing else holds the event loop open, so a
normal one-shot `ops copy` exits before the timer runs. In practice the secret
stays on your clipboard until something overwrites it. Do not rely on the TTL;
clear the clipboard yourself when it matters.

## Scope

In scope: secret values reaching an unintended destination, privilege or vault
boundaries being crossed, `op://` reference or template handling that resolves
somewhere unintended, and dependency vulnerabilities that are reachable in
practice.

Out of scope: vulnerabilities in the 1Password CLI or service (report those to
[1Password](https://bugcrowd.com/agilebits)), the three documented limitations
above unless you have a materially worse exploitation path than described, and
anything requiring an attacker who already has your unlocked account or root on
your machine.

## Hardening notes

- Keep the `op` CLI current; Vaultkeep inherits its security properties.
- Prefer `ops run` over `ops export` when a process just needs values in its
  environment. It avoids both argv exposure and a plaintext file on disk.
- Treat any file produced by `ops export` as a secret. Delete it when done and
  keep it out of version control.
- Set `OPS_NO_SESSION_CACHE=1` on shared or long-lived machines.
- Prefer service accounts with least-privilege vault access for automation.
