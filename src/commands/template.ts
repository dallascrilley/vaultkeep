import inquirer from 'inquirer';
import chalk from 'chalk';
import {
  applyColorConfig,
  createSpinner,
  isInteractiveInput,
  resolveBooleanOption,
  resolveField,
  resolveVault,
} from '../utils/cli.js';
import { OpError } from '../utils/types.js';
import { setSecret, checkOpCli } from '../utils/op.js';
import { createTemplateStore, type CustomTemplate } from '../utils/templates.js';
import {
  builtinTemplates,
  getBuiltinTemplate,
  type SecretTemplateDefinition,
} from '../templates/builtins.js';

export interface SecretTemplate {
  name: string;
  description?: string;
  fields: string[];
  source: 'builtin' | 'custom';
}

export function parseTemplateFields(input: string): string[] {
  const parts = input
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (parts.length === 0) {
    throw new OpError('Template fields are required.', 2);
  }

  const seen = new Set<string>();
  const fields: string[] = [];

  for (const part of parts) {
    const normalized = part.toUpperCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    fields.push(normalized);
  }

  return fields;
}

function normalizeTemplateName(name: string): string {
  return name.trim().toLowerCase();
}

function toSecretTemplate(
  template: SecretTemplateDefinition | CustomTemplate,
  source: 'builtin' | 'custom'
): SecretTemplate {
  return {
    name: template.name,
    description: template.description,
    fields: template.fields,
    source,
  };
}

function mergeTemplates(
  custom: Record<string, CustomTemplate>
): SecretTemplate[] {
  const customTemplates = Object.values(custom).map((template) =>
    toSecretTemplate(template, 'custom')
  );
  const builtins = builtinTemplates.map((template) =>
    toSecretTemplate(template, 'builtin')
  );

  return [...builtins, ...customTemplates];
}

function getTemplateByName(
  name: string,
  custom: Record<string, CustomTemplate>
): SecretTemplate | undefined {
  const normalized = normalizeTemplateName(name);
  const builtin = getBuiltinTemplate(normalized);
  if (builtin) return toSecretTemplate(builtin, 'builtin');

  const customTemplate = custom[normalized];
  if (!customTemplate) return undefined;

  return toSecretTemplate(customTemplate, 'custom');
}

function parseKeyValuePairs(pairs: string[] | undefined): Record<string, string> {
  if (!pairs || pairs.length === 0) return {};

  const mapping: Record<string, string> = {};

  for (const pair of pairs) {
    const separatorIndex = pair.indexOf('=');
    if (separatorIndex <= 0) {
      throw new OpError(
        'Invalid --value format. Use KEY=VALUE (example: --value API_KEY=secret).',
        2
      );
    }

    const key = pair.slice(0, separatorIndex).trim().toUpperCase();
    const value = pair.slice(separatorIndex + 1).trim();

    if (!key || !value) {
      throw new OpError(
        'Invalid --value format. Use KEY=VALUE (example: --value API_KEY=secret).',
        2
      );
    }

    mapping[key] = value;
  }

  return mapping;
}

export interface TemplateListOptions {
  json?: boolean;
  quiet?: boolean;
  color?: boolean;
}

export interface TemplateCreateOptions {
  fields?: string;
  description?: string;
  force?: boolean;
  quiet?: boolean;
  color?: boolean;
}

export interface TemplateApplyOptions {
  vault?: string;
  field?: string;
  values?: string[];
  input?: boolean;
  quiet?: boolean;
  color?: boolean;
}

export interface TemplateDependencies {
  checkOpCli: typeof checkOpCli;
  setSecret: typeof setSecret;
  prompt: typeof inquirer.prompt;
  createSpinner: typeof createSpinner;
  applyColorConfig: typeof applyColorConfig;
  isInteractiveInput: typeof isInteractiveInput;
  resolveBooleanOption: typeof resolveBooleanOption;
  resolveVault: typeof resolveVault;
  resolveField: typeof resolveField;
  parseTemplateFields: typeof parseTemplateFields;
  loadCustomTemplates: () => Record<string, CustomTemplate>;
  saveCustomTemplates: (templates: Record<string, CustomTemplate>) => void;
  isBuiltinTemplate: (name: string) => boolean;
  getTemplateByName: (name: string) => SecretTemplate | undefined;
  mergeTemplates: (custom: Record<string, CustomTemplate>) => SecretTemplate[];
}

const templateStore = createTemplateStore();

const defaultDependencies: TemplateDependencies = {
  checkOpCli,
  setSecret,
  prompt: inquirer.prompt,
  createSpinner,
  applyColorConfig,
  isInteractiveInput,
  resolveBooleanOption,
  resolveVault,
  resolveField,
  parseTemplateFields,
  loadCustomTemplates: () => templateStore.loadCustomTemplates(),
  saveCustomTemplates: (templates) => templateStore.saveCustomTemplates(templates),
  isBuiltinTemplate: (name) => Boolean(getBuiltinTemplate(name)),
  getTemplateByName: (name) => getTemplateByName(name, templateStore.loadCustomTemplates()),
  mergeTemplates: (custom) => mergeTemplates(custom),
};

