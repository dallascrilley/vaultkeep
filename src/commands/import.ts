import { readFileSync } from 'fs';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import dotenv from 'dotenv';
import { checkOpCli, getItem, createItem, updateItem } from '../utils/op.js';
import { OpError } from '../utils/types.js';

export interface ImportOptions {
  vault?: string;
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
  createSpinner: (text: string) => ReturnType<typeof ora>;
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
  createSpinner: (text: string) => ora(text).start(),
};

export function createImportCommand(
  overrides: Partial<ImportDependencies> = {}
): (filePath: string, options: ImportOptions) => Promise<void> {
  const deps = { ...defaultDependencies, ...overrides };

  return async function importCommand(
    filePath: string,
    options: ImportOptions
  ): Promise<void> {
    try {
      deps.checkOpCli();

      const vault = options.vault || 'Private';
      let contents: string;

      try {
        contents = deps.readFileSync(filePath, 'utf-8');
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unable to read file.';
        throw new OpError(`Failed to read "${filePath}": ${message}`, 2);
      }
      let parsed: Record<string, string>;
      try {
        parsed = deps.parseEnv(contents);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unable to parse env file.';
        throw new OpError(`Failed to parse "${filePath}": ${message}`, 2);
      }
      const entries = Object.entries(parsed);

      if (entries.length === 0) {
        console.log(chalk.yellow('No entries found to import.'));
        return;
      }

      const spinner = deps.createSpinner(
        `Importing ${entries.length} secrets into "${vault}"...`
      );

      const imported: string[] = [];
      const updated: string[] = [];
      const skipped: string[] = [];

      const canPrompt = deps.isInteractive();

      for (const [key, value] of entries) {
        spinner.text = `Importing ${key}...`;

        const existing = deps.getItem(key, vault);

        if (existing) {
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

        deps.createItem(key, value, vault, 'password');
        imported.push(key);
      }

      spinner.succeed(
        chalk.green(
          `Imported ${imported.length}, updated ${updated.length}, skipped ${skipped.length}.`
        )
      );

      console.log(chalk.cyan('\nImport report:'));
      if (imported.length) {
        console.log(chalk.green(`  Imported: ${imported.join(', ')}`));
      }
      if (updated.length) {
        console.log(chalk.yellow(`  Updated: ${updated.join(', ')}`));
      }
      if (skipped.length) {
        console.log(chalk.gray(`  Skipped: ${skipped.join(', ')}`));
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
