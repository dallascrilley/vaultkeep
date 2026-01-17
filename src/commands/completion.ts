/**
 * Shell completion script generator for ops CLI
 * Supports bash, zsh, and fish shells
 */

// Bash completion script
const bashCompletion = `# ops CLI bash completion
# Add to ~/.bashrc or ~/.bash_completion:
#   source <(ops completion bash)
#   # or: ops completion bash >> ~/.bashrc

_ops_completion() {
    local cur prev commands
    COMPREPLY=()
    cur="\${COMP_WORDS[COMP_CWORD]}"
    prev="\${COMP_WORDS[COMP_CWORD-1]}"

    commands="get set copy list search favorites vaults inspect export import resolve run interactive template completion"

    case "\${COMP_CWORD}" in
        1)
            COMPREPLY=( $(compgen -W "\${commands}" -- "\${cur}") )
            return 0
            ;;
        *)
            case "\${prev}" in
                get|set|copy|inspect)
                    # Complete with vault items (expensive, so only if op is fast)
                    if command -v op &> /dev/null && [ -z "\${cur}" ]; then
                        local items
                        items=$(op item list --format=json 2>/dev/null | jq -r '.[].title' 2>/dev/null | head -20)
                        COMPREPLY=( $(compgen -W "\${items}" -- "\${cur}") )
                    fi
                    return 0
                    ;;
                -v|--vault)
                    # Complete with vault names
                    if command -v op &> /dev/null; then
                        local vaults
                        vaults=$(op vault list --format=json 2>/dev/null | jq -r '.[].name' 2>/dev/null)
                        COMPREPLY=( $(compgen -W "\${vaults}" -- "\${cur}") )
                    fi
                    return 0
                    ;;
                -f|--field)
                    COMPREPLY=( $(compgen -W "password credential username notesPlain api-key token" -- "\${cur}") )
                    return 0
                    ;;
                template)
                    COMPREPLY=( $(compgen -W "list create apply" -- "\${cur}") )
                    return 0
                    ;;
                --format)
                    COMPREPLY=( $(compgen -W "env json" -- "\${cur}") )
                    return 0
                    ;;
                import)
                    COMPREPLY=( $(compgen -f -- "\${cur}") )
                    return 0
                    ;;
                *)
                    # Complete options based on command
                    local opts=""
                    case "\${COMP_WORDS[1]}" in
                        get)
                            opts="-v --vault -f --field -s --silent --plain --json --no-input -q --quiet --no-color"
                            ;;
                        set)
                            opts="-v --vault -f --field --value --value-file --force --no-input -q --quiet --no-color"
                            ;;
                        copy)
                            opts="-v --vault -f --field --ttl -q --quiet --no-color"
                            ;;
                        list)
                            opts="-v --vault -s --search -j --json --plain --favorites -q --quiet --no-color"
                            ;;
                        search)
                            opts="-v --vault -j --json --plain -q --quiet --no-color"
                            ;;
                        favorites)
                            opts="-v --vault -j --json --plain -q --quiet --no-color"
                            ;;
                        vaults)
                            opts="-j --json -q --quiet --no-color"
                            ;;
                        inspect)
                            opts="-v --vault -j --json -q --quiet --no-color"
                            ;;
                        export)
                            opts="-v --vault -f --format -j --json -o --output -q --quiet --no-color"
                            ;;
                        import)
                            opts="-v --vault --dry-run -q --quiet --no-color"
                            ;;
                        resolve)
                            opts="-j --json -q --quiet --no-color"
                            ;;
                        run)
                            opts="-v --vault -f --field -e --env --env-file --parallel --verbose --no-color"
                            ;;
                        interactive)
                            opts="-v --vault -f --field --no-color"
                            ;;
                        template)
                            opts="list create apply --no-color"
                            ;;
                        completion)
                            opts="bash zsh fish"
                            ;;
                    esac
                    COMPREPLY=( $(compgen -W "\${opts}" -- "\${cur}") )
                    return 0
                    ;;
            esac
            ;;
    esac
}

complete -F _ops_completion ops
`;

