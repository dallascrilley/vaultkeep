import inquirer from 'inquirer';
import chalk from 'chalk';
import { getSecret, setSecret, checkOpCli, itemExists, getItemFields, findSimilarItems, getItem, getDefaultFieldForCategory } from '../utils/op.js';
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
  findSimilarItems: typeof findSimilarItems;
  getItem: typeof getItem;
  getDefaultFieldForCategory: typeof getDefaultFieldForCategory;
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
  findSimilarItems,
  getItem,
  getDefaultFieldForCategory,
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

      // Parse KEY=fallback format if provided
      let actualName = name;
      let fallbackValue: string | undefined;
      const eqIndex = name.indexOf('=');
      if (eqIndex > 0) {
        actualName = name.substring(0, eqIndex);
        fallbackValue = name.substring(eqIndex + 1);
      }

      deps.checkOpCli();

      if (options.json && (options.plain || options.silent)) {
        throw new OpError('Use either --json or --plain/--silent, not both.', 2);
      }

      const vault = deps.resolveVault(options.vault);
      
      // Cache item data to avoid redundant CLI calls
      // This single call is reused for field detection AND secret retrieval
      const cachedItem = deps.getItem(actualName, vault);
      
      // Smart field detection: if no field specified, try to detect from item category
      let field: string;
      if (options.field) {
        field = deps.resolveField(options.field);
      } else {
        if (cachedItem?.category) {
          field = deps.getDefaultFieldForCategory(cachedItem.category);
        } else {
          field = deps.resolveField(undefined);
        }
      }
      
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

      // Try to extract secret from cached item first (avoids second CLI call)
      let secret: string | null = null;
      if (cachedItem?.fields) {
        const fieldData = cachedItem.fields.find(
          (f) => f.label === field || f.id === field
        );
        if (fieldData?.value) {
          secret = fieldData.value;
        }
      }
      
      // Fallback to getSecret only if field not found in cached item
      if (secret === null && cachedItem) {
        // Use cached item ID to avoid redundant getItemId call for special chars
        const itemRef = cachedItem.id || actualName;
        secret = deps.getSecret(itemRef, vault, field);
      } else if (secret === null) {
        // Item doesn't exist, getSecret will return null
        secret = deps.getSecret(actualName, vault, field);
      }

      if (secret !== null) {
        if (!quietSpinner) {
          spinner.succeed(chalk.green('Secret retrieved!'));
        }

        if (outputMode === 'json') {
          console.log(JSON.stringify({ name: actualName, vault, field, value: secret }, null, 2));
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

      // If secret not found but fallback value provided, use it
      if (fallbackValue !== undefined) {
        if (!quietSpinner) {
          spinner.succeed(chalk.yellow('Using fallback value'));
        }

        if (outputMode === 'json') {
          console.log(JSON.stringify({ name: actualName, vault, field, value: fallbackValue, fallback: true }, null, 2));
          return;
        }

        if (outputMode === 'plain') {
          console.log(fallbackValue);
          return;
        }

        if (!quiet) {
          console.log(chalk.cyan('\nFallback value:'));
        }
        console.log(chalk.white(fallbackValue));
        return;
      }

      // Use cached item to determine if item exists (avoids redundant CLI call)
      if (cachedItem) {
        // Item exists but field not found - suggest available fields from cached data
        const fields = cachedItem.fields
          ?.filter((f) => f.label && f.label.length > 0)
          .map((f) => f.label) || [];
        if (!quietSpinner) {
          spinner.fail(chalk.yellow(`Field "${field}" not found on item "${actualName}"`));
        }

        let errorMessage = `Field "${field}" not found.`;
        if (fields.length > 0) {
          errorMessage += ` Available fields: ${fields.join(', ')}`;
          errorMessage += `\nTry: ops get "${actualName}" --field ${fields[0]}`;
        } else {
          errorMessage += ` Use: ops inspect "${actualName}" to see available fields.`;
        }
        throw new OpError(errorMessage, 1);
      }

      if (!quietSpinner) {
        spinner.fail(chalk.yellow(`Secret "${actualName}" not found in vault "${vault}"`));
      }

      // Suggest similar names
      const similar = deps.findSimilarItems(actualName, vault);
      if (similar.length > 0 && !noInput) {
        console.log(chalk.cyan('\nDid you mean?'));
        for (const suggestion of similar) {
          console.log(chalk.white(`  - ${suggestion}`));
        }
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
      deps.setSecret(actualName, valueAnswer.value, vault, field);
      if (!quietSpinner) {
        storeSpinner.succeed(chalk.green('Secret stored successfully!'));
      }

      if (!quiet) {
        console.log(chalk.cyan('\nYou can retrieve it anytime with:'));
        console.log(chalk.white(`  ops get ${actualName}`));
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