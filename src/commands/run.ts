import { readFileSync, existsSync } from 'fs';
import chalk from 'chalk';
import spawn from 'cross-spawn';
import dotenv from 'dotenv';
import { checkOpCli, getSecret } from '../utils/op.js';
import { OpError } from '../utils/types.js';

export interface RunOptions {
  vault?: string;
  field?: string;
  env?: string[];
  envFile?: string;
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
  readFileSync: typeof readFileSync;
  existsSync: typeof existsSync;
  parseEnv: (content: string) => Record<string, string>;
  spawn: typeof spawn;
  process: ProcessLike;
}

const DEFAULT_ENV_FILE = '.env.ops';

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

function loadEnvFile(
  path: string,
  deps: RunDependencies
): Record<string, string> {
  if (!deps.existsSync(path)) {
    return {};
  }

  const content = deps.readFileSync(path, 'utf-8');
  try {
    return deps.parseEnv(content);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unable to parse env file.';
    throw new OpError(`Failed to parse "${path}": ${message}`, 2);
  }
}

const defaultDependencies: RunDependencies = {
  getSecret,
  checkOpCli,
  readFileSync,
  existsSync,
  parseEnv: (content: string) => dotenv.parse(content),
  spawn,
  process,
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
      deps.checkOpCli();

      if (!command || command.length === 0) {
        throw new OpError('Command required. Usage: ops run -- <command>', 2);
      }

      const vault = options.vault || 'Private';
      const field = options.field || 'password';

      const envFile = options.envFile || DEFAULT_ENV_FILE;
      const fileMapping = loadEnvFile(envFile, deps);
      const flagMapping = parseEnvPairs(options.env);
      const mapping = { ...fileMapping, ...flagMapping };

      if (Object.keys(mapping).length === 0) {
        throw new OpError(
          `No secrets configured. Add entries to ${envFile} or pass --env KEY=SECRET.`,
          2
        );
      }

      const resolvedEntries = await Promise.all(
        Object.entries(mapping).map(async ([key, reference]) => {
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
