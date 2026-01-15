import inquirer from 'inquirer';
import chalk from 'chalk';
import { getSecret, setSecret, checkOpCli, itemExists, getItemFields } from '../utils/op.js';
import {
  applyColorConfig,
  createSpinner,
  isInteractiveInput,
  resolveBooleanOption,
  resolveField,
  resolveVault,
} from '../utils/cli.js';
import { OpError } from '../utils/types.js';

export interface GetOptions {
  vault?: string;
  field?: string;
  silent?: boolean;
  plain?: boolean;
  json?: boolean;
  input?: boolean;
  quiet?: boolean;
  color?: boolean;
}

export interface GetDependencies {
  getSecret: typeof getSecret;
  setSecret: typeof setSecret;
  checkOpCli: typeof checkOpCli;
  itemExists: typeof itemExists;
  getItemFields: typeof getItemFields;
  prompt: typeof inquirer.prompt;
  applyColorConfig: typeof applyColorConfig;
  createSpinner: typeof createSpinner;
  isInteractiveInput: typeof isInteractiveInput;
  resolveBooleanOption: typeof resolveBooleanOption;
  resolveField: typeof resolveField;
  resolveVault: typeof resolveVault;
}

const defaultDependencies: GetDependencies = {
  getSecret,
  setSecret,
  checkOpCli,
  itemExists,
  getItemFields,
  prompt: inquirer.prompt,
  applyColorConfig,
  createSpinner,
  isInteractiveInput,
  resolveBooleanOption,
  resolveField,
  resolveVault,
};

export function createGetCommand(
  overrides: Partial<GetDependencies> = {}
): (name: string, options: GetOptions) => Promise<void> {
  const deps = { ...defaultDependencies, ...overrides };

  return async function getCommand(
    name: string,
    options: GetOptions
  ): Promise<void> {
    try {
      // Validate name is not empty
      if (!name || name.trim().length === 0) {
        throw new OpError('Secret name cannot be empty.', 2);
      }

      deps.checkOpCli();

      if (options.json && (options.plain || options.silent)) {
        throw new OpError('Use either --json or --plain/--silent, not both.', 2);
      }

      const vault = deps.resolveVault(options.vault);
      const field = deps.resolveField(options.field);
      const envQuiet = deps.resolveBooleanOption(undefined, 'OPS_QUIET');
      const quiet = options.quiet === true || envQuiet;
      const envNoInput = deps.resolveBooleanOption(undefined, 'OPS_NO_INPUT');
      const envNoColor = deps.resolveBooleanOption(undefined, 'OPS_NO_COLOR');
      const outputMode = options.json
        ? 'json'
        : options.plain || options.silent
        ? 'plain'
        : 'human';
      const noInput = options.input === false || envNoInput || outputMode !== 'human';
      const noColor = options.color === false || envNoColor;

      deps.applyColorConfig(noColor);

      const quietSpinner = quiet || outputMode !== 'human';
      const spinner = deps.createSpinner('Fetching secret from 1Password...', quietSpinner);

      const secret = deps.getSecret(name, vault, field);

      if (secret !== null) {
        if (!quietSpinner) {
          spinner.succeed(chalk.green('Secret retrieved!'));
        }

        if (outputMode === 'json') {
          console.log(JSON.stringify({ name, vault, field, value: secret }, null, 2));
          return;
        }

        if (outputMode === 'plain') {
          console.log(secret);
          return;
        }

        if (!quiet) {
          console.log(chalk.cyan('\nSecret value:'));
        }
        console.log(chalk.white(secret));
        return;
      }

      // Determine if item exists but field is wrong, or item doesn't exist at all
      const exists = deps.itemExists(name, vault);

      if (exists) {
        // Item exists but field not found - suggest available fields
        const fields = deps.getItemFields(name, vault);
        if (!quietSpinner) {
          spinner.fail(chalk.yellow(`Field "${field}" not found on item "${name}"`));
        }

        let errorMessage = `Field "${field}" not found.`;
        if (fields.length > 0) {
          errorMessage += ` Available fields: ${fields.join(', ')}`;
          errorMessage += `\nTry: ops get "${name}" --field ${fields[0]}`;
        } else {
          errorMessage += ` Use: ops inspect "${name}" to see available fields.`;
        }
        throw new OpError(errorMessage, 1);
      }

      if (!quietSpinner) {
        spinner.fail(chalk.yellow(`Secret "${name}" not found in vault "${vault}"`));
      }

      const canPrompt = !noInput && deps.isInteractiveInput();

      if (!canPrompt) {
        throw new OpError('Secret not found. Use ops set to create it.', 1);
      }

      const answers = await deps.prompt([
        {
          type: 'confirm',
          name: 'create',
          message: 'Would you like to create this secret now?',
          default: true,
        },
      ]);

      if (!answers.create) {
        console.log(chalk.gray('Operation cancelled.'));
        return;
      }

      const valueAnswer = await deps.prompt([
        {
          type: 'password',
          name: 'value',
          message: 'Enter secret value:',
          mask: '*',
          validate: (input: string) =>
            input.length > 0 || 'Secret value cannot be empty',
        },
      ]);

      const storeSpinner = deps.createSpinner('Storing secret in 1Password...', quietSpinner);
      deps.setSecret(name, valueAnswer.value, vault, field);
      if (!quietSpinner) {
        storeSpinner.succeed(chalk.green('Secret stored successfully!'));
      }

      if (!quiet) {
        console.log(chalk.cyan('\nYou can retrieve it anytime with:'));
        console.log(chalk.white(`  ops get ${name}`));
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

export const getCommand = createGetCommand();
