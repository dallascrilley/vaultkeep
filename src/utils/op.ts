import { execFileSync, execSync } from 'child_process';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { OpItem, OpError } from './types.js';

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

function isShareLinkUnsupported(message: string): boolean {
  return message.includes('--share-link') && message.includes('unknown');
}

function isServiceAccountRestriction(message: string): boolean {
  return (
    message.toLowerCase().includes('service account') ||
    message.toLowerCase().includes('vault query must be provided')
  );
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
    execSync('op --version', { stdio: 'pipe', env });
  } catch {
    throw new OpError(
      'op CLI not found. Install from: https://1password.com/downloads/command-line/',
      1
    );
  }

  try {
    execSync('op account list', { stdio: 'pipe', env });
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
  
  try {
    const output = execSync(
      `op item list --vault="${vault}" --format=json`,
      { encoding: 'utf-8', stdio: 'pipe', env }
    );
    return JSON.parse(output);
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
    execSync(`op item get "${title}" --vault="${vault}" --format=json`, {
      encoding: 'utf-8',
      stdio: 'pipe',
      env,
    });
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

  try {
    // Try direct reference first (op://vault/item/field)
    if (reference.startsWith('op://')) {
      const output = execSync(`op read "${reference}"`, {
        encoding: 'utf-8',
        stdio: 'pipe',
        env,
      });
      return output.trim();
    }

    // Otherwise, construct reference
    const opReference = `op://${vault}/${reference}/${field}`;
    const output = execSync(`op read "${opReference}" 2>/dev/null`, {
      encoding: 'utf-8',
      stdio: 'pipe',
      env,
    });
    return output.trim();
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
      // Update existing item
      execSync(
        `op item edit "${title}" --vault="${vault}" "${field}=${value}"`,
        { stdio: 'pipe', env }
      );
    } else {
      // Create new item
      execSync(
        `op item create --category="password" --title="${title}" --vault="${vault}" "${field}=${value}"`,
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

  try {
    const output = execSync(
      `op item get "${title}" --vault="${vault}" --format=json`,
      { encoding: 'utf-8', stdio: 'pipe', env }
    );
    return JSON.parse(output);
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

  try {
    const output = execSync(
      `op item list --vault="${vault}" --favorite --format=json`,
      { encoding: 'utf-8', stdio: 'pipe', env }
    );
    return JSON.parse(output);
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
  return items.filter((item) =>
    item.title.toLowerCase().includes(query.toLowerCase())
  );
}

/**
 * Find similar item names using simple string matching
 */
export function findSimilarItems(
  query: string,
  vault: string = 'Private',
  maxResults: number = 3
): string[] {
  const items = listItems(vault);
  const queryLower = query.toLowerCase();

  // Score items by similarity
  const scored = items
    .map((item) => {
      const titleLower = item.title.toLowerCase();
      let score = 0;

      // Exact substring match
      if (titleLower.includes(queryLower) || queryLower.includes(titleLower)) {
        score += 50;
      }

      // Word overlap
      const queryWords = queryLower.split(/[_\-\s]+/);
      const titleWords = titleLower.split(/[_\-\s]+/);
      for (const qw of queryWords) {
        for (const tw of titleWords) {
          if (tw.includes(qw) || qw.includes(tw)) {
            score += 20;
          }
        }
      }

      // Character overlap ratio
      const commonChars = [...queryLower].filter((c) => titleLower.includes(c)).length;
      score += Math.floor((commonChars / queryLower.length) * 30);

      return { title: item.title, score };
    })
    .filter((item) => item.score > 20)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);

  return scored.map((item) => item.title);
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

  try {
    const output = execSync('op vault list --format=json', {
      encoding: 'utf-8',
      stdio: 'pipe',
      env,
    });
    return JSON.parse(output);
  } catch (error: unknown) {
    const message = formatOpErrorMessage(error);
    throw new OpError(`Failed to list vaults${message ? ': ' + message : ''}`, 1);
  }
}
