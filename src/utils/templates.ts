import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { OpError } from './types.js';

export interface CustomTemplate {
  name: string;
  description?: string;
  fields: string[];
}

interface TemplatesFile {
  templates: Record<string, { description?: string; fields: string[] }>;
}

interface TemplateStoreDependencies {
  existsSync: typeof existsSync;
  readFileSync: typeof readFileSync;
  writeFileSync: typeof writeFileSync;
  mkdirSync: typeof mkdirSync;
  homedir: typeof homedir;
  join: typeof join;
  dirname: typeof dirname;
}

const defaultDeps: TemplateStoreDependencies = {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  homedir,
  join,
  dirname,
};

function getTemplatesPath(deps: TemplateStoreDependencies): string {
  return deps.join(deps.homedir(), '.config', 'ops-cli', 'templates.json');
}

function validateTemplatePayload(payload: TemplatesFile): void {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new OpError('Invalid templates file format.', 2);
  }

  if (!payload.templates || typeof payload.templates !== 'object') {
    throw new OpError('Invalid templates file format.', 2);
  }

  for (const [name, template] of Object.entries(payload.templates)) {
    if (!template || !Array.isArray(template.fields)) {
      throw new OpError(`Invalid template "${name}" in templates file.`, 2);
    }
    for (const field of template.fields) {
      if (typeof field !== 'string' || field.trim().length === 0) {
        throw new OpError(`Invalid field in template "${name}".`, 2);
      }
    }
  }
}

export function createTemplateStore(overrides: Partial<TemplateStoreDependencies> = {}) {
  const deps: TemplateStoreDependencies = { ...defaultDeps, ...overrides };

  function loadCustomTemplates(): Record<string, CustomTemplate> {
    const path = getTemplatesPath(deps);
    if (!deps.existsSync(path)) return {};

    const content = deps.readFileSync(path, 'utf-8');
    try {
      const parsed = JSON.parse(content) as TemplatesFile;
      validateTemplatePayload(parsed);

      const templates: Record<string, CustomTemplate> = {};
      for (const [name, template] of Object.entries(parsed.templates)) {
        templates[name] = {
          name,
          description: template.description,
          fields: template.fields,
        };
      }

      return templates;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to parse templates file.';
      throw new OpError(message, 2);
    }
  }

  function saveCustomTemplates(templates: Record<string, CustomTemplate>): void {
    const path = getTemplatesPath(deps);
    const payload: TemplatesFile = {
      templates: {},
    };

    for (const [name, template] of Object.entries(templates)) {
      payload.templates[name] = {
        description: template.description,
        fields: template.fields,
      };
    }

    deps.mkdirSync(deps.dirname(path), { recursive: true, mode: 0o700 });
    deps.writeFileSync(path, JSON.stringify(payload, null, 2), { mode: 0o600 });
  }

  return { loadCustomTemplates, saveCustomTemplates };
}