// Zsh completion script
const zshCompletion = `#compdef ops
# ops CLI zsh completion
# Add to ~/.zshrc:
#   source <(ops completion zsh)
#   # or: ops completion zsh > ~/.zsh/completions/_ops

_ops() {
    local -a commands
    commands=(
        'get:Get a secret from 1Password'
        'set:Store a secret in 1Password'
        'copy:Copy a secret to clipboard'
        'list:List all items in a vault'
        'search:Search items by title'
        'favorites:List favorite items'
        'vaults:List available vaults'
        'inspect:Inspect item fields'
        'export:Export secrets as .env or JSON'
        'import:Import secrets from .env file'
        'resolve:Resolve 1Password share link'
        'run:Run command with secrets injected'
        'interactive:Interactive browsing mode'
        'template:Manage secret templates'
        'completion:Generate shell completion script'
    )

    local -a common_opts
    common_opts=(
        '-v[Vault name]:vault:_ops_vaults'
        '--vault[Vault name]:vault:_ops_vaults'
        '-q[Suppress non-essential output]'
        '--quiet[Suppress non-essential output]'
        '--no-color[Disable color output]'
    )

    _arguments -C \\
        '1:command:->command' \\
        '*::arg:->args'

    case "\$state" in
        command)
            _describe 'ops command' commands
            ;;
        args)
            case "\$words[1]" in
                get)
                    _arguments \\
                        '1:secret name:_ops_items' \\
                        '-v[Vault name]:vault:_ops_vaults' \\
                        '--vault[Vault name]:vault:_ops_vaults' \\
                        '-f[Field name]:field:(password credential username notesPlain api-key token)' \\
                        '--field[Field name]:field:(password credential username notesPlain api-key token)' \\
                        '-s[Output only secret value]' \\
                        '--silent[Output only secret value]' \\
                        '--plain[Output only secret value]' \\
                        '--json[Output as JSON]' \\
                        '--no-input[Disable prompts]' \\
                        '-q[Suppress output]' \\
                        '--quiet[Suppress output]' \\
                        '--no-color[Disable colors]'
                    ;;
                set)
                    _arguments \\
                        '1:secret name:' \\
                        '-v[Vault name]:vault:_ops_vaults' \\
                        '--vault[Vault name]:vault:_ops_vaults' \\
                        '-f[Field name]:field:(password credential username notesPlain api-key token)' \\
                        '--field[Field name]:field:(password credential username notesPlain api-key token)' \\
                        '--value[Secret value]:value:' \\
                        '--value-file[Read from file]:file:_files' \\
                        '--force[Overwrite without confirm]' \\
                        '--no-input[Disable prompts]' \\
                        '-q[Suppress output]' \\
                        '--quiet[Suppress output]' \\
                        '--no-color[Disable colors]'
                    ;;
                copy)
                    _arguments \\
                        '1:secret name:_ops_items' \\
                        '-v[Vault name]:vault:_ops_vaults' \\
                        '--vault[Vault name]:vault:_ops_vaults' \\
                        '-f[Field name]:field:(password credential username notesPlain api-key token)' \\
                        '--field[Field name]:field:(password credential username notesPlain api-key token)' \\
                        '--ttl[Clear after N seconds]:seconds:' \\
                        '-q[Suppress output]' \\
                        '--quiet[Suppress output]' \\
                        '--no-color[Disable colors]'
                    ;;
                list)
                    _arguments \\
                        '-v[Vault name]:vault:_ops_vaults' \\
                        '--vault[Vault name]:vault:_ops_vaults' \\
                        '-s[Search query]:query:' \\
                        '--search[Search query]:query:' \\
                        '-j[Output as JSON]' \\
                        '--json[Output as JSON]' \\
                        '--plain[Tab-delimited output]' \\
                        '--favorites[Show favorites only]' \\
                        '-q[Suppress output]' \\
                        '--quiet[Suppress output]' \\
                        '--no-color[Disable colors]'
                    ;;
                search)
                    _arguments \\
                        '1:search query:' \\
                        '-v[Vault name]:vault:_ops_vaults' \\
                        '--vault[Vault name]:vault:_ops_vaults' \\
                        '-j[Output as JSON]' \\
                        '--json[Output as JSON]' \\
                        '--plain[Tab-delimited output]' \\
                        '-q[Suppress output]' \\
                        '--quiet[Suppress output]' \\
                        '--no-color[Disable colors]'
                    ;;
                favorites|vaults)
                    _arguments \\
                        '-v[Vault name]:vault:_ops_vaults' \\
                        '--vault[Vault name]:vault:_ops_vaults' \\
                        '-j[Output as JSON]' \\
                        '--json[Output as JSON]' \\
                        '-q[Suppress output]' \\
                        '--quiet[Suppress output]' \\
                        '--no-color[Disable colors]'
                    ;;
                inspect)
                    _arguments \\
                        '1:item name:_ops_items' \\
                        '-v[Vault name]:vault:_ops_vaults' \\
                        '--vault[Vault name]:vault:_ops_vaults' \\
                        '-j[Output as JSON]' \\
                        '--json[Output as JSON]' \\
                        '-q[Suppress output]' \\
                        '--quiet[Suppress output]' \\
                        '--no-color[Disable colors]'
                    ;;
                export)
                    _arguments \\
                        '-v[Vault name]:vault:_ops_vaults' \\
                        '--vault[Vault name]:vault:_ops_vaults' \\
                        '-f[Output format]:format:(env json)' \\
                        '--format[Output format]:format:(env json)' \\
                        '-j[Alias for --format json]' \\
                        '--json[Alias for --format json]' \\
                        '-o[Output file]:file:_files' \\
                        '--output[Output file]:file:_files' \\
                        '-q[Suppress output]' \\
                        '--quiet[Suppress output]' \\
                        '--no-color[Disable colors]'
                    ;;
                import)
                    _arguments \\
                        '1:env file:_files' \\
                        '-v[Vault name]:vault:_ops_vaults' \\
                        '--vault[Vault name]:vault:_ops_vaults' \\
                        '--dry-run[Preview without modifying]' \\
                        '-q[Suppress output]' \\
                        '--quiet[Suppress output]' \\
                        '--no-color[Disable colors]'
                    ;;
                resolve)
                    _arguments \\
                        '1:share link:' \\
                        '-j[Output as JSON]' \\
                        '--json[Output as JSON]' \\
                        '-q[Suppress output]' \\
                        '--quiet[Suppress output]' \\
                        '--no-color[Disable colors]'
                    ;;
                run)
                    _arguments \\
                        '*:command:_command_names' \\
                        '-v[Vault name]:vault:_ops_vaults' \\
                        '--vault[Vault name]:vault:_ops_vaults' \\
                        '-f[Field name]:field:(password credential username notesPlain api-key token)' \\
                        '--field[Field name]:field:(password credential username notesPlain api-key token)' \\
                        '*-e[Map env to secret]:mapping:' \\
                        '*--env[Map env to secret]:mapping:' \\
                        '--env-file[Env mapping file]:file:_files' \\
                        '--parallel[Max concurrent secret lookups]:count:' \\
                        '--verbose[Show injected secrets]' \\
                        '--no-color[Disable colors]'
                    ;;
                template)
                    _arguments \\
                        '1:subcommand:(list create apply)' \\
                        '*::arg:->template_args'
                    case "$state" in
                        template_args)
                            case "$words[2]" in
                                list)
                                    _arguments \\
                                        '-j[Output as JSON]' \\
                                        '--json[Output as JSON]' \\
                                        '-q[Suppress output]' \\
                                        '--quiet[Suppress output]' \\
                                        '--no-color[Disable colors]'
                                    ;;
                                create)
                                    _arguments \\
                                        '1:template name:' \\
                                        '--fields[Template fields]:fields:' \\
                                        '--description[Template description]:description:' \\
                                        '--force[Overwrite existing template]' \\
                                        '-q[Suppress output]' \\
                                        '--quiet[Suppress output]' \\
                                        '--no-color[Disable colors]'
                                    ;;
                                apply)
                                    _arguments \\
                                        '1:template name:' \\
                                        '-v[Vault name]:vault:_ops_vaults' \\
                                        '--vault[Vault name]:vault:_ops_vaults' \\
                                        '-f[Field name]:field:(password credential username notesPlain api-key token)' \\
                                        '--field[Field name]:field:(password credential username notesPlain api-key token)' \\
                                        '--value[Provide field value]:pair:' \\
                                        '--no-input[Disable prompts]' \\
                                        '-q[Suppress output]' \\
                                        '--quiet[Suppress output]' \\
                                        '--no-color[Disable colors]'
                                    ;;
                            esac
                            ;;
                    esac
                    ;;
                interactive)
                    _arguments \\
                        '-v[Vault name]:vault:_ops_vaults' \\
                        '--vault[Vault name]:vault:_ops_vaults' \\
                        '-f[Field name]:field:(password credential username notesPlain api-key token)' \\
                        '--field[Field name]:field:(password credential username notesPlain api-key token)' \\
                        '--no-color[Disable colors]'
                    ;;
                completion)
                    _arguments '1:shell:(bash zsh fish)'
                    ;;
            esac
            ;;
    esac
}

# Dynamic completion functions
_ops_vaults() {
    local -a vaults
    if command -v op &> /dev/null; then
        vaults=(\${(f)"$(op vault list --format=json 2>/dev/null | jq -r '.[].name' 2>/dev/null)"})
        _describe 'vault' vaults
    fi
}

_ops_items() {
    local -a items
    if command -v op &> /dev/null; then
        items=(\${(f)"$(op item list --format=json 2>/dev/null | jq -r '.[].title' 2>/dev/null | head -20)"})
        _describe 'item' items
    fi
}

compdef _ops ops
`;

