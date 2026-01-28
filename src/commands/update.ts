import chalk from 'chalk';
import { execSync, spawn } from 'child_process';
import { createSpinner } from '../utils/cli.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

export interface UpdateOptions {
  check?: boolean;
  force?: boolean;
}

export interface UpdateDependencies {
  getCurrentVersion: () => string;
  getLatestVersion: () => Promise<string>;
  runUpdate: (version: string) => Promise<void>;
  createSpinner: typeof createSpinner;
}

function getCurrentVersion(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const pkgPath = join(__dirname, '..', '..', 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  return pkg.version;
}

async function getLatestVersion(): Promise<string> {
  const result = execSync('npm view dc-ops-cli version', {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return result.trim();
}

async function runUpdate(version: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['install', '-g', `dc-ops-cli@${version}`], {
      stdio: 'inherit',
      shell: true,
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`npm install exited with code ${code}`));
      }
    });

    child.on('error', reject);
  });
}

const defaultDependencies: UpdateDependencies = {
  getCurrentVersion,
  getLatestVersion,
  runUpdate,
  createSpinner,
};

export function createUpdateCommand(deps: UpdateDependencies = defaultDependencies) {
  return async function updateCommand(options: UpdateOptions): Promise<void> {
    const { getCurrentVersion, getLatestVersion, runUpdate, createSpinner } = deps;

    const currentVersion = getCurrentVersion();

    if (options.check) {
      const spinner = createSpinner('Checking for updates...', false);
      try {
        const latestVersion = await getLatestVersion();
        spinner.stop();

        if (currentVersion === latestVersion) {
          console.log(chalk.green(`✓ ops is up to date (v${currentVersion})`));
        } else {
          console.log(chalk.yellow(`Update available: v${currentVersion} → v${latestVersion}`));
          console.log(chalk.dim(`Run ${chalk.cyan('ops update')} to install`));
        }
      } catch (error) {
        spinner.fail('Failed to check for updates');
        throw error;
      }
      return;
    }

    const spinner = createSpinner('Checking for updates...', false);
    let latestVersion: string;

    try {
      latestVersion = await getLatestVersion();
    } catch (error) {
      spinner.fail('Failed to fetch latest version');
      throw error;
    }

    if (currentVersion === latestVersion && !options.force) {
      spinner.succeed(`ops is already up to date (v${currentVersion})`);
      return;
    }

    if (options.force && currentVersion === latestVersion) {
      spinner.text = `Reinstalling v${latestVersion}...`;
    } else {
      spinner.text = `Updating v${currentVersion} → v${latestVersion}...`;
    }
    spinner.stop();

    console.log(chalk.dim(`Installing dc-ops-cli@${latestVersion}...`));

    try {
      await runUpdate(latestVersion);
      console.log(chalk.green(`\n✓ Successfully updated to v${latestVersion}`));
    } catch (error) {
      console.error(chalk.red('\n✗ Update failed'));
      throw error;
    }
  };
}
