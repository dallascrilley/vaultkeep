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

### The clipboard clear actually fires

`ops copy` stays in the foreground until its TTL expires (default 30 seconds),
then clears the clipboard and confirms it. It also clears on `SIGINT`/`SIGTERM`.
It only clears if the clipboard still holds the value it wrote, so it will not
wipe something you copied in the meantime.

Two things still limit this. If the process is killed with `SIGKILL`, or the
machine loses power, nothing runs and the value stays on the clipboard. And a
clipboard manager that keeps history may retain the value even after the clear.

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
pipes the whole document back to `op item edit`. Anything `op item get` does not
emit therefore does not survive the round-trip. Per 1Password's own
documentation, JSON item templates do not carry passkeys, so updating an item
that holds a passkey will overwrite it.

Vaultkeep refuses the update outright when the item has file attachments or is
a Document item, rather than silently dropping the file. It cannot detect a
passkey, because the JSON never contains one. Edit passkey items in the
1Password app instead. A previous item version can be restored from 1Password's
item history if this catches you out.

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
- Treat any file produced by `ops export` as a secret. Delete it when done and
  keep it out of version control.
- Set `OPS_NO_SESSION_CACHE=1` on shared or long-lived machines.
- Prefer service accounts with least-privilege vault access for automation.
