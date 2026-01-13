import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { setSecret, getSecret, checkOpCli } from '../utils/op.js';
import { OpError } from '../utils/types.js';

export interface SetOptions {
  vault?: string;
  field?: string;
  value?: string;
}

export async function setCommand(
  name: string,
  options: SetOptions
): Promise<void> {
  try {
    checkOpCli();

    const vault = options.vault || 'Private';
    const field = options.field || 'password';

    // Check if secret already exists
    const existing = getSecret(name, vault, field);

    if (existing) {
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

    // Get value from option or prompt
    let value = options.value;

    if (!value) {
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
    const spinner = ora('Storing secret in 1Password...').start();
    setSecret(name, value!, vault, field);
    spinner.succeed(chalk.green('Secret stored successfully!'));

    console.log(chalk.cyan('\nRetrieve it with:'));
    console.log(chalk.white(`  ops get ${name}`));
  } catch (error) {
    if (error instanceof OpError) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(error.exitCode);
    }
    throw error;
  }
}
