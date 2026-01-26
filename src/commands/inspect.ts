import chalk from 'chalk';
import { getItem, checkOpCli, findSimilarItems, getNonEmptyFields } from '../utils/op.js';
import {
  applyColorConfig,
  createSpinner,
  resolveBooleanOption,
  resolveVault,
} from '../utils/cli.js';
import { OpError } from '../utils/types.js';

export interface InspectOptions {
  vault?: string;
  json?: boolean;
  quiet?: boolean;
  color?: boolean;
}

export interface InspectDependencies {
  getItem: typeof getItem;
  checkOpCli: typeof checkOpCli;
  findSimilarItems: typeof findSimilarItems;
  getNonEmptyFields: typeof getNonEmptyFields;
  applyColorConfig: typeof applyColorConfig;
  createSpinner: typeof createSpinner;
  resolveBooleanOption: typeof resolveBooleanOption;
  resolveVault: typeof resolveVault;
  log: (message: string) => void;
}

const defaultDependencies: InspectDependencies = {
  getItem,
  checkOpCli,
  findSimilarItems,
  getNonEmptyFields,
  applyColorConfig,
  createSpinner,
  resolveBooleanOption,
  resolveVault,
  log: console.log,
};

export function createInspectCommand(
  overrides: Partial<InspectDependencies> = {}
): (name: string, options: InspectOptions) => Promise<void> {
  const deps = { ...defaultDependencies, ...overrides };

  return async function inspectCommand(
    name: string,
    options: InspectOptions
  ): Promise<void> {
    try {
      // Validate name is not empty
      if (!name || name.trim().length === 0) {
        throw new OpError('Item name cannot be empty.', 2);
      }

      deps.checkOpCli();

      const vault = deps.resolveVault(options.vault);
      const envQuiet = deps.resolveBooleanOption(undefined, 'OPS_QUIET');
      const quiet = options.quiet === true || envQuiet;
      const envNoColor = deps.resolveBooleanOption(undefined, 'OPS_NO_COLOR');
      const noColor = options.color === false || envNoColor;

      deps.applyColorConfig(noColor);

      const spinner = deps.createSpinner(`Inspecting "${name}"...`, quiet);

      const item = deps.getItem(name, vault);

      if (!item) {
        spinner.fail(chalk.yellow(`Item "${name}" not found in vault "${vault}"`));

        // Suggest similar items
        const similar = deps.findSimilarItems(name, vault);
        if (similar.length > 0) {
          deps.log(chalk.cyan('\nDid you mean?'));
          for (const suggestion of similar) {
            deps.log(chalk.white(`  - ${suggestion}`));
          }
        }

        throw new OpError(`Item not found. Use ops list to see available items.`, 1);
      }

      spinner.succeed(chalk.green(`Found item "${name}"`));

      const fieldsWithValues = deps.getNonEmptyFields(item.fields);

      if (options.json) {
        deps.log(JSON.stringify({
          title: item.title,
          vault: item.vault || vault,
          category: item.category,
          fields: fieldsWithValues.map((f) => ({
            label: f.label,
            type: f.type,
            id: f.id,
            value: f.value,
          })) || [],
        }, null, 2));
        return;
      }

      deps.log(chalk.cyan(`\nItem: ${chalk.white(item.title)}`));
      deps.log(chalk.cyan(`Vault: ${chalk.white(item.vault || vault)}`));
      deps.log(chalk.cyan(`Category: ${chalk.white(item.category)}`));
      deps.log(chalk.cyan('\nFields:'));

      if (fieldsWithValues.length === 0) {
        deps.log(chalk.gray('  (no fields)'));
        return;
      }

      for (const field of fieldsWithValues) {
        const label = field.label || field.id || 'field';
        deps.log(chalk.white(`  - ${label}: ${field.value} ${chalk.gray(`(${field.type})`)}`));
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

export const inspectCommand = createInspectCommand();
