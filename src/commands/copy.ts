import chalk from 'chalk';
import clipboardy from 'clipboardy';
import { getSecret, checkOpCli, findSimilarItems } from '../utils/op.js';
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
  findSimilarItems: typeof findSimilarItems;
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
  findSimilarItems,
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

        // Suggest similar items
        const similar = deps.findSimilarItems(name, vault);
        if (similar.length > 0) {
          console.log(chalk.cyan('\nDid you mean?'));
          for (const suggestion of similar) {
            console.log(chalk.white(`  - ${suggestion}`));
          }
        }

        throw new OpError('Secret not found. Use ops list to see available items.', 1);
      }

      await deps.clipboardWrite(secret);

      if (!quiet) {
        spinner.succeed(
          chalk.green(`Copied to clipboard! Will clear in ${ttlSeconds}s.`)
        );
      }

      // Helper to clear clipboard if it still contains the secret
      const clearClipboard = async () => {
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
      };

      // Register signal handlers to clear clipboard on interrupt
      const handleSignal = async () => {
        await clearClipboard();
        process.exit(0);
      };

      process.once('SIGINT', handleSignal);
      process.once('SIGTERM', handleSignal);

      // Schedule automatic cleanup after TTL.
      //
      // This timer is deliberately NOT unref()'d. README documents that `ops
      // copy` "confirms when it clears the clipboard after the TTL expires",
      // which is only possible if the process is still running when the timer
      // fires. An unref()'d timer never fires in a one-shot invocation, because
      // nothing else holds the event loop open, so the secret stayed on the
      // clipboard indefinitely. Holding the loop open until the TTL is what
      // makes the documented behavior true.
      setTimeout(async () => {
        process.off('SIGINT', handleSignal);
        process.off('SIGTERM', handleSignal);
        await clearClipboard();
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