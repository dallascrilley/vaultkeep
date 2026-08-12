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
than opening a public issue. Include the version (`ops --version`), whether you
installed from npm or built from source (the npm build currently lags this
repository, and both print the same version string, so the install path is the
disambiguator), your OS, and reproduction steps.

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

### The clipboard clear actually fires

`ops copy` stays in the foreground until its TTL expires (default 30 seconds),
then clears the clipboard and confirms it. It also clears on `SIGINT`/`SIGTERM`.
It only clears if the clipboard still holds the value it wrote, so it will not
wipe something you copied in the meantime. `--ttl 0` opts out of clearing
entirely and returns immediately.

Two things still limit this. If the process is killed with `SIGKILL`, or the
machine loses power, nothing runs and the value stays on the clipboard. And a
clipboard manager that keeps history may retain the value even after the clear.

### No log files

Vaultkeep writes no log, trace, or debug file. There is no verbose mode that
dumps secret values. All diagnostic output goes to stdout and stderr only, and
the sole file writes are the two caches described below plus the export file
you explicitly request with `--output`.

### The export file is created owner-only

`ops export --output FILE` writes plaintext secrets, so it creates `FILE` with
mode `0600` and chmods an existing file down to `0600` before it can be read
(`src/commands/export.ts`). That closes the umask gap where a fresh `.env`
landed world-readable on a shared machine.

Mode `0600` is the floor, not a guarantee. It does not protect the file from
root, from another process running as you, from a backup or sync agent, or from
the directory it sits in being group-writable. Treat the file as a secret:
delete it when you are done and keep it out of version control. When a process
only needs values in its environment, prefer `ops run`, which writes no file at
all.

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

## How writes reach `op`

`ops set`, `ops import`, and `ops template apply` hand the new value to `op` on
**stdin**, as an item JSON template (`op item create -` for a new item, piped
input for `op item edit`). Argv carries only item titles, vault names, and
flags, so a secret value is never visible to other local users through `ps` or
`/proc`, and never lands in a shell history file.

Failures are reported without the value. Node's `execFileSync` embeds the full
argv in `error.message`, so Vaultkeep never surfaces that message: it rebuilds
the command from redacted arguments and quotes only `op`'s stderr, with any
known secret value stripped first. A failed write prints, for example:

```
Error: Failed to set secret: `op item create - --vault NoSuchVault` failed (exit code 1) - [ERROR] "NoSuchVault" isn't a vault in this account
```

`ops run` remains unaffected: it injects secrets through the child process
environment, never argv (`src/commands/run.ts:191-198`). Reads are also
unaffected, since their argv carries only item titles and `op://` references.

## Known limitations

These are real, currently unfixed, and easy to confirm from the source. They
are listed rather than omitted so you can decide whether they matter for your
threat model.

### 1. An update rewrites the whole item through a JSON template

Because a value can only be assigned off-argv through a template, an update
reads the item with `op item get --format=json`, changes the one field, and
pipes the whole document back to `op item edit`. `op` rejects a partial
template, so the whole document really is required.

Two consequences follow, and Vaultkeep refuses the write rather than let either
happen silently:

- Anything `op item get` does not emit cannot survive the round-trip. File
  attachments and Document items are refused. Passkeys arrive as a valueless
  field of type `UNKNOWN`, and 1Password documents that a JSON template
  overwrites them, so items holding one are refused too. Edit those in the
  1Password app.
- Values that come back masked are refused, since writing them back would
  replace every other concealed field with its mask.

What is **not** guarded is a concurrent edit. The document is written back
whole, so a change made to the same item between the read and the write -- from
the 1Password app, another `ops` process, or a long `ops import` -- is reverted,
including fields the command never touched. `op` performs no optimistic
concurrency check. Avoid concurrent writers on one item; 1Password's item
history can recover a clobbered version.

### 2. A new item created for a non-default field is an API Credential

`op` rejects a Password-category template whose built-in password field is
empty, so `ops set NAME --field api_key` creates an API Credential item holding
a single named concealed field instead of a Password item with an empty
password. The value stays readable at `op://<vault>/<item>/<field>`. Items
created for the default `password` field are unchanged.

### 3. Secrets are exposed by design on the read path

This is unchanged and worth restating: `ops get`, `ops get-many`, `ops export`,
and `ops copy` exist to move values out of the vault. See "What the tool does
with secret values" above.

## Scope

In scope: secret values reaching an unintended destination, privilege or vault
boundaries being crossed, `op://` reference or template handling that resolves
somewhere unintended, and dependency vulnerabilities that are reachable in
practice.

Out of scope: vulnerabilities in the 1Password CLI or service (report those to
[1Password](https://bugcrowd.com/agilebits)), the documented limitations above
unless you have a materially worse exploitation path than described, and
anything requiring an attacker who already has your unlocked account or root on
your machine.

## Hardening notes

- Keep the `op` CLI current; Vaultkeep inherits its security properties.
- Prefer `ops run` over `ops export` when a process just needs values in its
  environment. It avoids a plaintext file on disk.
- Treat any file produced by `ops export` as a secret. It is created `0600`,
  but delete it when done and keep it out of version control.
- Set `OPS_NO_SESSION_CACHE=1` on shared or long-lived machines.
- Prefer service accounts with least-privilege vault access for automation.
