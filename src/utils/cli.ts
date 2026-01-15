import chalk from 'chalk';
import ora from 'ora';
import { OpError } from './types.js';

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

export function resolveBooleanOption(
  value: boolean | undefined,
  envVar: string
): boolean {
  if (value !== undefined) return value;
  const envValue = process.env[envVar];
  if (!envValue) return false;
  return TRUE_VALUES.has(envValue.toLowerCase());
}

export function resolveVault(value?: string): string {
  return value || process.env.OPS_VAULT || 'Private';
}

export function resolveField(value?: string): string {
  return value || process.env.OPS_FIELD || 'password';
}

export function resolveFormat(value?: string): 'env' | 'json' {
  const format = (value || process.env.OPS_FORMAT || 'env').toLowerCase();
  if (format !== 'env' && format !== 'json') {
    throw new OpError(`Invalid format "${format}". Use "env" or "json".`, 2);
  }
  return format;
}

export function applyColorConfig(noColor: boolean): void {
  if (noColor || process.env.NO_COLOR || process.env.TERM === 'dumb') {
    chalk.level = 0;
  }
}

export function isInteractiveInput(): boolean {
  return Boolean(process.stdin.isTTY);
}

export function createSpinner(text: string, quiet: boolean) {
  return ora({
    text,
    isEnabled: Boolean(process.stdout.isTTY) && !quiet,
  }).start();
}
