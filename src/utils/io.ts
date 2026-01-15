import { readFileSync } from 'fs';

export function readValueFromInput(source: string): string {
  if (source === '-') {
    return readFileSync(0, 'utf-8').trimEnd();
  }

  return readFileSync(source, 'utf-8').trimEnd();
}
