import chalk from 'chalk';
import spawn from 'cross-spawn';
import { checkOpCli, getSecret } from '../utils/op.js';
import {
  applyColorConfig,
  resolveBooleanOption,
  resolveField,
  resolveVault,
} from '../utils/cli.js';
import { OpError } from '../utils/types.js';
import { loadEnvMappingFile } from '../utils/env-mapping.js';
import { loadConfig, OpsConfig } from '../utils/config.js';

export interface RunOptions {
  vault?: string;
  field?: string;
  env?: string[];
  envFile?: string;
  color?: boolean;
  verbose?: boolean;
  parallel?: number;
}

export interface ProcessLike {
  env: NodeJS.ProcessEnv;
  on: NodeJS.Process['on'];
  off: NodeJS.Process['off'];
  exitCode?: number | string;
}

export interface RunDependencies {
  getSecret: typeof getSecret;
  checkOpCli: typeof checkOpCli;
  loadEnvMappingFile: typeof loadEnvMappingFile;
  spawn: typeof spawn;
  process: ProcessLike;
  loadConfig: () => OpsConfig;
}

const DEFAULT_ENV_FILE = '.env.ops';
const DEFAULT_PARALLELISM = 5;

function parseEnvPairs(pairs: string[] | undefined): Record<string, string> {
  if (!pairs || pairs.length === 0) return {};

  const mapping: Record<string, string> = {};

  for (const pair of pairs) {
    const separatorIndex = pair.indexOf('=');
    if (separatorIndex <= 0) {
      throw new OpError(
        'Invalid --env format. Use KEY=SECRET (example: --env API_KEY=MY_SECRET).',
        2
      );
    }

    const key = pair.slice(0, separatorIndex).trim();
    const value = pair.slice(separatorIndex + 1).trim();

    if (!key || !value) {
      throw new OpError(
        'Invalid --env format. Use KEY=SECRET (example: --env API_KEY=MY_SECRET).',
        2
      );
    }

    mapping[key] = value;
  }

  return mapping;
}

function resolveParallelism(
  optionValue: number | undefined,
  config: OpsConfig
): number {
  if (typeof optionValue === 'number' && optionValue > 0) return optionValue;

  const envValue = process.env.OPS_PARALLEL;
  if (envValue) {
    const parsed = Number.parseInt(envValue, 10);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }

  if (typeof config.parallel === 'number' && config.parallel > 0) {
    return config.parallel;
  }

  return DEFAULT_PARALLELISM;
}

async function resolveSecrets(
  mapping: Record<string, string>,
  vault: string,
  field: string,
  parallelism: number,
  deps: RunDependencies
): Promise<Array<readonly [string, string]>> {
  const entries = Object.entries(mapping);
  const results: Array<readonly [string, string]> = [];
  const chunks: Array<Array<[string, string]>> = [];

  for (let i = 0; i < entries.length; i += parallelism) {
    chunks.push(entries.slice(i, i + parallelism) as Array<[string, string]>);
  }

  for (const chunk of chunks) {
    const chunkResults = await Promise.all(
      chunk.map(async ([key, reference]) => {
        const secret = await Promise.resolve(
          deps.getSecret(reference, vault, field)
        );
        if (secret === null) {
          throw new OpError(
            `Secret "${reference}" not found in vault "${vault}"`,
            1
          );
        }
        return [key, secret] as const;
      })
    );
    results.push(...chunkResults);
  }

  return results;
}

const defaultDependencies: RunDependencies = {
  getSecret,
  checkOpCli,
  loadEnvMappingFile,
  spawn,
  process,
  loadConfig,
};

export function createRunCommand(
  overrides: Partial<RunDependencies> = {}
): (command: string[], options: RunOptions) => Promise<void> {
  const deps = { ...defaultDependencies, ...overrides };

  return async function runCommand(
    command: string[],
    options: RunOptions
  ): Promise<void> {
    try {
      const envNoColor = resolveBooleanOption(undefined, 'OPS_NO_COLOR');
      const noColor = options.color === false || envNoColor;
      applyColorConfig(noColor);

      deps.checkOpCli();

      if (!command || command.length === 0) {
        throw new OpError('Command required. Usage: ops run -- <command>', 2);
      }

      const config = deps.loadConfig();
      const vault = resolveVault(options.vault);
      const field = resolveField(options.field);
      const parallelism = resolveParallelism(options.parallel, config);

      const envFile = options.envFile || config.envFile || DEFAULT_ENV_FILE;
      const fileMapping = deps.loadEnvMappingFile(envFile);
      const flagMapping = parseEnvPairs(options.env);
      const mapping = { ...fileMapping, ...flagMapping };

      if (Object.keys(mapping).length === 0) {
        throw new OpError(
          `No secrets configured. Add entries to ${envFile} or pass --env KEY=SECRET.`,
          2
        );
      }

      const resolvedEntries = await resolveSecrets(
        mapping,
        vault,
        field,
        parallelism,
        deps
      );

      if (options.verbose) {
        console.log(chalk.cyan('[ops] Injecting environment variables:'));
        for (const [key] of resolvedEntries) {
          console.log(chalk.gray(`  ${key} <- (secret value hidden)`));
        }
        console.log(chalk.cyan(`[ops] Running: ${command.join(' ')}`));
      }

      const injectedEnv = Object.fromEntries(resolvedEntries);
      const child = deps.spawn(command[0], command.slice(1), {
        stdio: 'inherit',
        env: {
          ...deps.process.env,
          ...injectedEnv,
        },
      });

      const forwardSignal = (signal: NodeJS.Signals) => {
        if (child.pid) {
          child.kill(signal);
        }
      };

      deps.process.on('SIGINT', forwardSignal);
      deps.process.on('SIGTERM', forwardSignal);

      await new Promise<void>((resolve, reject) => {
        child.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
          deps.process.off('SIGINT', forwardSignal);
          deps.process.off('SIGTERM', forwardSignal);

          if (code !== null) {
            deps.process.exitCode = code;
          } else if (signal) {
            deps.process.exitCode = 1;
          }

          resolve();
        });

        child.on('error', (error: Error) => {
          deps.process.off('SIGINT', forwardSignal);
          deps.process.off('SIGTERM', forwardSignal);
          reject(new OpError(`Failed to start command: ${error.message}`, 1));
        });
      });
    } catch (error) {
      if (error instanceof OpError) {
        console.error(chalk.red(`Error: ${error.message}`));
        process.exit(error.exitCode);
      }
      throw error;
    }
  };
}

export const runCommand = createRunCommand();
