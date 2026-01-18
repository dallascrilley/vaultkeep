export interface OpItem {
  id: string;
  title: string;
  vault: string;
  category: string;
  favorite?: boolean;
  fields?: OpField[];
}

export interface OpField {
  id: string;
  type: string;
  label: string;
  value?: string;
}

export interface SecretConfig {
  vault?: string;
  field?: string;
}

export interface ExportOptions {
  vault?: string;
  format?: 'env' | 'json';
  json?: boolean;
  output?: string;
  filter?: string;
  quiet?: boolean;
  color?: boolean;
}

export class OpError extends Error {
  constructor(
    message: string,
    public exitCode: number = 1
  ) {
    super(message);
    this.name = 'OpError';
  }
}
