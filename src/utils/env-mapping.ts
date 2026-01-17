import dotenv from 'dotenv';
import Ajv from 'ajv';
import { OpError } from './types.js';
import { existsSync, readFileSync } from 'fs';

const ajv = new Ajv({ allErrors: true, strict: false });

const envMappingSchema = {
  type: 'object',
  additionalProperties: { type: 'string' },
};

const validateMapping = ajv.compile(envMappingSchema);

interface EnvMappingDependencies {
  existsSync: typeof existsSync;
  readFileSync: typeof readFileSync;
  parseEnv: (content: string) => Record<string, string>;
}

const defaultDeps: EnvMappingDependencies = {
  existsSync,
  readFileSync,
  parseEnv: (content: string) => dotenv.parse(content),
};

function formatSchemaErrors(): string {
  if (!validateMapping.errors || validateMapping.errors.length === 0) {
    return 'Invalid env mapping file.';
  }

  const details = validateMapping.errors
    .map((error) => {
      const location = error.instancePath ? error.instancePath : 'root';
      return `${location} ${error.message ?? 'is invalid'}`.trim();
    })
    .join(', ');

  return `Invalid env mapping file: ${details}.`;
}

function assertValidEnvMapping(value: unknown): asserts value is Record<string, string> {
  if (!validateMapping(value)) {
    throw new OpError(formatSchemaErrors(), 2);
  }
}

function parseEnvMappingContent(
  content: string,
  path: string,
  deps: EnvMappingDependencies
): Record<string, string> {
  if (path.toLowerCase().endsWith('.json')) {
    const parsed = JSON.parse(content) as unknown;
    assertValidEnvMapping(parsed);
    return parsed as Record<string, string>;
  }

  const parsed = deps.parseEnv(content) as unknown;
  assertValidEnvMapping(parsed);
  return parsed as Record<string, string>;
}

export function loadEnvMappingFile(
  path: string,
  overrides: Partial<EnvMappingDependencies> = {}
): Record<string, string> {
  const deps: EnvMappingDependencies = { ...defaultDeps, ...overrides };

  if (!deps.existsSync(path)) {
    return {};
  }

  const content = deps.readFileSync(path, 'utf-8');
  try {
    return parseEnvMappingContent(content, path, deps);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to parse env mapping file.';
    throw new OpError(`Failed to parse "${path}": ${message}`, 2);
  }
}
