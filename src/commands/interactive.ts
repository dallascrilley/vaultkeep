import inquirer from 'inquirer';
import autocompletePrompt from 'inquirer-autocomplete-prompt';
import chalk from 'chalk';
import { checkOpCli, listItems, listVaults, getItem } from '../utils/op.js';
import {
  applyColorConfig,
  isInteractiveInput,
  resolveBooleanOption,
  resolveField,
  resolveVault,
} from '../utils/cli.js';
import { OpError } from '../utils/types.js';
import { copyCommand } from './copy.js';
import { getCommand } from './get.js';
import { inspectCommand } from './inspect.js';

export interface InteractiveOptions {
  vault?: string;
  field?: string;
  color?: boolean;
}

export interface InteractiveDependencies {
  checkOpCli: typeof checkOpCli;
  listVaults: typeof listVaults;
  listItems: typeof listItems;
  getItem: typeof getItem;
  prompt: typeof inquirer.prompt;
  registerPrompt: typeof inquirer.registerPrompt;
  autocompletePrompt: typeof autocompletePrompt;
  applyColorConfig: typeof applyColorConfig;
  isInteractiveInput: typeof isInteractiveInput;
  resolveBooleanOption: typeof resolveBooleanOption;
  resolveVault: typeof resolveVault;
  resolveField: typeof resolveField;
  copyCommand: typeof copyCommand;
  getCommand: typeof getCommand;
  inspectCommand: typeof inspectCommand;
}

const defaultDependencies: InteractiveDependencies = {
  checkOpCli,
  listVaults,
  listItems,
  getItem,
  prompt: inquirer.prompt,
  registerPrompt: inquirer.registerPrompt,
  autocompletePrompt,
  applyColorConfig,
  isInteractiveInput,
  resolveBooleanOption,
  resolveVault,
  resolveField,
  copyCommand,
  getCommand,
  inspectCommand,
};

const BACK_TO_VAULTS = '__back_to_vaults__';
const BACK_TO_ITEMS = '__back_to_items__';

function normalize(value: string): string {
  return value.toLowerCase();
}

function fuzzyScore(candidate: string, query: string): number {
  if (!query) return 1;
  const haystack = normalize(candidate);
  const needle = normalize(query);

  if (haystack.includes(needle)) {
    return 1000 - haystack.indexOf(needle);
  }

  let score = 0;
  let lastIndex = -1;

  for (const char of needle) {
    const nextIndex = haystack.indexOf(char, lastIndex + 1);
    if (nextIndex === -1) return -1;
    const gap = nextIndex - lastIndex;
    score += Math.max(1, 10 - gap);
    lastIndex = nextIndex;
  }

  return score;
}

function filterChoices(values: string[], input?: string, limit = 50): string[] {
  const query = input?.trim() ?? '';

  const scored = values
    .map((value) => ({ value, score: fuzzyScore(value, query) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map((entry) => entry.value);
}

function createAutocompleteSource(values: string[]) {
  return async (_answers: unknown, input?: string) => {
    return filterChoices(values, input);
  };
}

async function promptForVault(
  deps: InteractiveDependencies
): Promise<string> {
  const vaults = deps.listVaults();
  if (vaults.length === 0) {
    throw new OpError('No vaults found for this account.', 1);
  }

  const choices = vaults.map((vault) => vault.name);

  const answer = await deps.prompt([
    {
      type: 'autocomplete',
      name: 'vault',
      message: 'Select a vault:',
      source: createAutocompleteSource(choices),
    },
  ]);

  if (!answer.vault) {
    throw new OpError('No vault selected.', 2);
  }

  return answer.vault;
}

async function promptForItem(
  vault: string,
  deps: InteractiveDependencies
): Promise<string | null> {
  const items = deps.listItems(vault);
  if (items.length === 0) {
    throw new OpError(`No items found in vault "${vault}".`, 1);
  }

  const choices = [
    { name: '⬅ Back to vaults', value: BACK_TO_VAULTS },
    ...items.map((item) => ({ name: item.title, value: item.title })),
  ];

  const answer = await deps.prompt([
    {
      type: 'autocomplete',
      name: 'item',
      message: `Select an item from ${vault}:`,
      source: async (_answers: unknown, input?: string) => {
        const filtered = filterChoices(
          choices.map((choice) => choice.name),
          input
        );
        return choices.filter((choice) => filtered.includes(choice.name));
      },
    },
  ]);

  if (answer.item === BACK_TO_VAULTS) {
    return null;
  }

  return answer.item ?? null;
}

async function promptForAction(
  deps: InteractiveDependencies
): Promise<string> {
  const answer = await deps.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'Choose an action:',
      choices: [
        { name: 'Copy to clipboard', value: 'copy' },
        { name: 'Get secret (print value)', value: 'get' },
        { name: 'Inspect item fields', value: 'inspect' },
        { name: '⬅ Back to items', value: BACK_TO_ITEMS },
        { name: 'Exit', value: 'exit' },
      ],
    },
  ]);

  return answer.action ?? 'exit';
}

function renderItemDetails(itemName: string, vault: string, deps: InteractiveDependencies): void {
  const item = deps.getItem(itemName, vault);
  if (!item) return;

  console.log(chalk.cyan(`\nItem: ${item.title}`));
  console.log(chalk.gray(`Vault: ${vault}`));
  if (item.category) {
    console.log(chalk.gray(`Category: ${item.category}`));
  }
  if (item.fields && item.fields.length > 0) {
    const labels = item.fields
      .map((field) => field.label)
      .filter((label) => Boolean(label))
      .join(', ');
    if (labels.length > 0) {
      console.log(chalk.gray(`Fields: ${labels}`));
    }
  }
}

export function createInteractiveCommand(
  overrides: Partial<InteractiveDependencies> = {}
): (options: InteractiveOptions) => Promise<void> {
  const deps = { ...defaultDependencies, ...overrides };

  return async function interactiveCommand(
    options: InteractiveOptions
  ): Promise<void> {
    try {
      if (!deps.isInteractiveInput()) {
        throw new OpError('Interactive mode requires a TTY.', 2);
      }

      deps.checkOpCli();

      const envNoColor = deps.resolveBooleanOption(undefined, 'OPS_NO_COLOR');
      const noColor = options.color === false || envNoColor;
      deps.applyColorConfig(noColor);

      deps.registerPrompt('autocomplete', deps.autocompletePrompt);

      const field = deps.resolveField(options.field);
      let selectedVault = options.vault ? deps.resolveVault(options.vault) : undefined;

      while (true) {
        if (!selectedVault) {
          selectedVault = await promptForVault(deps);
        }

        const selectedItem = await promptForItem(selectedVault, deps);
        if (!selectedItem) {
          selectedVault = undefined;
          continue;
        }

        renderItemDetails(selectedItem, selectedVault, deps);

        while (true) {
          const action = await promptForAction(deps);
          if (action === 'exit') return;
          if (action === BACK_TO_ITEMS) {
            break;
          }

          if (action === 'copy') {
            await deps.copyCommand(selectedItem, {
              vault: selectedVault,
              field,
              quiet: true,
              color: options.color,
            });
            continue;
          }

          if (action === 'get') {
            await deps.getCommand(selectedItem, {
              vault: selectedVault,
              field,
              quiet: false,
              color: options.color,
            });
            continue;
          }

          if (action === 'inspect') {
            await deps.inspectCommand(selectedItem, {
              vault: selectedVault,
              json: false,
              quiet: false,
              color: options.color,
            });
            continue;
          }
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

export const interactiveCommand = createInteractiveCommand();
