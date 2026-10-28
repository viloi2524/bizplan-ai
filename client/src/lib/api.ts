const configuredApiUrl = (import.meta.env.VITE_API_URL ?? '')
  .trim()
  .replace(/\/+$/, '')
  .replace(/\/api$/i, '');

export function apiUrl(path: string): string {
  const apiPath = path.replace(/^\/+/, '');
  return `${configuredApiUrl}/api/${apiPath}`;
}
