export interface SecretTemplateDefinition {
  name: string;
  description: string;
  fields: string[];
}

export const builtinTemplates: SecretTemplateDefinition[] = [
  {
    name: 'postgres',
    description: 'Postgres connection fields',
    fields: ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'],
  },
  {
    name: 'mysql',
    description: 'MySQL connection fields',
    fields: ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'],
  },
  {
    name: 'redis',
    description: 'Redis connection fields',
    fields: ['REDIS_URL', 'REDIS_PASSWORD'],
  },
  {
    name: 'oauth',
    description: 'OAuth client fields',
    fields: ['CLIENT_ID', 'CLIENT_SECRET', 'REDIRECT_URI'],
  },
  {
    name: 'api',
    description: 'Generic API credentials',
    fields: ['API_KEY', 'API_SECRET', 'API_URL'],
  },
  {
    name: 'smtp',
    description: 'SMTP credentials',
    fields: ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD'],
  },
];

export function getBuiltinTemplate(name: string): SecretTemplateDefinition | undefined {
  const normalized = name.toLowerCase();
  return builtinTemplates.find((template) => template.name === normalized);
}
