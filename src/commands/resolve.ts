import chalk from 'chalk';
import ora from 'ora';
import { checkOpCli, getItemFromShareLink } from '../utils/op.js';
import { OpError } from '../utils/types.js';
import type { OpField, OpItem } from '../utils/types.js';

export interface ResolveOptions {
  json?: boolean;
}

export interface ResolveDependencies {
  checkOpCli: typeof checkOpCli;
  resolveShareLink: (shareLink: string) => OpItem;
  createSpinner: (text: string) => ReturnType<typeof ora>;
}

interface ConcealedField {
  id: string;
  label?: string;
}

const defaultDependencies: ResolveDependencies = {
  checkOpCli,
  resolveShareLink: getItemFromShareLink,
  createSpinner: (text: string) => ora(text).start(),
};

function normalizeVaultName(item: OpItem): string {
  const vaultValue = item.vault as unknown;

  if (typeof vaultValue === 'string' && vaultValue.trim().length > 0) {
    return vaultValue;
  }

  if (vaultValue && typeof vaultValue === 'object') {
    const name = (vaultValue as { name?: string }).name;
    if (name && name.trim().length > 0) {
      return name;
    }
  }

  return 'Private';
}

function listConcealedFields(fields?: OpField[]): ConcealedField[] {
  if (!fields) {
    return [];
  }

  return fields
    .filter((field) => field.type === 'CONCEALED')
    .map((field) => {
      const id = field.id?.trim();
      const label = field.label?.trim();
      return {
        id: id || label || 'password',
        label: label || undefined,
      };
    });
}

function selectPrimaryField(fields: ConcealedField[]): ConcealedField | null {
  if (fields.length === 0) {
    return null;
  }

  const preferred = fields.find(
    (field) => field.id === 'password' || field.label?.toLowerCase() === 'password'
  );

  return preferred ?? fields[0];
}

function quoteArg(value: string): string {
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
}

export function createResolveCommand(
  overrides: Partial<ResolveDependencies> = {}
): (shareLink: string, options: ResolveOptions) => Promise<void> {
  const deps = { ...defaultDependencies, ...overrides };

  return async function resolveCommand(
    shareLink: string,
    options: ResolveOptions
  ): Promise<void> {
    try {
      deps.checkOpCli();

      const spinner = deps.createSpinner('Resolving share link...');
      const item = deps.resolveShareLink(shareLink);
      const vaultName = normalizeVaultName(item);
      const concealedFields = listConcealedFields(item.fields);
      const primaryField = selectPrimaryField(concealedFields);
      const fieldId = primaryField?.id;

      spinner.succeed(chalk.green('Share link resolved.'));

      const opReference = fieldId
        ? `op://${vaultName}/${item.title}/${fieldId}`
        : null;
      const opsGet = fieldId
        ? `ops get ${quoteArg(item.title)} --vault ${quoteArg(vaultName)} --field ${quoteArg(fieldId)}`
        : `ops get ${quoteArg(item.title)} --vault ${quoteArg(vaultName)}`;

      if (options.json) {
        console.log(
          JSON.stringify(
            {
              title: item.title,
              vault: vaultName,
              field: fieldId
                ? {
                    id: fieldId,
                    label: primaryField?.label ?? null,
                  }
                : null,
              fields: concealedFields.map((field) => ({
                id: field.id,
                label: field.label ?? null,
              })),
              opReference,
              opsGet,
            },
            null,
            2
          )
        );
        return;
      }

      console.log(chalk.cyan('Resolved share link:'));
      console.log(chalk.white(`  Item: ${item.title}`));
      console.log(chalk.white(`  Vault: ${vaultName}`));

      if (fieldId) {
        const labelSuffix =
          primaryField?.label && primaryField.label !== fieldId
            ? ` (${primaryField.label})`
            : '';
        console.log(chalk.white(`  Field: ${fieldId}${labelSuffix}`));
      } else {
        console.log(chalk.yellow('  Field: none detected (no concealed fields)'));
      }

      if (opReference) {
        console.log(chalk.cyan('\nUse with op:'));
        console.log(chalk.white(`  ${opReference}`));
      }

      console.log(chalk.cyan('\nUse with ops:'));
      console.log(chalk.white(`  ${opsGet}`));

      const secondaryFields = concealedFields.filter((field) => field !== primaryField);
      if (secondaryFields.length > 0) {
        console.log(chalk.gray('\nOther concealed fields:'));
        secondaryFields.forEach((field) => {
          const labelSuffix = field.label && field.label !== field.id ? ` (${field.label})` : '';
          console.log(chalk.gray(`  - ${field.id}${labelSuffix}`));
        });
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

export const resolveCommand = createResolveCommand();
