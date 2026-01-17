import chalk from 'chalk';
import {
  getSecret,
  checkOpCli,
  getItem,
  getDefaultFieldForCategory,
} from '../utils/op.js';
import {
  applyColorConfig,
  createSpinner,
  resolveBooleanOption,
  resolveField,
  resolveVault,
} from '../utils/cli.js';
import { OpError } from '../utils/types.js';

export interface GetManyOptions {
  vault?: string;
  field?: string;
  json?: boolean;
  env?: boolean;
  plain?: boolean;
  quiet?: boolean;
  color?: boolean;
  parallel?: number;
  continueOnError?: boolean;
}

export interface GetManyDependencies {
  getSecret: typeof getSecret;
  checkOpCli: typeof checkOpCli;
  getItem: typeof getItem;
  getDefaultFieldForCategory: typeof getDefaultFieldForCategory;
  applyColorConfig: typeof applyColorConfig;
  createSpinner: typeof createSpinner;
  resolveBooleanOption: typeof resolveBooleanOption;
  resolveField: typeof resolveField;
  resolveVault: typeof resolveVault;
}

const defaultDependencies: GetManyDependencies = {
  getSecret,
  checkOpCli,
  getItem,
  getDefaultFieldForCategory,
  applyColorConfig,
  createSpinner,
  resolveBooleanOption,
  resolveField,
  resolveVault,
};

interface SecretResult {
  name: string;
  value: string | null;
  error?: string;
}

/**
 * Fetch a single secret with smart field detection
 */
function fetchSecret(
  name: string,
  vault: string,
  defaultField: string,
  deps: GetManyDependencies
): SecretResult {
  try {
    // Smart field detection: check item category
    let field = defaultField;
    const item = deps.getItem(name, vault);
    if (item?.category) {
      field = deps.getDefaultFieldForCategory(item.category);
    }

    const value = deps.getSecret(name, vault, field);
    return { name, value };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { name, value: null, error: message };
  }
}

/**
 * Fetch multiple secrets in parallel with concurrency limit
 */
async function fetchSecretsParallel(
  names: string[],
  vault: string,
  field: string,
  parallelism: number,
  deps: GetManyDependencies
): Promise<SecretResult[]> {
  const results: SecretResult[] = [];
  const chunks: string[][] = [];

  // Split names into chunks for controlled parallelism
  for (let i = 0; i < names.length; i += parallelism) {
    chunks.push(names.slice(i, i + parallelism));
  }

  for (const chunk of chunks) {
    const chunkResults = await Promise.all(
      chunk.map((name) =>
        Promise.resolve(fetchSecret(name, vault, field, deps))
      )
    );
    results.push(...chunkResults);
  }

  return results;
}

export function createGetManyCommand(
  overrides: Partial<GetManyDependencies> = {}
): (names: string[], options: GetManyOptions) => Promise<void> {
  const deps = { ...defaultDependencies, ...overrides };

  return async function getManyCommand(
    names: string[],
    options: GetManyOptions
  ): Promise<void> {
    try {
      // Validate at least one name provided
      if (!names || names.length === 0) {
        throw new OpError('At least one secret name is required.', 2);
      }

      deps.checkOpCli();

      // Validate output format options
      const outputFormats = [options.json, options.env, options.plain].filter(Boolean);
      if (outputFormats.length > 1) {
        throw new OpError('Use only one of --json, --env, or --plain.', 2);
      }

      const vault = deps.resolveVault(options.vault);
      const field = deps.resolveField(options.field);
      const parallelism = options.parallel ?? 5;
      const continueOnError = options.continueOnError ?? false;

      const envQuiet = deps.resolveBooleanOption(undefined, 'OPS_QUIET');
      const quiet = options.quiet === true || envQuiet;
      const envNoColor = deps.resolveBooleanOption(undefined, 'OPS_NO_COLOR');
      const noColor = options.color === false || envNoColor;

      deps.applyColorConfig(noColor);

      const outputMode = options.json
        ? 'json'
        : options.env
        ? 'env'
        : options.plain
        ? 'plain'
        : 'human';

      const quietSpinner = quiet || outputMode !== 'human';
      const spinner = deps.createSpinner(
        `Fetching ${names.length} secret${names.length > 1 ? 's' : ''} from 1Password...`,
        quietSpinner
      );

      // Fetch all secrets in parallel
      const results = await fetchSecretsParallel(
        names,
        vault,
        field,
        parallelism,
        deps
      );

      // Check for errors
      const failures = results.filter((r) => r.value === null);
      const successes = results.filter((r) => r.value !== null);

      if (failures.length > 0 && !continueOnError) {
        if (!quietSpinner) {
          spinner.fail(
            chalk.yellow(
              `Failed to retrieve ${failures.length} of ${names.length} secrets`
            )
          );
        }

        // Show which ones failed
        for (const failure of failures) {
          console.error(
            chalk.red(`  ✗ ${failure.name}: ${failure.error || 'not found'}`)
          );
        }

        throw new OpError(
          `Failed to retrieve ${failures.length} secret(s). Use --continue-on-error to skip failures.`,
          1
        );
      }

      if (!quietSpinner) {
        if (failures.length > 0) {
          spinner.warn(
            chalk.yellow(
              `Retrieved ${successes.length} of ${names.length} secrets (${failures.length} failed)`
            )
          );
        } else {
          spinner.succeed(
            chalk.green(`Retrieved ${successes.length} secret${successes.length > 1 ? 's' : ''}!`)
          );
        }
      }

      // Output based on format
      if (outputMode === 'json') {
        const output: Record<string, string | null> = {};
        for (const result of results) {
          output[result.name] = result.value;
        }
        console.log(JSON.stringify(output, null, 2));
        return;
      }

      if (outputMode === 'env') {
        for (const result of results) {
          if (result.value !== null) {
            // Escape special characters for shell
            const escaped = result.value
              .replace(/\\/g, '\\\\')
              .replace(/"/g, '\\"')
              .replace(/\$/g, '\\$')
              .replace(/`/g, '\\`');
            console.log(`${result.name}="${escaped}"`);
          }
        }
        return;
      }

      if (outputMode === 'plain') {
        for (const result of results) {
          console.log(result.value ?? '');
        }
        return;
      }

      // Human-readable output
      if (!quiet) {
        console.log(chalk.cyan('\nSecrets:'));
      }
      for (const result of results) {
        if (result.value !== null) {
          console.log(chalk.white(`  ${result.name}: ${result.value}`));
        } else {
          console.log(chalk.red(`  ${result.name}: (not found)`));
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

export const getManyCommand = createGetManyCommand();
