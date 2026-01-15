import chalk from 'chalk';
import { getItem, checkOpCli } from '../utils/op.js';
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
  applyColorConfig: typeof applyColorConfig;
  createSpinner: typeof createSpinner;
  resolveBooleanOption: typeof resolveBooleanOption;
  resolveVault: typeof resolveVault;
  log: (message: string) => void;
}

const defaultDependencies: InspectDependencies = {
  getItem,
  checkOpCli,
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
        throw new OpError(`Item not found. Use ops list to see available items.`, 1);
      }

      spinner.stop();

      if (options.json) {
        deps.log(JSON.stringify({
          title: item.title,
          vault: item.vault || vault,
          category: item.category,
          fields: item.fields?.map((f) => ({
            label: f.label,
            type: f.type,
            id: f.id,
          })) || [],
        }, null, 2));
        return;
      }

      deps.log(chalk.cyan(`\nItem: ${chalk.white(item.title)}`));
      deps.log(chalk.cyan(`Vault: ${chalk.white(item.vault || vault)}`));
      deps.log(chalk.cyan(`Category: ${chalk.white(item.category)}`));
      deps.log(chalk.cyan('\nFields:'));

      if (!item.fields || item.fields.length === 0) {
        deps.log(chalk.gray('  (no fields)'));
        return;
      }

      for (const field of item.fields) {
        if (field.label) {
          deps.log(chalk.white(`  - ${field.label} ${chalk.gray(`(${field.type})`)}`));
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

export const inspectCommand = createInspectCommand();