// Fish completion script
const fishCompletion = `# ops CLI fish completion
# Add to ~/.config/fish/completions/ops.fish:
#   ops completion fish > ~/.config/fish/completions/ops.fish

# Disable file completion by default
complete -c ops -f

# Commands
complete -c ops -n __fish_use_subcommand -a get -d 'Get a secret from 1Password'
complete -c ops -n __fish_use_subcommand -a set -d 'Store a secret in 1Password'
complete -c ops -n __fish_use_subcommand -a copy -d 'Copy a secret to clipboard'
complete -c ops -n __fish_use_subcommand -a list -d 'List all items in a vault'
complete -c ops -n __fish_use_subcommand -a search -d 'Search items by title'
complete -c ops -n __fish_use_subcommand -a favorites -d 'List favorite items'
complete -c ops -n __fish_use_subcommand -a vaults -d 'List available vaults'
complete -c ops -n __fish_use_subcommand -a inspect -d 'Inspect item fields'
complete -c ops -n __fish_use_subcommand -a export -d 'Export secrets as .env or JSON'
complete -c ops -n __fish_use_subcommand -a import -d 'Import secrets from .env file'
complete -c ops -n __fish_use_subcommand -a resolve -d 'Resolve 1Password share link'
complete -c ops -n __fish_use_subcommand -a run -d 'Run command with secrets injected'
complete -c ops -n __fish_use_subcommand -a interactive -d 'Interactive browsing mode'
complete -c ops -n __fish_use_subcommand -a template -d 'Manage secret templates'
complete -c ops -n __fish_use_subcommand -a completion -d 'Generate shell completion script'

# Common options
complete -c ops -l vault -s v -d 'Vault name'
complete -c ops -l quiet -s q -d 'Suppress non-essential output'
complete -c ops -l no-color -d 'Disable color output'

# get command options
complete -c ops -n '__fish_seen_subcommand_from get' -l field -s f -d 'Field name'
complete -c ops -n '__fish_seen_subcommand_from get' -l silent -s s -d 'Output only secret value'
complete -c ops -n '__fish_seen_subcommand_from get' -l plain -d 'Output only secret value'
complete -c ops -n '__fish_seen_subcommand_from get' -l json -d 'Output as JSON'
complete -c ops -n '__fish_seen_subcommand_from get' -l no-input -d 'Disable prompts'

# set command options
complete -c ops -n '__fish_seen_subcommand_from set' -l field -s f -d 'Field name'
complete -c ops -n '__fish_seen_subcommand_from set' -l value -d 'Secret value'
complete -c ops -n '__fish_seen_subcommand_from set' -l value-file -r -d 'Read from file'
complete -c ops -n '__fish_seen_subcommand_from set' -l force -d 'Overwrite without confirm'
complete -c ops -n '__fish_seen_subcommand_from set' -l no-input -d 'Disable prompts'

# copy command options
complete -c ops -n '__fish_seen_subcommand_from copy' -l field -s f -d 'Field name'
complete -c ops -n '__fish_seen_subcommand_from copy' -l ttl -d 'Clear after N seconds'

# list command options
complete -c ops -n '__fish_seen_subcommand_from list' -l search -s s -d 'Search query'
complete -c ops -n '__fish_seen_subcommand_from list' -l json -s j -d 'Output as JSON'
complete -c ops -n '__fish_seen_subcommand_from list' -l plain -d 'Tab-delimited output'
complete -c ops -n '__fish_seen_subcommand_from list' -l favorites -d 'Show favorites only'

# export command options
complete -c ops -n '__fish_seen_subcommand_from export' -l format -s f -a 'env json' -d 'Output format'
complete -c ops -n '__fish_seen_subcommand_from export' -l json -s j -d 'Alias for --format json'
complete -c ops -n '__fish_seen_subcommand_from export' -l output -s o -r -d 'Output file'

# import command options
complete -c ops -n '__fish_seen_subcommand_from import' -l dry-run -d 'Preview without modifying'

# run command options
complete -c ops -n '__fish_seen_subcommand_from run' -l env -s e -d 'Map env to secret'
complete -c ops -n '__fish_seen_subcommand_from run' -l env-file -r -d 'Env mapping file'
complete -c ops -n '__fish_seen_subcommand_from run' -l parallel -d 'Max concurrent secret lookups'
complete -c ops -n '__fish_seen_subcommand_from run' -l verbose -d 'Show injected secrets'

# interactive command options
complete -c ops -n '__fish_seen_subcommand_from interactive' -l field -s f -d 'Field name'

# template command options
complete -c ops -n '__fish_seen_subcommand_from template' -a 'list create apply' -d 'Template subcommand'
complete -c ops -n '__fish_seen_subcommand_from template; and __fish_seen_subcommand_from apply' -l vault -s v -d 'Vault name'
complete -c ops -n '__fish_seen_subcommand_from template; and __fish_seen_subcommand_from apply' -l field -s f -d 'Field name'
complete -c ops -n '__fish_seen_subcommand_from template; and __fish_seen_subcommand_from apply' -l value -d 'Provide field value'
complete -c ops -n '__fish_seen_subcommand_from template; and __fish_seen_subcommand_from apply' -l no-input -d 'Disable prompts'
complete -c ops -n '__fish_seen_subcommand_from template; and __fish_seen_subcommand_from create' -l fields -d 'Template fields'
complete -c ops -n '__fish_seen_subcommand_from template; and __fish_seen_subcommand_from create' -l description -d 'Template description'
complete -c ops -n '__fish_seen_subcommand_from template; and __fish_seen_subcommand_from create' -l force -d 'Overwrite existing template'

# completion command - shell argument
complete -c ops -n '__fish_seen_subcommand_from completion' -a 'bash zsh fish' -d 'Shell type'

# Dynamic vault completion (if op CLI available)
function __fish_ops_vaults
    command -v op &>/dev/null; and op vault list --format=json 2>/dev/null | jq -r '.[].name' 2>/dev/null
end

complete -c ops -n '__fish_seen_subcommand_from get set copy list search favorites inspect export import run interactive' -l vault -s v -xa '(__fish_ops_vaults)'

# Dynamic item completion (if op CLI available)
function __fish_ops_items
    command -v op &>/dev/null; and op item list --format=json 2>/dev/null | jq -r '.[].title' 2>/dev/null | head -20
end

complete -c ops -n '__fish_seen_subcommand_from get copy inspect' -xa '(__fish_ops_items)'

# Field completion
complete -c ops -n '__fish_seen_subcommand_from get set copy interactive' -l field -s f -xa 'password credential username notesPlain api-key token'
`;

