import { execFileSync, execFile } from 'child_process';
import { promisify } from 'util';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { OpItem, OpField, OpError } from './types.js';
import { withRetrySync, withRetry, RetryOptions, isTransientError } from './retry.js';

const execFileAsync = promisify(execFile);

/**
 * Load service account token from ~/.config/op/sa_token
 */
function loadServiceAccountToken(): string | undefined {
  try {
    const tokenPath = join(homedir(), '.config', 'op', 'sa_token');
    const token = readFileSync(tokenPath, 'utf-8').trim();
    return token;
  } catch {
    return undefined;
  }
}

/**
 * Get environment with service account token if available
 */
function getOpEnv(): NodeJS.ProcessEnv {
  const token = loadServiceAccountToken();
  const env = { ...process.env };
  
  if (token) {
    env.OP_SERVICE_ACCOUNT_TOKEN = token;
  }
  
  return env;
}

export function getOpCliEnv(): NodeJS.ProcessEnv {
  return getOpEnv();
}

function formatOpErrorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return '';
  }

  const maybeError = error as { stderr?: Buffer | string; message?: string };
  const stderr = maybeError.stderr ? String(maybeError.stderr).trim() : '';
  if (stderr.length > 0) {
    return stderr.split('\n')[0];
  }

  if (maybeError.message) {
    return String(maybeError.message).trim();
  }

  return '';
}

function getOpEnvWithoutServiceAccount(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.OP_SERVICE_ACCOUNT_TOKEN;
  return env;
}

/**
 * Global retry options that can be configured per-command
 */
let globalRetryOptions: RetryOptions = {};

/**
 * Set global retry options (called from CLI commands)
 */
export function setRetryOptions(options: RetryOptions): void {
  globalRetryOptions = options;
}

/**
 * Get current retry options
 */
export function getRetryOptions(): RetryOptions {
  return globalRetryOptions;
}

/**
 * Check if an op error is retryable based on error message
 */
function isOpErrorRetryable(error: Error): boolean {
  const message = error.message.toLowerCase();

  // Format the stderr if it's a child process error
  const stderr = (error as any).stderr?.toString().toLowerCase() || '';
  const combined = message + ' ' + stderr;

  return isTransientError(new Error(combined));
}

function isShareLinkUnsupported(message: string): boolean {
  return message.includes('--share-link') && message.includes('unknown');
}

function isServiceAccountRestriction(message: string): boolean {
  return (
    message.toLowerCase().includes('service account') ||
    message.toLowerCase().includes('vault query must be provided')
  );
}

/**
 * Get the default field name based on item category
 */
export function getDefaultFieldForCategory(category: string): string {
  const categoryDefaults: Record<string, string> = {
    API_CREDENTIAL: 'credential',
    LOGIN: 'password',
    PASSWORD: 'password',
    DATABASE: 'password',
    SERVER: 'password',
    SECURE_NOTE: 'notesPlain',
  };
  return categoryDefaults[category] || 'password';
}

