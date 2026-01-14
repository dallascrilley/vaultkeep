import inquirer from 'inquirer';
import chalk from 'chalk';
import { getSecret, setSecret, checkOpCli } from '../utils/op.js';
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

export async function getCommand(
  name: string,
  options: GetOptions
): Promise<void> {
  try {
    checkOpCli();

    if (options.json && (options.plain || options.silent)) {
      throw new OpError('Use either --json or --plain/--silent, not both.', 2);
    }

    const vault = resolveVault(options.vault);
    const field = resolveField(options.field);
    const envQuiet = resolveBooleanOption(undefined, 'OPS_QUIET');
    const quiet = options.quiet === true || envQuiet;
    const envNoInput = resolveBooleanOption(undefined, 'OPS_NO_INPUT');
    const envNoColor = resolveBooleanOption(undefined, 'OPS_NO_COLOR');
    const outputMode = options.json
      ? 'json'
      : options.plain || options.silent
      ? 'plain'
      : 'human';
    const noInput = options.input === false || envNoInput || outputMode !== 'human';
    const noColor = options.color === false || envNoColor;

    applyColorConfig(noColor);

    const quietSpinner = quiet || outputMode !== 'human';
    const spinner = createSpinner('Fetching secret from 1Password...', quietSpinner);

    // Try to get the secret
    const secret = getSecret(name, vault, field);

    if (secret) {
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

    // Secret not found - offer to create it
    if (!quietSpinner) {
      spinner.fail(chalk.yellow(`Secret "${name}" not found in vault "${vault}"`));
    }

    const canPrompt = !noInput && isInteractiveInput();

    if (!canPrompt) {
      throw new OpError('Secret not found. Use ops set to create it.', 1);
    }

    const answers = await inquirer.prompt([
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

    // Prompt for secret value
    const valueAnswer = await inquirer.prompt([
      {
        type: 'password',
        name: 'value',
        message: 'Enter secret value:',
        mask: '*',
        validate: (input: string) =>
          input.length > 0 || 'Secret value cannot be empty',
      },
    ]);

    // Store the secret
    const storeSpinner = createSpinner('Storing secret in 1Password...', quietSpinner);
    setSecret(name, valueAnswer.value, vault, field);
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
}
