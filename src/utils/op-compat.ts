export type OpCompatRoute =
  | { route: 'ops' }
  | { route: 'op'; opArgs: string[] };

const OPS_GLOBAL_OPTIONS = new Set(['--retry', '--no-retry']);

const OPS_INTERNAL_TOP_LEVEL_COMMANDS = new Set([
  'get',
  'get-many',
  'gets',
  'inspect',
  'set',
  'run',
  'copy',
  'list',
  'search',
  'favorites',
  'vaults',
  'export',
  'import',
  'resolve',
  'interactive',
  'i',
  'whoami',
  'completion',
  'template',
  'update',
]);

const OPS_TEMPLATE_SUBCOMMANDS = new Set(['list', 'create', 'apply']);

function isHelpOrVersionFlag(value: string): boolean {
  return value === '-h' || value === '--help' || value === '-V' || value === '--version';
}

function stripOpsGlobalOptions(argv: string[]): string[] {
  const result: string[] = [];
  let passthrough = false;

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];

    if (token === '--') {
      passthrough = true;
      result.push(token);
      continue;
    }

    if (passthrough) {
      result.push(token);
      continue;
    }

    if (token === '--no-retry') {
      continue;
    }

    if (token === '--retry') {
      // Skip the value if provided.
      if (i + 1 < argv.length && argv[i + 1] !== '--') {
        i++;
      }
      continue;
    }

    if (token.startsWith('--retry=')) {
      continue;
    }

    result.push(token);
  }

  return result;
}

function getFirstCommandTokenIndex(argv: string[]): number | null {
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--') return null;

    if (token === '--retry') {
      if (i + 1 < argv.length && argv[i + 1] !== '--') i++;
      continue;
    }

    if (token.startsWith('--retry=')) continue;

    if (token === '--no-retry') continue;
    if (token.startsWith('-')) continue;
    return i;
  }
  return null;
}

function isOpsGlobalOptionToken(token: string): boolean {
  if (OPS_GLOBAL_OPTIONS.has(token)) return true;
  if (token.startsWith('--retry=')) return true;
  return false;
}

/**
 * Route `ops ...` invocations:
 * - `ops <unknown>` => pass-through to `op <unknown>`
 * - `ops op ...` => explicit pass-through to `op ...`
 * - Keep existing Vaultkeep commands as-is (notably `run` + `template`).
 */
export function resolveOpCompatRoute(argv: string[]): OpCompatRoute {
  if (argv.length === 0) return { route: 'ops' };

  const first = argv[0];
  if (first === 'op') {
    const opArgs = argv.slice(1);
    return { route: 'op', opArgs: opArgs.length > 0 ? opArgs : ['--help'] };
  }

  if (isHelpOrVersionFlag(first)) {
    return { route: 'ops' };
  }

  // If invocation starts with a non-ops global option, assume it's intended
  // for `op` (our CLI doesn't accept arbitrary global flags).
  if (first.startsWith('-') && !isOpsGlobalOptionToken(first)) {
    const opArgs = stripOpsGlobalOptions(argv);
    return { route: 'op', opArgs: opArgs.length > 0 ? opArgs : ['--help'] };
  }

  const commandIndex = getFirstCommandTokenIndex(argv);
  if (commandIndex === null) return { route: 'ops' };

  const command = argv[commandIndex];

  if (!OPS_INTERNAL_TOP_LEVEL_COMMANDS.has(command)) {
    const opArgs = stripOpsGlobalOptions(argv);
    return { route: 'op', opArgs: opArgs.length > 0 ? opArgs : ['--help'] };
  }

  // Avoid breaking existing `ops template ...` behavior while still allowing
  // `ops template <op-subcommand>` via pass-through.
  if (command === 'template') {
    const maybeSubcommand = argv[commandIndex + 1];
    if (!maybeSubcommand) return { route: 'ops' };
    if (maybeSubcommand.startsWith('-')) return { route: 'ops' };
    if (OPS_TEMPLATE_SUBCOMMANDS.has(maybeSubcommand)) return { route: 'ops' };

    const opArgs = stripOpsGlobalOptions(argv);
    return { route: 'op', opArgs: opArgs.length > 0 ? opArgs : ['--help'] };
  }

  return { route: 'ops' };
}
