export const slashCommands = new Set([
  'help',
  'new',
  'sessions',
  'resume',
  'undo',
  'search',
  'clear',
  'model',
  'cost',
]);

export function isRegisteredSlashCommand(input: string): boolean {
  if (!input.startsWith('/')) {
    return false;
  }

  const maybeCommand = input.slice(1).split(/\s+/)[0]?.toLowerCase();
  return Boolean(maybeCommand) && slashCommands.has(maybeCommand);
}
