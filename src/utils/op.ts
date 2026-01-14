import { execSync } from 'child_process';
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
    execSync(
      `op item create --category="password" --title="${title}" --vault="${vault}" "${field}=${value}"`,
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
    execSync(`op item edit "${title}" --vault="${vault}" "${field}=${value}"`, {
      stdio: 'pipe',
      env,
    });
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
