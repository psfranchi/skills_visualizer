/**
 * An `mcp.json` with every known redaction bypass shape. Every secret contains `LEAK_MARKER`,
 * so a leak check is `not.toContain(LEAK_MARKER)`. Token prefixes are concatenated at runtime so
 * the repo's secret-scanning hook never sees a token-shaped literal.
 */
export const LEAK_MARKER = 'SENTINEL';

const S = 'SENTINEL-NOT-A-SECRET-E2E';

const prefixed = (prefix: string, suffix: string) => [prefix, S, suffix].join('');

export function leakyMcpConfig(): { mcpServers: Record<string, unknown>; secrets: unknown } {
  return {
    secrets: { token: `${S}20` },
    mcpServers: {
      'unknown-field': { command: 'npx', customApiKey: `${S}21` },
      'docker-env': {
        command: 'docker',
        args: ['run', '-e', `DATABASE_URL=postgres://app:${S}1@localhost/app`, 'img'],
      },
      'flag-urls': {
        command: 'npx',
        args: [
          `--url=https://mcp.example.com/sse?api_key=${S}2`,
          `--connection-string=mongodb://u:${S}3@localhost/db`,
          `jdbc:postgresql://u:${S}4@localhost:5432/db?password=${S}5`,
        ],
      },
      headers: {
        command: 'npx',
        args: [
          'mcp-remote',
          'https://mcp.example.com/sse',
          '--header',
          `Authorization: Bearer ${S}6`,
          '-H',
          `Authorization:Bearer ${S}7`,
          `--header=Authorization:Bearer ${S}8`,
          `Basic ${S}9`,
        ],
      },
      'command-string': { command: `docker run -e API_TOKEN=${S}10 img` },
      'env-command': { command: `env GITHUB_TOKEN=${S}11 npx srv` },
      'quoted-header': {
        command: `npx mcp-remote https://x/sse --header "X-Api-Key: ${S}22"`,
      },
      'nested-shell': { command: `sh -c "curl -H 'Authorization: Bearer ${S}23' https://h"` },
      'path-key': { url: 'https://actions.example.com/mcp/SENTINELNOTASECRET0P1234/sse' },
      positional: {
        command: 'npx',
        args: [
          prefixed(['xo', 'xb-'].join(''), '12'),
          prefixed('ghp_', '13'),
          prefixed('sk-', '14'),
          prefixed('AKIA', '15'),
          prefixed('eyJ', '16'),
          'SENTINELnot0a0secret0E1234',
          `-p${S}17`,
        ],
      },
      'connection-strings': {
        command: 'psql',
        args: [`host=localhost user=app password=${S}18`, `Server=db;Password=${S}19;Database=x`],
      },
    },
  };
}

export function leakyMcpJson(): string {
  return `${JSON.stringify(leakyMcpConfig(), null, 2)}\n`;
}