interface CompletionOptions {
  quiet?: boolean;
  color?: boolean;
}

export async function completionCommand(
  shell: string | undefined,
  options: CompletionOptions
): Promise<void> {
  const targetShell = shell || detectShell();

  switch (targetShell) {
    case 'bash':
      console.log(bashCompletion);
      break;
    case 'zsh':
      console.log(zshCompletion);
      break;
    case 'fish':
      console.log(fishCompletion);
      break;
    default:
      console.error(`Unknown shell: ${targetShell}`);
      console.error('Supported shells: bash, zsh, fish');
      console.error('');
      console.error('Usage:');
      console.error('  ops completion bash  # Generate bash completion');
      console.error('  ops completion zsh   # Generate zsh completion');
      console.error('  ops completion fish  # Generate fish completion');
      console.error('');
      console.error('Installation:');
      console.error('  # Bash (add to ~/.bashrc)');
      console.error('  source <(ops completion bash)');
      console.error('');
      console.error('  # Zsh (add to ~/.zshrc)');
      console.error('  source <(ops completion zsh)');
      console.error('');
      console.error('  # Fish');
      console.error('  ops completion fish > ~/.config/fish/completions/ops.fish');
      process.exit(1);
  }
}

function detectShell(): string {
  const shell = process.env.SHELL || '';
  if (shell.includes('zsh')) return 'zsh';
  if (shell.includes('fish')) return 'fish';
  if (shell.includes('bash')) return 'bash';
  return 'bash'; // Default to bash
}
