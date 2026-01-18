import { readFileSync } from 'fs';
import chalk from 'chalk';
import inquirer from 'inquirer';
import dotenv from 'dotenv';
import { checkOpCli, getItem, createItem, updateItem } from '../utils/op.js';
import {
  applyColorConfig,
  createSpinner,
  resolveBooleanOption,
  resolveVault,
} from '../utils/cli.js';
import { OpError } from '../utils/types.js';

export interface ImportOptions {
  vault?: string;
  quiet?: boolean;
  color?: boolean;
  dryRun?: boolean;
}

export interface ImportDependencies {
  checkOpCli: typeof checkOpCli;
  readFileSync: typeof readFileSync;
  parseEnv: (content: string) => Record<string, string>;
  getItem: typeof getItem;
  createItem: typeof createItem;
  updateItem: typeof updateItem;
  prompt: typeof inquirer.prompt;
  isInteractive: () => boolean;
  createSpinner: typeof createSpinner;
  applyColorConfig: typeof applyColorConfig;
  resolveBooleanOption: typeof resolveBooleanOption;
  resolveVault: typeof resolveVault;
}

const defaultDependencies: ImportDependencies = {
  checkOpCli,
  readFileSync,
  parseEnv: (content: string) => dotenv.parse(content),
  getItem,
  createItem,
  updateItem,
  prompt: inquirer.prompt,
  isInteractive: () => Boolean(process.stdin.isTTY),
  createSpinner,
  applyColorConfig,
  resolveBooleanOption,
  resolveVault,
};

export function createImportCommand(
  overrides: Partial<ImportDependencies> = {}
): (filePath: string | undefined, options: ImportOptions) => Promise<void> {
  const deps = { ...defaultDependencies, ...overrides };

  return async function importCommand(
    filePath: string | undefined,
    options: ImportOptions
  ): Promise<void> {
    try {
      const envQuiet = deps.resolveBooleanOption(undefined, 'OPS_QUIET');
      const quiet = options.quiet === true || envQuiet;
      const envNoColor = deps.resolveBooleanOption(undefined, 'OPS_NO_COLOR');
      const noColor = options.color === false || envNoColor;
      deps.applyColorConfig(noColor);

      deps.checkOpCli();

      const vault = deps.resolveVault(options.vault);
      let contents: string;

      // Support stdin: read from stdin if filePath is "-" or undefined with piped input
      const readFromStdin = filePath === '-' || (!filePath && !process.stdin.isTTY);
      
      if (readFromStdin) {
        try {
          contents = deps.readFileSync(0, 'utf-8');
        } catch (error) {
          throw new OpError('Failed to read from stdin.', 2);
        }
      } else if (filePath) {
        try {
          contents = deps.readFileSync(filePath, 'utf-8');
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Unable to read file.';
          throw new OpError(`Failed to read "${filePath}": ${message}`, 2);
        }
      } else {
        throw new OpError('No file path provided. Use "ops import <file>" or pipe data via stdin.', 2);
      }
      
      let parsed: Record<string, string>;
      try {
        parsed = deps.parseEnv(contents);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unable to parse env file.';
        const source = readFromStdin ? 'stdin' : `"${filePath}"`;
        throw new OpError(`Failed to parse ${source}: ${message}`, 2);
      }
      const entries = Object.entries(parsed);

      if (entries.length === 0) {
        if (!quiet) {
          console.log(chalk.yellow('No entries found to import.'));
        }
        return;
      }

      const dryRunPrefix = options.dryRun ? '[DRY RUN] ' : '';
      const spinner = deps.createSpinner(
        `${dryRunPrefix}Importing ${entries.length} secrets into "${vault}"...`,
        quiet
      );

      const imported: string[] = [];
      const updated: string[] = [];
      const skipped: string[] = [];

      const canPrompt = deps.isInteractive();

      for (const [key, value] of entries) {
        spinner.text = `${dryRunPrefix}Importing ${key}...`;

        const existing = deps.getItem(key, vault);

        if (existing) {
          if (options.dryRun) {
            // In dry-run mode, assume update would happen (no prompt)
            updated.push(key);
            continue;
          }

          if (!canPrompt) {
            skipped.push(key);
            continue;
          }

          const { action } = await deps.prompt([
            {
              type: 'list',
              name: 'action',
              message: `Secret "${key}" already exists. Update it?`,
              choices: [
                { name: 'Update', value: 'update' },
                { name: 'Skip', value: 'skip' },
              ],
              default: 'skip',
            },
          ]);

          if (action === 'skip') {
            skipped.push(key);
            continue;
          }

          deps.updateItem(key, value, vault, 'password');
          updated.push(key);
          continue;
        }

        if (!options.dryRun) {
          deps.createItem(key, value, vault, 'password');
        }
        imported.push(key);
      }

      if (!quiet) {
        const wouldVerb = options.dryRun ? 'Would import' : 'Imported';
        const wouldUpdate = options.dryRun ? 'would update' : 'updated';
        spinner.succeed(
          chalk.green(
            `${dryRunPrefix}${wouldVerb} ${imported.length}, ${wouldUpdate} ${updated.length}, skipped ${skipped.length}.`
          )
        );

        const reportTitle = options.dryRun ? '\n[DRY RUN] Import preview:' : '\nImport report:';
        console.log(chalk.cyan(reportTitle));
        if (imported.length) {
          const importLabel = options.dryRun ? 'Would import' : 'Imported';
          console.log(chalk.green(`  ${importLabel}: ${imported.join(', ')}`));
        }
        if (updated.length) {
          const updateLabel = options.dryRun ? 'Would update' : 'Updated';
          console.log(chalk.yellow(`  ${updateLabel}: ${updated.join(', ')}`));
        }
        if (skipped.length) {
          console.log(chalk.gray(`  Skipped: ${skipped.join(', ')}`));
        }
      }
    } catch (error) {
      if (error instanceof OpError) {
        console.error(chalk.red(`Error: ${error.message}`));
        process.exit(error.exitCode);
      }
      throw error;
    }
  };
}

export const importCommand = createImportCommand();