function normalizeFieldName(value?: string): string {
  return value?.trim().toLowerCase() ?? '';
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function tokenizeSearchText(value: string): string[] {
  const normalized = normalizeSearchText(value);
  if (!normalized) return [];
  return normalized.split(' ').filter((token) => token.length > 0);
}

export function matchQueryToText(query: string, text: string): boolean {
  const tokens = tokenizeSearchText(query);
  if (tokens.length === 0) return false;
  const haystack = ` ${normalizeSearchText(text)} `;
  return tokens.every((token) => haystack.includes(` ${token} `));
}

export function buildItemSearchText(item: OpItem, fields?: OpField[]): string {
  const parts: string[] = [];

  if (item.title) parts.push(item.title);
  if (item.category) parts.push(item.category);
  if (item.tags && item.tags.length > 0) parts.push(item.tags.join(' '));
  if (item.urls && item.urls.length > 0) {
    parts.push(
      item.urls
        .map((url) => [url.label, url.href].filter(Boolean).join(' '))
        .join(' ')
    );
  }

  if (fields && fields.length > 0) {
    for (const field of fields) {
      if (field.label) parts.push(field.label);
      if (field.id) parts.push(field.id);
      if (field.value !== undefined && field.type !== 'CONCEALED') {
        parts.push(String(field.value));
      }
    }
  }

  return parts.join(' ').trim();
}

function matchesFieldName(field: OpField, name: string): boolean {
  const target = normalizeFieldName(name);
  return (
    normalizeFieldName(field.id) === target ||
    normalizeFieldName(field.label) === target
  );
}

function findFieldByName(fields: OpField[] | undefined, name: string): OpField | undefined {
  if (!fields) return undefined;
  return fields.find((field) => matchesFieldName(field, name));
}

function findNotesField(fields: OpField[] | undefined): OpField | undefined {
  if (!fields) return undefined;
  return fields.find((field) => {
    const id = normalizeFieldName(field.id);
    const label = normalizeFieldName(field.label);
    return id === 'notesplain' || label === 'notes';
  });
}

function findApiKeyField(fields: OpField[] | undefined): OpField | undefined {
  if (!fields) return undefined;
  return fields.find((field) => {
    const id = normalizeFieldName(field.id);
    const label = normalizeFieldName(field.label);
    return /_api_(key|token)$/.test(id) || /_api_(key|token)$/.test(label);
  });
}

export function resolveSecretFieldForItem(
  fields: OpField[] | undefined,
  defaultField: string,
  options: { allowCredentialFallback?: boolean } = {}
): { field: string; fieldData?: OpField } {
  const directMatch = findFieldByName(fields, defaultField);
  if (directMatch) {
    return {
      field: directMatch.id || directMatch.label || defaultField,
      fieldData: directMatch,
    };
  }

  const allowFallback = options.allowCredentialFallback ?? true;
  if (!allowFallback || normalizeFieldName(defaultField) !== 'credential') {
    return { field: defaultField };
  }

  const fallbackField =
    findFieldByName(fields, 'password') ||
    findNotesField(fields) ||
    findApiKeyField(fields);

  if (fallbackField) {
    return {
      field: fallbackField.id || fallbackField.label || defaultField,
      fieldData: fallbackField,
    };
  }

  return { field: defaultField };
}

export function getNotesValue(fields?: OpField[]): string | null {
  const notesField = findNotesField(fields);
  if (!notesField || notesField.value === undefined) {
    return null;
  }
  const value = String(notesField.value);
  return value.length > 0 ? value : null;
}

export function getNonEmptyFields(fields?: OpField[]): OpField[] {
  if (!fields) return [];
  return fields.filter((field) => {
    if (field.value === undefined || field.value === null) {
      return false;
    }
    const value = String(field.value);
    return value.trim().length > 0;
  });
}

/**
 * Check if an item name contains characters that break op:// references
 */
function hasSpecialChars(name: string): boolean {
  return name.includes('/') || name.includes('\\');
}

/**
 * Get item ID for names with special characters
 */
export function getItemId(title: string, vault: string = 'Private'): string | null {
  const item = getItem(title, vault);
  return item?.id ?? null;
}

interface ShareLinkResolverDeps {
  execFileSync: typeof execFileSync;
  getServiceAccountEnv: () => NodeJS.ProcessEnv;
  getUserEnv: () => NodeJS.ProcessEnv;
}

function runShareLinkAttempts(
  shareLink: string,
  env: NodeJS.ProcessEnv,
  execFn: typeof execFileSync
): { item?: OpItem; lastError?: string; shareLinkUnsupported?: boolean; serviceAccountRestricted?: boolean } {
  let lastError = '';
  let shareLinkUnsupported = false;
  let serviceAccountRestricted = false;

  const attempts: string[][] = [
    ['item', 'get', '--share-link', shareLink, '--format=json'],
    ['item', 'get', shareLink, '--format=json'],
  ];

  for (const args of attempts) {
    try {
      const output = execFn('op', args, {
        encoding: 'utf-8',
        stdio: 'pipe',
        env,
      });
      return { item: JSON.parse(output) as OpItem };
    } catch (error: unknown) {
      const message = formatOpErrorMessage(error);
      if (message) {
        lastError = message;
      }
      if (isShareLinkUnsupported(message)) {
        shareLinkUnsupported = true;
      }
      if (isServiceAccountRestriction(message)) {
        serviceAccountRestricted = true;
      }
    }
  }

  return { lastError, shareLinkUnsupported, serviceAccountRestricted };
}

export function createShareLinkResolver(
  overrides: Partial<ShareLinkResolverDeps> = {}
): (shareLink: string) => OpItem {
  const deps: ShareLinkResolverDeps = {
    execFileSync,
    getServiceAccountEnv: getOpEnv,
    getUserEnv: getOpEnvWithoutServiceAccount,
    ...overrides,
  };

  return (shareLink: string): OpItem => {
    const primary = runShareLinkAttempts(
      shareLink,
      deps.getServiceAccountEnv(),
      deps.execFileSync
    );

    if (primary.item) {
      return primary.item;
    }

    if (primary.shareLinkUnsupported) {
      throw new OpError(
        'Share links are not supported by this op CLI version. Update op and try again.',
        1
      );
    }

    if (primary.serviceAccountRestricted) {
      const fallback = runShareLinkAttempts(
        shareLink,
        deps.getUserEnv(),
        deps.execFileSync
      );

      if (fallback.item) {
        return fallback.item;
      }

      if (fallback.shareLinkUnsupported) {
        throw new OpError(
          'Share links are not supported by this op CLI version. Update op and try again.',
          1
        );
      }

      const suffix = fallback.lastError ? `: ${fallback.lastError}` : '';
      throw new OpError(`Failed to resolve share link${suffix}`, 1);
    }

    const suffix = primary.lastError ? `: ${primary.lastError}` : '';
    throw new OpError(`Failed to resolve share link${suffix}`, 1);
  };
}

/**
 * Check if op CLI is installed and user is signed in
 */
export function checkOpCli(): void {
  const env = getOpEnv();
  
  try {
    execFileSync('op', ['--version'], { stdio: 'pipe', env });
  } catch {
    throw new OpError(
      'op CLI not found. Install from: https://1password.com/downloads/command-line/',
      1
    );
  }

  try {
    execFileSync('op', ['account', 'list'], { stdio: 'pipe', env });
  } catch {
    throw new OpError(
      'Not signed in to 1Password. Run: op signin or opbootstrap',
      1
    );
  }
}

/**
 * List items in a vault
 */
export function listItems(vault: string = 'Private'): OpItem[] {
  const env = getOpEnv();
  const retryOpts = { ...globalRetryOptions, isRetryable: isOpErrorRetryable };

  try {
    return withRetrySync(() => {
      const output = execFileSync(
        'op',
        ['item', 'list', '--vault', vault, '--format=json'],
        { encoding: 'utf-8', stdio: 'pipe', env }
      );
      return JSON.parse(output);
    }, retryOpts);
  } catch (error: any) {
    if (error.stderr?.includes('vault')) {
      throw new OpError(`Vault "${vault}" not found`, 1);
    }
    throw new OpError(`Failed to list items: ${error.message}`, 1);
  }
}

/**
 * List items across all vaults
 */
export function listItemsAll(): OpItem[] {
  const env = getOpEnv();
  const retryOpts = { ...globalRetryOptions, isRetryable: isOpErrorRetryable };

  try {
    return withRetrySync(() => {
      const output = execFileSync(
        'op',
        ['item', 'list', '--format=json'],
        { encoding: 'utf-8', stdio: 'pipe', env }
      );
      return JSON.parse(output);
    }, retryOpts);
  } catch (error: any) {
    throw new OpError(`Failed to list items: ${error.message}`, 1);
  }
}

/**
 * Check if an item exists in the vault (regardless of field)
 */
export function itemExists(
  title: string,
  vault: string = 'Private'
): boolean {
  const env = getOpEnv();

  try {
    execFileSync(
      'op',
      ['item', 'get', title, '--vault', vault, '--format=json'],
      { encoding: 'utf-8', stdio: 'pipe', env }
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Get a secret from 1Password
 */
export function getSecret(
  reference: string,
  vault: string = 'Private',
  field: string = 'password'
): string | null {
  const env = getOpEnv();
  const retryOpts = { ...globalRetryOptions, isRetryable: isOpErrorRetryable };

  try {
    return withRetrySync(() => {
      // Try direct reference first (op://vault/item/field)
      if (reference.startsWith('op://')) {
        const output = execFileSync(
          'op',
          ['read', reference],
          { encoding: 'utf-8', stdio: 'pipe', env }
        );
        return output.trim();
      }

      // If name has special chars (like /), use item ID instead
      let itemRef = reference;
      if (hasSpecialChars(reference)) {
        const itemId = getItemId(reference, vault);
        if (itemId) {
          itemRef = itemId;
        }
      }

      // Construct reference
      const opReference = `op://${vault}/${itemRef}/${field}`;
      const output = execFileSync(
        'op',
        ['read', opReference],
        { encoding: 'utf-8', stdio: 'pipe', env }
      );
      return output.trim();
    }, retryOpts);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Secret writes
//
// Secret values are never passed to `op` as argv entries. Command arguments are
// visible to every other process on the machine (`ps`, /proc) and Node embeds
// the full argv in the error thrown by a failed `execFileSync`, so an
// assignment statement like `password=<value>` leaks the value both while the
// write runs and again in the error text if it fails.
//
// `op` 2.x accepts an item JSON template on stdin instead:
//   create: `op item create - --vault <vault>`  (the `-` reads the template)
//   edit:   `op item edit <item> --vault <vault>` with the template piped in
// Every write below ships the value through the child process's stdin, leaving
// argv with nothing but item titles, vault names, and flags.
// ---------------------------------------------------------------------------

const REDACTED = '[redacted]';
const CONCEALED_FIELD_TYPE = 'CONCEALED';

export type OpItemDocument = Record<string, unknown>;

interface OpItemDocumentField extends Record<string, unknown> {
  id?: string;
  label?: string;
  type?: string;
  value?: string;
}

/**
 * Render an `op` invocation for an error message. Any `field=value` assignment
 * keeps its field name and loses its value, so the message stays actionable
 * without reproducing a secret. Flags (`--vault`, `--category=password`) are
 * preserved verbatim because they never carry field values.
 */
export function describeOpCommand(args: readonly string[]): string {
  const rendered = args.map((arg) => {
    if (arg.startsWith('-')) return arg;
    const separator = arg.indexOf('=');
    if (separator <= 0) return arg;
    return `${arg.slice(0, separator)}=${REDACTED}`;
  });
  return ['op', ...rendered].join(' ');
}

/**
 * Strip known secret values out of text that is about to be shown to a user.
 * Applied to subprocess stderr regardless of transport, so a future `op`
 * version that echoes its input cannot turn an error into a disclosure.
 *
 * Values reach `op` inside a JSON document, so the escaped form is redacted
 * too: `op` quotes the offending input when it rejects a template, and a value
 * containing a quote, backslash, or newline appears there escaped.
 */
export function redactSecretValues(
  text: string,
  secrets: readonly string[]
): string {
  let output = text;

  for (const secret of secrets) {
    if (!secret) continue;

    const variants = new Set([secret, JSON.stringify(secret).slice(1, -1)]);
    for (const variant of variants) {
      if (!variant) continue;
      output = output.split(variant).join(REDACTED);
    }
  }

  return output;
}

function extractOpStderr(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  const stderr = (error as { stderr?: Buffer | string }).stderr;
  return stderr ? String(stderr).trim() : '';
}

function extractExitStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : undefined;
}

/**
 * Build the message for a failed write. `error.message` from `execFileSync`
 * embeds the full argv, so it is deliberately never used here: the command is
 * reconstructed from the redacted args instead, and only stderr is quoted.
 */
function buildOpWriteErrorMessage(
  label: string,
  args: readonly string[],
  error: unknown,
  secrets: readonly string[]
): string {
  const parts = [`${label}: \`${describeOpCommand(args)}\` failed`];

  const status = extractExitStatus(error);
  if (status !== undefined) {
    parts.push(`(exit code ${status})`);
  }

  const stderr = redactSecretValues(extractOpStderr(error), secrets);
  const firstLine = stderr.split('\n')[0]?.trim();
  if (firstLine) {
    parts.push(`- ${firstLine}`);
  }

  return parts.join(' ');
}

export interface SecretWriterDeps {
  execFileSync: typeof execFileSync;
  getEnv: () => NodeJS.ProcessEnv;
  getItemDocument: (title: string, vault: string) => OpItemDocument | null;
}

const ITEM_NOT_FOUND_PATTERNS = [
  /isn't an item/i,
  /no item matches/i,
  /no items matched/i,
  /doesn't exist/i,
  /not found/i,
];

function isItemNotFoundError(error: unknown): boolean {
  const stderr = extractOpStderr(error);
  return ITEM_NOT_FOUND_PATTERNS.some((pattern) => pattern.test(stderr));
}

/**
 * Fetch an item as a raw JSON document suitable for round-tripping back into
 * `op item edit`. `getItem` narrows to OpItem; edits need every key `op`
 * emitted, including ones this codebase does not model.
 *
 * Only a genuine "no such item" returns null. Every other failure -- an expired
 * session, a mistyped vault, a network error -- is raised, because callers
 * treat null as "does not exist yet" and would otherwise create a second item
 * holding the secret while the real one sat untouched.
 */
export function getItemDocument(
  title: string,
  vault: string = 'Private'
): OpItemDocument | null {
  const env = getOpEnv();
  const retryOpts = { ...globalRetryOptions, isRetryable: isOpErrorRetryable };

  try {
    return withRetrySync(() => {
      const output = execFileSync(
        'op',
        ['item', 'get', title, '--vault', vault, '--format=json'],
        { encoding: 'utf-8', stdio: 'pipe', env }
      );
      const parsed = JSON.parse(output);
      return parsed && typeof parsed === 'object'
        ? (parsed as OpItemDocument)
        : null;
    }, retryOpts);
  } catch (error: unknown) {
    if (isItemNotFoundError(error)) {
      return null;
    }

    const detail = extractOpStderr(error).split('\n')[0]?.trim();
    throw new OpError(
      `Failed to read "${title}" from vault "${vault}"${detail ? `: ${detail}` : ''}`,
      1
    );
  }
}

/**
 * Build the item JSON template for a create.
 *
 * `op` validates templates more strictly than assignment statements: a
 * PASSWORD item is rejected unless its built-in password field carries a
 * non-empty value. Anything that cannot satisfy that (a custom field name, or
 * an empty value) is created as an API_CREDENTIAL instead, which accepts a
 * single named concealed field and stays readable at `op://<vault>/<item>/<field>`.
 */
function buildCreateTemplate(
  title: string,
  value: string,
  field: string
): OpItemDocument {
  const normalized = normalizeFieldName(field);

  if (normalized === 'password' && value !== '') {
    return {
      title,
      category: 'PASSWORD',
      fields: [
        {
          id: 'password',
          type: CONCEALED_FIELD_TYPE,
          purpose: 'PASSWORD',
          label: 'password',
          value,
        },
      ],
    };
  }

  if (normalized === 'notesplain') {
    return {
      title,
      category: 'SECURE_NOTE',
      fields: [
        {
          id: 'notesPlain',
          type: 'STRING',
          purpose: 'NOTES',
          label: 'notesPlain',
          value,
        },
      ],
    };
  }

  if (normalized === 'credential') {
    return {
      title,
      category: 'API_CREDENTIAL',
      fields: [
        { id: 'credential', type: CONCEALED_FIELD_TYPE, label: 'credential', value },
      ],
    };
  }

  return {
    title,
    category: 'API_CREDENTIAL',
    fields: [{ label: field, type: CONCEALED_FIELD_TYPE, value }],
  };
}

const MASK_CHARACTERS = /^[*•·●]+$/;

/**
 * `op item get --format=json` returns concealed values in plaintext, which is
 * what makes the round-trip below safe (and is what `op`'s own documented
 * item-duplication workflow relies on). If that ever stops being true, writing
 * the document back would replace every other concealed field with its mask, so
 * detect a masked value and refuse instead of destroying the item.
 */
function hasMaskedFieldValue(document: OpItemDocument): boolean {
  const fields = Array.isArray(document.fields)
    ? (document.fields as OpItemDocumentField[])
    : [];

  return fields.some(
    (field) =>
      typeof field.value === 'string' &&
      field.value.length > 0 &&
      MASK_CHARACTERS.test(field.value)
  );
}

/**
 * Passkeys arrive from `op item get --format=json` as a valueless field of type
 * `UNKNOWN`, and `op item edit --help` states plainly that a JSON template will
 * overwrite a passkey. Round-tripping such an item turns the passkey into an
 * empty STRING field and destroys the credential, so detect and refuse it.
 */
function hasUnrepresentableField(document: OpItemDocument): boolean {
  const fields = Array.isArray(document.fields)
    ? (document.fields as OpItemDocumentField[])
    : [];

  return fields.some(
    (field) => String(field.type ?? '').toUpperCase() === 'UNKNOWN'
  );
}

/**
 * A JSON template replaces the item it is applied to, so anything the template
 * cannot carry would be destroyed by the round-trip. Refuse those items rather
 * than silently dropping part of them.
 */
function assertDocumentIsTemplateSafe(
  document: OpItemDocument,
  title: string
): void {
  const files = document.files;
  const hasFiles = Array.isArray(files) && files.length > 0;
  const isDocument = String(document.category ?? '').toUpperCase() === 'DOCUMENT';

  if (hasFiles || isDocument) {
    throw new OpError(
      `Refusing to update "${title}": a JSON template cannot carry file attachments, so the write would drop them. Update it in the 1Password app instead.`,
      1
    );
  }

  if (hasUnrepresentableField(document)) {
    throw new OpError(
      `Refusing to update "${title}": the item holds a field the op CLI cannot round-trip through a JSON template, such as a passkey, and the write would destroy it. Update it in the 1Password app instead.`,
      1
    );
  }

  if (hasMaskedFieldValue(document)) {
    throw new OpError(
      `Refusing to update "${title}": the op CLI returned masked field values, so writing the item back would overwrite its other fields with the mask. Update your op CLI, or edit the item in the 1Password app.`,
      1
    );
  }
}

function applyFieldValueToDocument(
  document: OpItemDocument,
  field: string,
  value: string
): void {
  const fields: OpItemDocumentField[] = Array.isArray(document.fields)
    ? (document.fields as OpItemDocumentField[])
    : [];
  const normalized = normalizeFieldName(field);

  const target = fields.find(
    (candidate) =>
      normalizeFieldName(candidate.id) === normalized ||
      normalizeFieldName(candidate.label) === normalized
  );

  if (target) {
    target.value = value;
  } else {
    fields.push({ label: field, type: CONCEALED_FIELD_TYPE, value });
  }

  document.fields = fields;
}

function runOpWrite(
  args: readonly string[],
  input: string,
  secrets: readonly string[],
  label: string,
  deps: SecretWriterDeps
): void {
  try {
    deps.execFileSync('op', [...args], {
      input,
      stdio: 'pipe',
      env: deps.getEnv(),
    });
  } catch (error: unknown) {
    throw new OpError(buildOpWriteErrorMessage(label, args, error, secrets), 1);
  }
}

function createItemWithDeps(
  title: string,
  value: string,
  vault: string,
  field: string,
  label: string,
  deps: SecretWriterDeps
): void {
  const template = buildCreateTemplate(title, value, field);
  runOpWrite(
    ['item', 'create', '-', '--vault', vault],
    JSON.stringify(template),
    [value],
    label,
    deps
  );
}

function updateItemWithDeps(
  title: string,
  value: string,
  vault: string,
  field: string,
  label: string,
  deps: SecretWriterDeps,
  document?: OpItemDocument
): void {
  const target = document ?? deps.getItemDocument(title, vault);

  if (!target) {
    throw new OpError(
      `${label}: item "${title}" was not found in vault "${vault}"`,
      1
    );
  }

  assertDocumentIsTemplateSafe(target, title);
  applyFieldValueToDocument(target, field, value);

  const itemRef =
    typeof target.id === 'string' && target.id.length > 0 ? target.id : title;

  runOpWrite(
    ['item', 'edit', itemRef, '--vault', vault],
    JSON.stringify(target),
    [value],
    label,
    deps
  );
}

function setSecretWithDeps(
  title: string,
  value: string,
  vault: string,
  field: string,
  deps: SecretWriterDeps
): void {
  const label = 'Failed to set secret';
  const existing = deps.getItemDocument(title, vault);

  if (existing) {
    updateItemWithDeps(title, value, vault, field, label, deps, existing);
    return;
  }

  createItemWithDeps(title, value, vault, field, label, deps);
}

/**
 * Build the secret-write functions over injectable dependencies. Production
 * code uses the default writer below; tests use this to observe the exact argv
 * and stdin handed to `op`.
 */
export function createSecretWriter(overrides: Partial<SecretWriterDeps> = {}): {
  setSecret: typeof setSecret;
  createItem: typeof createItem;
  updateItem: typeof updateItem;
} {
  const deps: SecretWriterDeps = {
    execFileSync,
    getEnv: getOpEnv,
    getItemDocument,
    ...overrides,
  };

  return {
    setSecret: (title, value, vault = 'Private', field = 'password') =>
      setSecretWithDeps(title, value, vault, field, deps),
    createItem: (title, value, vault = 'Private', field = 'password') =>
      createItemWithDeps(title, value, vault, field, 'Failed to create secret', deps),
    updateItem: (title, value, vault = 'Private', field = 'password') =>
      updateItemWithDeps(title, value, vault, field, 'Failed to update secret', deps),
  };
}

const defaultSecretWriter = createSecretWriter();

/**
 * Create or update a secret in 1Password
 */
export function setSecret(
  title: string,
  value: string,
  vault: string = 'Private',
  field: string = 'password'
): void {
  defaultSecretWriter.setSecret(title, value, vault, field);
}

/**
 * Create a secret item in 1Password
 */
export function createItem(
  title: string,
  value: string,
  vault: string = 'Private',
  field: string = 'password'
): void {
  defaultSecretWriter.createItem(title, value, vault, field);
}

/**
 * Update a secret item in 1Password
 */
export function updateItem(
  title: string,
  value: string,
  vault: string = 'Private',
  field: string = 'password'
): void {
  defaultSecretWriter.updateItem(title, value, vault, field);
}

/**
 * Get item details including all fields
 */
export function getItem(title: string, vault: string = 'Private'): OpItem | null {
  const env = getOpEnv();
  const retryOpts = { ...globalRetryOptions, isRetryable: isOpErrorRetryable };

  try {
    return withRetrySync(() => {
      const output = execFileSync(
        'op',
        ['item', 'get', title, '--vault', vault, '--format=json'],
        { encoding: 'utf-8', stdio: 'pipe', env }
      );
      return JSON.parse(output);
    }, retryOpts);
  } catch {
    return null;
  }
}

/**
 * Get item details asynchronously (for true parallel execution)
 */
export async function getItemAsync(title: string, vault: string = 'Private'): Promise<OpItem | null> {
  const env = getOpEnv();
  const retryOpts = { ...globalRetryOptions, isRetryable: isOpErrorRetryable };

  try {
    return await withRetry(async () => {
      const { stdout } = await execFileAsync(
        'op',
        ['item', 'get', title, '--vault', vault, '--format=json'],
        { encoding: 'utf-8', env }
      );
      return JSON.parse(stdout);
    }, retryOpts);
  } catch {
    return null;
  }
}

/**
 * Get item ID asynchronously for names with special characters
 */
export async function getItemIdAsync(title: string, vault: string = 'Private'): Promise<string | null> {
  const item = await getItemAsync(title, vault);
  return item?.id ?? null;
}

/**
 * Get a secret asynchronously (for true parallel execution)
 */
export async function getSecretAsync(
  reference: string,
  vault: string = 'Private',
  field: string = 'password'
): Promise<string | null> {
  const env = getOpEnv();
  const retryOpts = { ...globalRetryOptions, isRetryable: isOpErrorRetryable };

  try {
    return await withRetry(async () => {
      // Try direct reference first (op://vault/item/field)
      if (reference.startsWith('op://')) {
        const { stdout } = await execFileAsync(
          'op',
          ['read', reference],
          { encoding: 'utf-8', env }
        );
        return stdout.trim();
      }

      // If name has special chars (like /), use item ID instead
      let itemRef = reference;
      if (hasSpecialChars(reference)) {
        const itemId = await getItemIdAsync(reference, vault);
        if (itemId) {
          itemRef = itemId;
        }
      }

      // Construct reference
      const opReference = `op://${vault}/${itemRef}/${field}`;
      const { stdout } = await execFileAsync(
        'op',
        ['read', opReference],
        { encoding: 'utf-8', env }
      );
      return stdout.trim();
    }, retryOpts);
  } catch {
    return null;
  }
}

/**
 * Get available field labels for an item
 */
export function getItemFields(title: string, vault: string = 'Private'): string[] {
  const item = getItem(title, vault);
  if (!item?.fields) return [];

  return item.fields
    .filter((f) => f.label && f.label.length > 0)
    .map((f) => f.label);
}

/**
 * Resolve a 1Password share link into an item payload.
 */
const resolveShareLink = createShareLinkResolver();

export function getItemFromShareLink(shareLink: string): OpItem {
  return resolveShareLink(shareLink);
}

/**
 * List favorite items in a vault
 */
export function listFavorites(vault: string = 'Private'): OpItem[] {
  const env = getOpEnv();
  const retryOpts = { ...globalRetryOptions, isRetryable: isOpErrorRetryable };

  try {
    return withRetrySync(() => {
      const output = execFileSync(
        'op',
        ['item', 'list', '--vault', vault, '--favorite', '--format=json'],
        { encoding: 'utf-8', stdio: 'pipe', env }
      );
      return JSON.parse(output);
    }, retryOpts);
  } catch (error: any) {
    if (error.stderr?.includes('vault')) {
      throw new OpError(`Vault "${vault}" not found`, 1);
    }
    throw new OpError(`Failed to list favorites: ${error.message}`, 1);
  }
}

/**
 * Search for items by title
 */
export function searchItems(query: string, vault: string = 'Private'): OpItem[] {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return [];

  const env = getOpEnv();
  try {
    const output = execFileSync(
      'op',
      ['item', 'list', '--vault', vault, '--query', trimmedQuery, '--format=json'],
      { encoding: 'utf-8', stdio: 'pipe', env }
    );
    const serverMatches = JSON.parse(output) as OpItem[];
    if (serverMatches.length > 0) {
      return serverMatches;
    }
  } catch {
    // Ignore server-side query errors and fall back to local matching.
  }

  const items = listItems(vault);
  const titleMatches = items.filter((item) =>
    matchQueryToText(trimmedQuery, item.title)
  );

  if (titleMatches.length > 0) {
    return titleMatches;
  }

  const maxFieldItems = 200;
  const candidates = items.slice(0, maxFieldItems);
  const deepMatches: OpItem[] = [];

  for (const item of candidates) {
    const itemRef = item.id || item.title;
    const fullItem = getItem(itemRef, vault);
    const fields = fullItem?.fields ?? [];
    const haystack = buildItemSearchText(fullItem ?? item, fields);
    if (haystack && matchQueryToText(trimmedQuery, haystack)) {
      deepMatches.push(fullItem ?? item);
    }
  }

  return deepMatches;
}

/**
 * Search across all vaults
 */
export function searchItemsAll(query: string): OpItem[] {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return [];

  const env = getOpEnv();
  try {
    const output = execFileSync(
      'op',
      ['item', 'list', '--query', trimmedQuery, '--format=json'],
      { encoding: 'utf-8', stdio: 'pipe', env }
    );
    const serverMatches = JSON.parse(output) as OpItem[];
    if (serverMatches.length > 0) {
      return serverMatches;
    }
  } catch {
    // Ignore server-side query errors and fall back to local matching.
  }

  const items = listItemsAll();
  const titleMatches = items.filter((item) =>
    matchQueryToText(trimmedQuery, item.title)
  );

  if (titleMatches.length > 0) {
    return titleMatches;
  }

  const maxFieldItems = 200;
  const candidates = items.slice(0, maxFieldItems);
  const deepMatches: OpItem[] = [];

  for (const item of candidates) {
    const itemRef = item.id || item.title;
    const fullItem = getItem(itemRef);
    const fields = fullItem?.fields ?? [];
    const haystack = buildItemSearchText(fullItem ?? item, fields);
    if (haystack && matchQueryToText(trimmedQuery, haystack)) {
      deepMatches.push(fullItem ?? item);
    }
  }

  return deepMatches;
}

/**
 * Calculate Levenshtein edit distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  // Initialize first row and column
  for (let i = 0; i <= a.length; i++) matrix[i] = [i];
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

  // Fill the matrix
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[a.length][b.length];
}

/**
 * Calculate similarity score (0-100) based on Levenshtein distance
 */
function similarityScore(query: string, target: string): number {
  const queryLower = query.toLowerCase();
  const targetLower = target.toLowerCase();

  // Exact match
  if (queryLower === targetLower) return 100;

  // Calculate base Levenshtein score
  const distance = levenshteinDistance(queryLower, targetLower);
  const maxLen = Math.max(queryLower.length, targetLower.length);
  const levenshteinScore = Math.max(0, 100 - (distance / maxLen) * 100);

  // Bonus for substring matches
  let substringBonus = 0;
  if (targetLower.includes(queryLower) || queryLower.includes(targetLower)) {
    substringBonus = 30;
  }

  // Bonus for word overlap
  const queryWords = queryLower.split(/[_\-\s]+/);
  const targetWords = targetLower.split(/[_\-\s]+/);
  let wordBonus = 0;
  for (const qw of queryWords) {
    if (qw.length < 2) continue;
    for (const tw of targetWords) {
      if (tw.includes(qw) || qw.includes(tw)) {
        wordBonus += 15;
      }
    }
  }

  return Math.min(100, levenshteinScore + substringBonus + wordBonus);
}

export interface SimilarItem {
  title: string;
  score: number;
}

/**
 * Find similar item names using fuzzy matching (Levenshtein + heuristics)
 */
export function findSimilarItems(
  query: string,
  vault: string = 'Private',
  maxResults: number = 3
): string[] {
  return findSimilarItemsWithScore(query, vault, maxResults).map(item => item.title);
}

/**
 * Find similar items with their similarity scores
 */
export function findSimilarItemsWithScore(
  query: string,
  vault: string = 'Private',
  maxResults: number = 5
): SimilarItem[] {
  const items = listItems(vault);

  // Score items by similarity
  const scored = items
    .map((item) => ({
      title: item.title,
      score: similarityScore(query, item.title),
    }))
    .filter((item) => item.score > 30) // Minimum threshold for relevance
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);

  return scored;
}

export interface OpVault {
  id: string;
  name: string;
  type: string;
}

/**
 * List all vaults accessible to the user
 */
export function listVaults(): OpVault[] {
  const env = getOpEnv();
  const retryOpts = { ...globalRetryOptions, isRetryable: isOpErrorRetryable };

  try {
    return withRetrySync(() => {
      const output = execFileSync(
        'op',
        ['vault', 'list', '--format=json'],
        { encoding: 'utf-8', stdio: 'pipe', env }
      );
      return JSON.parse(output);
    }, retryOpts);
  } catch (error: unknown) {
    const message = formatOpErrorMessage(error);
    throw new OpError(`Failed to list vaults${message ? ': ' + message : ''}`, 1);
  }
}
