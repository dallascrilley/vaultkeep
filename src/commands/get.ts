import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { getSecret, setSecret, checkOpCli } from '../utils/op.js';
import { OpError } from '../utils/types.js';

export interface GetOptions {
  vault?: string;
  field?: string;
  store?: boolean;
  silent?: boolean;
}

export async function getCommand(
  name: string,
  options: GetOptions
): Promise<void> {
  try {
    checkOpCli();

    const vault = options.vault || 'Private';
    const field = options.field || 'password';
    const spinner = ora('Fetching secret from 1Password...').start();

    // Try to get the secret
    const secret = getSecret(name, vault, field);

    if (secret) {
      spinner.succeed(chalk.green('Secret retrieved!'));

      if (!options.silent) {
        console.log(chalk.cyan('\nSecret value:'));
        console.log(chalk.white(secret));
      } else {
        // Silent mode: just output the value for piping
        console.log(secret);
      }
      return;
    }

    // Secret not found - offer to create it
    spinner.fail(chalk.yellow(`Secret "${name}" not found in vault "${vault}"`));

    if (options.silent) {
      throw new OpError('Secret not found', 1);
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
    const storeSpinner = ora('Storing secret in 1Password...').start();
    setSecret(name, valueAnswer.value, vault, field);
    storeSpinner.succeed(chalk.green('Secret stored successfully!'));

    console.log(chalk.cyan('\nYou can retrieve it anytime with:'));
    console.log(chalk.white(`  ops get ${name}`));
  } catch (error) {
    if (error instanceof OpError) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(error.exitCode);
    }
    throw error;
  }
}
