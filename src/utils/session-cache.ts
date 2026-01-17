import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { loadConfig, OpsConfig } from './config.js';

interface SessionCacheFile {
  sessions?: Record<string, string>;
  updatedAt?: string;
}

interface SessionCacheDependencies {
  existsSync: typeof existsSync;
  readFileSync: typeof readFileSync;
  writeFileSync: typeof writeFileSync;
  mkdirSync: typeof mkdirSync;
  homedir: typeof homedir;
  join: typeof join;
  dirname: typeof dirname;
  env: NodeJS.ProcessEnv;
  now: () => string;
  getConfig: () => OpsConfig;
}

const defaultDeps: SessionCacheDependencies = {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  homedir,
  join,
  dirname,
  env: process.env,
  now: () => new Date().toISOString(),
  getConfig: () => loadConfig(),
};

function isCacheEnabled(env: NodeJS.ProcessEnv, config: OpsConfig): boolean {
  if (env.OPS_NO_SESSION_CACHE === '1') return false;
  if (env.OPS_SESSION_CACHE === '0') return false;
  if (env.OPS_SESSION_CACHE === '1') return true;
  if (config.sessionCache?.enabled !== undefined) {
    return config.sessionCache.enabled;
  }
  return true;
}

function getCachePath(config: OpsConfig, deps: SessionCacheDependencies): string {
  if (config.sessionCache?.path) {
    return config.sessionCache.path;
  }
  return deps.join(deps.homedir(), '.config', 'ops-cli', 'session.json');
}

function readCacheFile(path: string, deps: SessionCacheDependencies): SessionCacheFile {
  if (!deps.existsSync(path)) return {};
  const content = deps.readFileSync(path, 'utf-8');
  try {
    return JSON.parse(content) as SessionCacheFile;
  } catch {
    return {};
  }
}

function collectSessions(env: NodeJS.ProcessEnv): Record<string, string> {
  const sessions: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith('OP_SESSION_')) continue;
    if (typeof value !== 'string' || value.length === 0) continue;
    sessions[key] = value;
  }
  return sessions;
}

export function createSessionCache(
  overrides: Partial<SessionCacheDependencies> = {}
): {
  loadSessionCacheIntoEnv: () => void;
  persistSessionCacheFromEnv: () => void;
} {
  const deps: SessionCacheDependencies = { ...defaultDeps, ...overrides };

  function loadSessionCacheIntoEnv(): void {
    const config = deps.getConfig();
    if (!isCacheEnabled(deps.env, config)) return;

    const path = getCachePath(config, deps);
    const cache = readCacheFile(path, deps);
    const sessions = cache.sessions ?? {};

    for (const [key, value] of Object.entries(sessions)) {
      if (deps.env[key]) continue;
      deps.env[key] = value;
    }
  }

  function persistSessionCacheFromEnv(): void {
    const config = deps.getConfig();
    if (!isCacheEnabled(deps.env, config)) return;

    const path = getCachePath(config, deps);
    const existing = readCacheFile(path, deps);
    const merged = {
      ...existing.sessions,
      ...collectSessions(deps.env),
    };

    if (Object.keys(merged).length === 0) {
      return;
    }

    const payload: SessionCacheFile = {
      sessions: merged,
      updatedAt: deps.now(),
    };

    deps.mkdirSync(deps.dirname(path), { recursive: true, mode: 0o700 });
    deps.writeFileSync(path, JSON.stringify(payload, null, 2), { mode: 0o600 });
  }

  return { loadSessionCacheIntoEnv, persistSessionCacheFromEnv };
}

const defaultSessionCache = createSessionCache();

export function loadSessionCacheIntoEnv(): void {
  defaultSessionCache.loadSessionCacheIntoEnv();
}

export function persistSessionCacheFromEnv(): void {
  defaultSessionCache.persistSessionCacheFromEnv();
}
