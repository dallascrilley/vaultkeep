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

/**
 * Create or update a secret in 1Password
 */
export function setSecret(
  title: string,
  value: string,
  vault: string = 'Private',
  field: string = 'password'
): void {
  const env = getOpEnv();
  
  try {
    // Check if item exists
    const existing = getSecret(title, vault, field);

    if (existing) {
      // Update existing item using execFileSync (safe from injection)
      execFileSync(
        'op',
        ['item', 'edit', title, '--vault', vault, `${field}=${value}`],
        { stdio: 'pipe', env }
      );
    } else {
      // Create new item using execFileSync (safe from injection)
      execFileSync(
        'op',
        ['item', 'create', '--category=password', '--title', title, '--vault', vault, `${field}=${value}`],
        { stdio: 'pipe', env }
      );
    }
  } catch (error: any) {
    throw new OpError(`Failed to set secret: ${error.message}`, 1);
  }
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
  const env = getOpEnv();

  try {
    execFileSync(
      'op',
      [
        'item',
        'create',
        '--category=password',
        '--title',
        title,
        '--vault',
        vault,
        `${field}=${value}`,
      ],
      { stdio: 'pipe', env }
    );
  } catch (error: any) {
    throw new OpError(`Failed to create secret: ${error.message}`, 1);
  }
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
  const env = getOpEnv();

  try {
    execFileSync(
      'op',
      ['item', 'edit', title, '--vault', vault, `${field}=${value}`],
      { stdio: 'pipe', env }
    );
  } catch (error: any) {
    throw new OpError(`Failed to update secret: ${error.message}`, 1);
  }
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
  const items = listItems(vault);
  if (!query.trim()) return [];

  const titleMatches = items.filter((item) =>
    matchQueryToText(query, item.title)
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
    const fieldText = fields
      .map((field) => [field.label, field.id, field.value].filter(Boolean).join(' '))
      .join(' ');
    const haystack = `${fullItem?.title ?? item.title} ${fieldText}`.trim();
    if (haystack && matchQueryToText(query, haystack)) {
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
