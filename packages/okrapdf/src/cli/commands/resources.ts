import type { OkraClient } from '../../client';
import type { ApiAction, ApiResource, ApiResourceCatalog } from '../../types';

export async function listApiResources(client: OkraClient): Promise<ApiResourceCatalog> {
  return client.resources.list();
}

export async function getApiResource(
  client: OkraClient,
  name: string,
): Promise<ApiResource | ApiAction> {
  return client.resources.get(name);
}

export function formatApiResourceCatalog(catalog: ApiResourceCatalog, json?: boolean): string {
  if (json) return JSON.stringify(catalog);

  const lines: string[] = [
    'Resources',
    ...catalog.data.map((resource) => {
      const aliases = resource.aliases.length ? ` aliases: ${resource.aliases.join(', ')}` : '';
      return `  ${resource.name}\t${resource.path}\t${resource.description}${aliases}`;
    }),
    '',
    'Actions',
    ...catalog.actions.map((action) =>
      `  ${action.name}\t${action.path}\t${action.description}`,
    ),
  ];

  return lines.join('\n');
}

export function formatApiResourceItem(item: ApiResource | ApiAction, json?: boolean): string {
  if (json) return JSON.stringify(item);

  const lines: string[] = [];
  if (item.object === 'api_resource') {
    lines.push(`${item.name} (${item.path})`, item.description);
    if (item.aliases.length) lines.push(`Aliases: ${item.aliases.join(', ')}`);
    if (item.related_actions.length) lines.push(`Actions: ${item.related_actions.join(', ')}`);
  } else {
    lines.push(`${item.name} (${item.path})`, item.description);
    lines.push(`Primary resource: ${item.primary_resource}`);
    lines.push(`Returns: ${item.returns}`);
  }

  lines.push('', 'Operations');
  for (const operation of item.operations) {
    lines.push(
      `  ${operation.method}\t${operation.path}\t${operation.action}\t${operation.description}`,
    );
  }

  return lines.join('\n');
}
