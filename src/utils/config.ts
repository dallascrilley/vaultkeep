import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import { OpError } from './types.js';

export interface OpsConfig {
  vault?: string;
  field?: string;
  envFile?: string;
  parallel?: number;
  sessionCache?: {
    enabled?: boolean;
    path?: string;
  };
}

interface ConfigDependencies {
  existsSync: typeof existsSync;
  readFileSync: typeof readFileSync;
  homedir: typeof homedir;
  cwd: () => string;
  parseYaml: typeof parseYaml;
}

const defaultDeps: ConfigDependencies = {
  existsSync,
  readFileSync,
  homedir,
  cwd: () => process.cwd(),
  parseYaml,
};

const defaultCache: { value?: OpsConfig } = {};

function mergeConfig(base: OpsConfig, override: OpsConfig): OpsConfig {
  return {
    ...base,
    ...override,
    sessionCache: {
      ...base.sessionCache,
      ...override.sessionCache,
    },
  };
}

function parseConfigContent(
  content: string,
  path: string,
  deps: ConfigDependencies
): OpsConfig {
  let parsed: unknown;

  const lowerPath = path.toLowerCase();
  if (lowerPath.endsWith('.json')) {
    parsed = JSON.parse(content);
  } else {
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = deps.parseYaml(content);
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new OpError(`Invalid config in "${path}": expected an object.`, 2);
  }

  return parsed as OpsConfig;
}

function loadFirstConfig(
  paths: string[],
  deps: ConfigDependencies
): OpsConfig {
  for (const path of paths) {
    if (!deps.existsSync(path)) continue;
    const content = deps.readFileSync(path, 'utf-8');
    try {
      return parseConfigContent(content, path, deps);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to parse config file.';
      throw new OpError(message, 2);
    }
  }

  return {};
}

function loadConfigInternal(
  overrides: Partial<ConfigDependencies>,
  cache: { value?: OpsConfig }
): OpsConfig {
  if (cache.value) return cache.value;

  const deps: ConfigDependencies = { ...defaultDeps, ...overrides };
  const explicitPath = process.env.OPS_CONFIG;

  if (explicitPath) {
    if (!deps.existsSync(explicitPath)) {
      throw new OpError(`Config file not found: ${explicitPath}`, 2);
    }

    const content = deps.readFileSync(explicitPath, 'utf-8');
    const config = parseConfigContent(content, explicitPath, deps);
    cache.value = config;
    return config;
  }

  const homeDir = deps.homedir();
  const cwd = deps.cwd();

  const homePaths = [
    join(homeDir, '.opsrc'),
    join(homeDir, '.opsrc.json'),
    join(homeDir, '.opsrc.yaml'),
    join(homeDir, '.opsrc.yml'),
  ];

  const localPaths = [
    join(cwd, '.opsrc'),
    join(cwd, '.opsrc.json'),
    join(cwd, '.opsrc.yaml'),
    join(cwd, '.opsrc.yml'),
  ];

  const homeConfig = loadFirstConfig(homePaths, deps);
  const localConfig = loadFirstConfig(localPaths, deps);

  cache.value = mergeConfig(homeConfig, localConfig);
  return cache.value;
}

export function loadConfig(overrides: Partial<ConfigDependencies> = {}): OpsConfig {
  return loadConfigInternal(overrides, defaultCache);
}

export function clearConfigCache(): void {
  defaultCache.value = undefined;
}

export function createConfigLoader(
  overrides: Partial<ConfigDependencies> = {}
): () => OpsConfig {
  const cache: { value?: OpsConfig } = {};
  return () => loadConfigInternal(overrides, cache);
}
