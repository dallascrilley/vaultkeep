import inquirer from 'inquirer';
import chalk from 'chalk';
import { setSecret, getSecret, checkOpCli } from '../utils/op.js';
import {
  applyColorConfig,
  createSpinner,
  isInteractiveInput,
  resolveBooleanOption,
  resolveField,
  resolveVault,
} from '../utils/cli.js';
import { readValueFromInput } from '../utils/io.js';
import { OpError } from '../utils/types.js';

export interface SetOptions {
  vault?: string;
  field?: string;
  value?: string;
  valueFile?: string;
  force?: boolean;
  input?: boolean;
  quiet?: boolean;
  color?: boolean;
}

export async function setCommand(
  name: string,
  options: SetOptions
): Promise<void> {
  try {
    checkOpCli();

    if (options.value && options.valueFile) {
      throw new OpError('Use either --value or --value-file, not both.', 2);
    }

    const vault = resolveVault(options.vault);
    const field = resolveField(options.field);
    const envQuiet = resolveBooleanOption(undefined, 'OPS_QUIET');
    const quiet = options.quiet === true || envQuiet;
    const envNoInput = resolveBooleanOption(undefined, 'OPS_NO_INPUT');
    const envNoColor = resolveBooleanOption(undefined, 'OPS_NO_COLOR');
    const noInput = options.input === false || envNoInput;
    const noColor = options.color === false || envNoColor;
    const canPrompt = !noInput && isInteractiveInput();

    applyColorConfig(noColor);

    // Check if secret already exists
    const existing = getSecret(name, vault, field);

    if (existing && !options.force) {
      if (!canPrompt) {
        throw new OpError('Secret already exists. Use --force to overwrite.', 2);
      }

      const confirm = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'overwrite',
          message: chalk.yellow(
            `Secret "${name}" already exists. Overwrite it?`
          ),
          default: false,
        },
      ]);

      if (!confirm.overwrite) {
        console.log(chalk.gray('Operation cancelled.'));
        return;
      }
    }

    // Get value from option, file, stdin, or prompt
    let value = options.value;

    if (options.valueFile) {
      value = readValueFromInput(options.valueFile);
    } else if (value === '-') {
      value = readValueFromInput('-');
    }

    if (!value) {
      if (!canPrompt) {
        throw new OpError('Secret value required. Use --value or --value-file.', 2);
      }
      const answer = await inquirer.prompt([
        {
          type: 'password',
          name: 'value',
          message: 'Enter secret value:',
          mask: '*',
          validate: (input: string) =>
            input.length > 0 || 'Secret value cannot be empty',
        },
      ]);
      value = answer.value;
    }

    // Store the secret
    const spinner = createSpinner('Storing secret in 1Password...', quiet);
    setSecret(name, value!, vault, field);
    spinner.succeed(chalk.green('Secret stored successfully!'));

    if (!quiet) {
      console.log(chalk.cyan('\nRetrieve it with:'));
      console.log(chalk.white(`  ops get ${name}`));
    }
  } catch (error) {
    if (error instanceof OpError) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(error.exitCode);
    }
    throw error;
  }
}
