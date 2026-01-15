import chalk from 'chalk';
import { listVaults, checkOpCli } from '../utils/op.js';
import type { OpVault } from '../utils/op.js';
import {
  applyColorConfig,
  createSpinner,
  resolveBooleanOption,
} from '../utils/cli.js';
import { OpError } from '../utils/types.js';

export interface VaultsOptions {
  json?: boolean;
  quiet?: boolean;
  color?: boolean;
}

export interface VaultsDependencies {
  listVaults: typeof listVaults;
  checkOpCli: typeof checkOpCli;
  applyColorConfig: typeof applyColorConfig;
  createSpinner: typeof createSpinner;
  resolveBooleanOption: typeof resolveBooleanOption;
  log: (message: string) => void;
}

const defaultDependencies: VaultsDependencies = {
  listVaults,
  checkOpCli,
  applyColorConfig,
  createSpinner,
  resolveBooleanOption,
  log: console.log,
};

export function createVaultsCommand(
  overrides: Partial<VaultsDependencies> = {}
): (options: VaultsOptions) => Promise<void> {
  const deps = { ...defaultDependencies, ...overrides };

  return async function vaultsCommand(options: VaultsOptions): Promise<void> {
    try {
      deps.checkOpCli();

      const envQuiet = deps.resolveBooleanOption(undefined, 'OPS_QUIET');
      const quiet = options.quiet === true || envQuiet;
      const envNoColor = deps.resolveBooleanOption(undefined, 'OPS_NO_COLOR');
      const noColor = options.color === false || envNoColor;

      deps.applyColorConfig(noColor);

      const spinner = deps.createSpinner('Fetching vaults...', quiet || Boolean(options.json));

      const vaults = deps.listVaults();

      spinner.succeed(chalk.green('Vaults loaded'));

      if (options.json) {
        deps.log(JSON.stringify(vaults, null, 2));
        return;
      }

      if (vaults.length === 0) {
        deps.log(chalk.yellow('No vaults found.'));
        return;
      }

      deps.log(chalk.cyan('\nAvailable vaults:\n'));
      deps.log(chalk.gray('  Name                Type'));
      deps.log(chalk.gray('  ─────────────────   ─────────────'));

      for (const vault of vaults) {
        const name = vault.name.padEnd(18);
        const type = vault.type || 'UNKNOWN';
        deps.log(`  ${chalk.white(name)} ${chalk.gray(type)}`);
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

export const vaultsCommand = createVaultsCommand();
