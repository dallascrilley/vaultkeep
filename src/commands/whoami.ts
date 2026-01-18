import chalk from 'chalk';
import { execFileSync } from 'child_process';
import { checkOpCli, listVaults } from '../utils/op.js';
import {
  applyColorConfig,
  createSpinner,
  resolveBooleanOption,
  resolveVault,
} from '../utils/cli.js';
import { OpError } from '../utils/types.js';

export interface WhoamiOptions {
  json?: boolean;
  quiet?: boolean;
  color?: boolean;
}

interface OpAccount {
  url: string;
  email: string;
  user_uuid: string;
  account_uuid: string;
}

export interface WhoamiDependencies {
  checkOpCli: typeof checkOpCli;
  listVaults: typeof listVaults;
  getAccount: () => OpAccount | null;
  applyColorConfig: typeof applyColorConfig;
  createSpinner: typeof createSpinner;
  resolveBooleanOption: typeof resolveBooleanOption;
  resolveVault: typeof resolveVault;
  log: (message: string) => void;
}

function getAccountInfo(): OpAccount | null {
  try {
    const result = execFileSync('op', ['whoami', '--format', 'json'], {
      encoding: 'utf-8',
      env: process.env,
    });
    return JSON.parse(result.trim());
  } catch {
    return null;
  }
}

const defaultDependencies: WhoamiDependencies = {
  checkOpCli,
  listVaults,
  getAccount: getAccountInfo,
  applyColorConfig,
  createSpinner,
  resolveBooleanOption,
  resolveVault,
  log: console.log,
};

export function createWhoamiCommand(
  overrides: Partial<WhoamiDependencies> = {}
): (options: WhoamiOptions) => Promise<void> {
  const deps = { ...defaultDependencies, ...overrides };

  return async function whoamiCommand(options: WhoamiOptions): Promise<void> {
    try {
      deps.checkOpCli();

      const envQuiet = deps.resolveBooleanOption(undefined, 'OPS_QUIET');
      const quiet = options.quiet === true || envQuiet;
      const envNoColor = deps.resolveBooleanOption(undefined, 'OPS_NO_COLOR');
      const noColor = options.color === false || envNoColor;

      deps.applyColorConfig(noColor);

      const spinner = deps.createSpinner('Checking 1Password session...', quiet || Boolean(options.json));

      const account = deps.getAccount();

      if (!account) {
        spinner.fail(chalk.red('Not signed in'));
        throw new OpError('Not signed in to 1Password. Run "op signin" to authenticate.', 1);
      }

      // Get default vault from env/config
      const defaultVault = deps.resolveVault(undefined);

      // Try to list vaults to verify access
      let vaults: { name: string }[] = [];
      try {
        vaults = deps.listVaults();
      } catch {
        // Ignore - user might have restricted access
      }

      spinner.succeed(chalk.green('Authenticated'));

      if (options.json) {
        const output = {
          account: {
            url: account.url,
            email: account.email,
            user_uuid: account.user_uuid,
            account_uuid: account.account_uuid,
          },
          defaults: {
            vault: defaultVault,
            field: process.env.OPS_FIELD || 'password',
          },
          vaults: vaults.map(v => v.name),
          session: {
            cached: Boolean(process.env.OP_SESSION_CACHE),
          },
        };
        deps.log(JSON.stringify(output, null, 2));
        return;
      }

      deps.log('');
      deps.log(chalk.cyan('1Password Account'));
      deps.log(chalk.gray('─'.repeat(40)));
      deps.log(`  ${chalk.gray('Email:')}    ${chalk.white(account.email)}`);
      deps.log(`  ${chalk.gray('URL:')}      ${chalk.white(account.url)}`);
      deps.log('');
      deps.log(chalk.cyan('Defaults'));
      deps.log(chalk.gray('─'.repeat(40)));
      deps.log(`  ${chalk.gray('Vault:')}    ${chalk.white(defaultVault)}`);
      deps.log(`  ${chalk.gray('Field:')}    ${chalk.white(process.env.OPS_FIELD || 'password')}`);

      if (vaults.length > 0) {
        deps.log('');
        deps.log(chalk.cyan(`Accessible Vaults (${vaults.length})`));
        deps.log(chalk.gray('─'.repeat(40)));
        for (const vault of vaults.slice(0, 10)) {
          deps.log(`  ${chalk.white(vault.name)}`);
        }
        if (vaults.length > 10) {
          deps.log(chalk.gray(`  ... and ${vaults.length - 10} more`));
        }
      }
      deps.log('');
    } catch (error) {
      if (error instanceof OpError) {
        console.error(chalk.red(`Error: ${error.message}`));
        process.exit(error.exitCode);
      }
      throw error;
    }
  };
}

export const whoamiCommand = createWhoamiCommand();
