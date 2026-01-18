import { readFileSync } from 'fs';

export function readValueFromInput(source: string): string {
  if (source === '-') {
    return readFileSync(0, 'utf-8').trimEnd();
  }

  return readFileSync(source, 'utf-8').trimEnd();
}

/**
 * Read lines from a file or stdin (if source is "-")
 * Filters out empty lines and trims whitespace
 */
export function readLinesFromInput(source: string): string[] {
  const content = readValueFromInput(source);
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
}