export function createTemplateListCommand(
  overrides: Partial<TemplateDependencies> = {}
): (options: TemplateListOptions) => Promise<void> {
  const deps = { ...defaultDependencies, ...overrides };

  return async function templateListCommand(
    options: TemplateListOptions
  ): Promise<void> {
    try {
      const envNoColor = deps.resolveBooleanOption(undefined, 'OPS_NO_COLOR');
      const noColor = options.color === false || envNoColor;
      deps.applyColorConfig(noColor);

      const customTemplates = deps.loadCustomTemplates();
      const allTemplates = deps.mergeTemplates(customTemplates);

      if (options.json) {
        console.log(JSON.stringify(allTemplates, null, 2));
        return;
      }

      if (!options.quiet) {
        console.log(chalk.cyan('Available templates:'));
      }

      for (const template of allTemplates) {
        const label = template.source === 'builtin' ? 'built-in' : 'custom';
        console.log(
          chalk.white(
            `  ${template.name} (${label}) - ${template.fields.join(', ')}`
          )
        );
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

export function createTemplateCreateCommand(
  overrides: Partial<TemplateDependencies> = {}
): (name: string, options: TemplateCreateOptions) => Promise<void> {
  const deps = { ...defaultDependencies, ...overrides };

  return async function templateCreateCommand(
    name: string,
    options: TemplateCreateOptions
  ): Promise<void> {
    try {
      if (!name || name.trim().length === 0) {
        throw new OpError('Template name is required.', 2);
      }

      const envNoColor = deps.resolveBooleanOption(undefined, 'OPS_NO_COLOR');
      const noColor = options.color === false || envNoColor;
      deps.applyColorConfig(noColor);

      if (!options.fields) {
        throw new OpError('Template fields are required (use --fields).', 2);
      }

      const normalizedName = normalizeTemplateName(name);
      if (deps.isBuiltinTemplate(normalizedName)) {
        throw new OpError(`Template "${normalizedName}" is built-in and cannot be overwritten.`, 2);
      }

      const fields = deps.parseTemplateFields(options.fields);
      const templates = deps.loadCustomTemplates();

      if (templates[normalizedName] && !options.force) {
        throw new OpError(
          `Template "${normalizedName}" already exists. Use --force to overwrite.`,
          2
        );
      }

      templates[normalizedName] = {
        name: normalizedName,
        description: options.description,
        fields,
      };

      deps.saveCustomTemplates(templates);

      if (!options.quiet) {
        console.log(chalk.green(`Template "${normalizedName}" saved.`));
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

export function createTemplateApplyCommand(
  overrides: Partial<TemplateDependencies> = {}
): (name: string, options: TemplateApplyOptions) => Promise<void> {
  const deps = { ...defaultDependencies, ...overrides };

  return async function templateApplyCommand(
    name: string,
    options: TemplateApplyOptions
  ): Promise<void> {
    try {
      if (!name || name.trim().length === 0) {
        throw new OpError('Template name is required.', 2);
      }

      deps.checkOpCli();

      const envNoColor = deps.resolveBooleanOption(undefined, 'OPS_NO_COLOR');
      const envNoInput = deps.resolveBooleanOption(undefined, 'OPS_NO_INPUT');
      const noColor = options.color === false || envNoColor;
      const noInput = options.input === false || envNoInput;
      const canPrompt = !noInput && deps.isInteractiveInput();

      deps.applyColorConfig(noColor);

      const template = deps.getTemplateByName(name);
      if (!template) {
        throw new OpError(`Template "${name}" not found.`, 1);
      }

      const vault = deps.resolveVault(options.vault);
      const field = deps.resolveField(options.field);
      const providedValues = parseKeyValuePairs(options.values);

      const resolvedValues: Record<string, string> = {};

      for (const templateField of template.fields) {
        const provided = providedValues[templateField];
        if (provided) {
          resolvedValues[templateField] = provided;
          continue;
        }

        if (!canPrompt) {
          throw new OpError(
            `Missing value for ${templateField}. Use --value ${templateField}=... or enable prompts.`,
            2
          );
        }

        const answer = await deps.prompt([
          {
            type: 'password',
            name: 'value',
            message: `Enter value for ${templateField}:`,
            mask: '*',
            validate: (input: string) => input.length > 0 || 'Value cannot be empty',
          },
        ]);
        resolvedValues[templateField] = answer.value as string;
      }

      const spinner = deps.createSpinner(
        `Saving ${template.fields.length} secret${template.fields.length === 1 ? '' : 's'}...`,
        options.quiet === true
      );

      for (const [key, value] of Object.entries(resolvedValues)) {
        deps.setSecret(key, value, vault, field);
      }

      spinner.succeed(chalk.green('Template secrets saved.'));

      if (!options.quiet) {
        console.log(chalk.cyan('\nCreated secrets:'));
        for (const key of Object.keys(resolvedValues)) {
          console.log(chalk.white(`  ${key}`));
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

export const templateListCommand = createTemplateListCommand();
export const templateCreateCommand = createTemplateCreateCommand();
export const templateApplyCommand = createTemplateApplyCommand();
