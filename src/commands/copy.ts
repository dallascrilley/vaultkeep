import chalk from 'chalk';
import clipboardy from 'clipboardy';
import { getSecret, checkOpCli } from '../utils/op.js';
import {
  applyColorConfig,
  createSpinner,
  resolveBooleanOption,
  resolveField,
  resolveVault,
} from '../utils/cli.js';
import { OpError } from '../utils/types.js';

export interface CopyOptions {
  vault?: string;
  field?: string;
  ttl?: number;
  quiet?: boolean;
  color?: boolean;
}

const DEFAULT_TTL_SECONDS = 30;

function resolveTtlSeconds(value?: number): number {
  if (value === undefined) return DEFAULT_TTL_SECONDS;
  if (!Number.isFinite(value) || value < 0) {
    throw new OpError('Clipboard TTL must be a non-negative number of seconds.', 2);
  }
  return value;
}

export interface CopyDependencies {
  getSecret: typeof getSecret;
  checkOpCli: typeof checkOpCli;
  clipboardRead: () => Promise<string>;
  clipboardWrite: (value: string) => Promise<void>;
  applyColorConfig: typeof applyColorConfig;
  createSpinner: typeof createSpinner;
  resolveBooleanOption: typeof resolveBooleanOption;
  resolveField: typeof resolveField;
  resolveVault: typeof resolveVault;
}

const defaultDependencies: CopyDependencies = {
  getSecret,
  checkOpCli,
  clipboardRead: () => clipboardy.read(),
  clipboardWrite: (value: string) => clipboardy.write(value),
  applyColorConfig,
  createSpinner,
  resolveBooleanOption,
  resolveField,
  resolveVault,
};

export function createCopyCommand(
  overrides: Partial<CopyDependencies> = {}
): (name: string, options: CopyOptions) => Promise<void> {
  const deps = { ...defaultDependencies, ...overrides };

  return async function copyCommand(
    name: string,
    options: CopyOptions
  ): Promise<void> {
    try {
      deps.checkOpCli();

      const vault = deps.resolveVault(options.vault);
      const field = deps.resolveField(options.field);
      const envQuiet = deps.resolveBooleanOption(undefined, 'OPS_QUIET');
      const quiet = options.quiet === true || envQuiet;
      const envNoColor = deps.resolveBooleanOption(undefined, 'OPS_NO_COLOR');
      const noColor = options.color === false || envNoColor;
      const ttlSeconds = resolveTtlSeconds(options.ttl);

      deps.applyColorConfig(noColor);

      const spinner = deps.createSpinner('Copying secret to clipboard...', quiet);

      const secret = deps.getSecret(name, vault, field);

      if (secret === null) {
        spinner.fail(
          chalk.yellow(`Secret "${name}" not found in vault "${vault}"`)
        );
        throw new OpError('Secret not found.', 1);
      }

      await deps.clipboardWrite(secret);

      if (!quiet) {
        spinner.succeed(
          chalk.green(`Copied to clipboard! Will clear in ${ttlSeconds}s.`)
        );
      }

      setTimeout(async () => {
        try {
          const current = await deps.clipboardRead();
          if (current === secret) {
            await deps.clipboardWrite('');
            if (!quiet) {
              console.log(chalk.gray('✓ Clipboard cleared'));
            }
          }
        } catch {
          // Best-effort clipboard cleanup.
        }
      }, ttlSeconds * 1000);
    } catch (error) {
      if (error instanceof OpError) {
        console.error(chalk.red(`Error: ${error.message}`));
        process.exit(error.exitCode);
      }
      throw error;
    }
  };
}

export const copyCommand = createCopyCommand();
