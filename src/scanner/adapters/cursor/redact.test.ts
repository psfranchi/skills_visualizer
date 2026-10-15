import { describe, expect, it } from 'vitest';
import { maskArgs, maskCommand, REDACTED, redactMap, sanitizeUrl } from './redact';

const S = 'SENTINEL-NOT-A-SECRET-T';

describe('redactMap', () => {
  it('keeps keys and pure ${env:} references only', () => {
    expect(redactMap({ B: `${S}1`, A: '${env:HOME}', C: 'Bearer ${env:TOKEN}' })).toEqual({
      A: '${env:HOME}',
      B: REDACTED,
      C: REDACTED,
    });
    expect(redactMap('nope')).toBe(REDACTED);
  });
});

describe('sanitizeUrl', () => {
  it('drops userinfo, query, and fragment', () => {
    expect(sanitizeUrl(`http://user:${S}2@localhost:8931/sse?token=${S}3#x`)).toBe(
      'http://localhost:8931/sse',
    );
    expect(sanitizeUrl('${env:MCP_URL}')).toBe('${env:MCP_URL}');
    expect(sanitizeUrl('not a url')).toBe(REDACTED);
    expect(sanitizeUrl(42)).toBe(REDACTED);
  });

  it('masks credential-looking path segments and keeps short ones', () => {
    expect(sanitizeUrl('https://actions.example.com/mcp/SENTINELNOTASECRET0P1234/sse')).toBe(
      `https://actions.example.com/mcp/${REDACTED}/sse`,
    );
    expect(sanitizeUrl('https://mcp.example.com/v1/sse')).toBe('https://mcp.example.com/v1/sse');
    expect(sanitizeUrl('https://mcp.example.com/a-long-readable-path-segment/x')).toBe(
      'https://mcp.example.com/a-long-readable-path-segment/x',
    );
  });
});

describe('maskArgs', () => {
  it('masks values after secret-looking flags, inline values, NAME=value pairs, and URL credentials', () => {
    expect(
      maskArgs([
        '-y',
        'pkg',
        '--token',
        `${S}4`,
        `--api-key=${S}5`,
        '--password',
        '${env:PW}',
        `GITHUB_TOKEN=${S}6`,
        `http://u:${S}7@localhost/x?k=${S}8`,
        '--verbose',
        7,
      ]),
    ).toEqual([
      '-y',
      'pkg',
      '--token',
      REDACTED,
      `--api-key=${REDACTED}`,
      '--password',
      '${env:PW}',
      `GITHUB_TOKEN=${REDACTED}`,
      'http://localhost/x',
      '--verbose',
      REDACTED,
    ]);
  });

  it('redacts non-array args entirely', () => {
    expect(maskArgs(`--token ${S}9`)).toBe(REDACTED);
  });

  it('sanitizes URLs inside NAME= and --flag= values and embedded in longer strings', () => {
    expect(
      maskArgs([
        'run',
        '-e',
        `DATABASE_URL=postgres://app:${S}X1@localhost/app`,
        'img',
        `--url=https://mcp.example.com/sse?api_key=${S}X2`,
        `--connection-string=mongodb://u:${S}X3@localhost/db`,
        `jdbc:postgresql://u:${S}X4@localhost:5432/db?password=${S}X5`,
        `dsn is postgres://u:${S}X6@localhost/x?sslmode=require now`,
      ]),
    ).toEqual([
      'run',
      '-e',
      'DATABASE_URL=postgres://localhost/app',
      'img',
      '--url=https://mcp.example.com/sse',
      '--connection-string=mongodb://localhost/db',
      'jdbc:postgresql://localhost:5432/db',
      'dsn is postgres://localhost/x now',
    ]);
  });

  it('masks header values after --header / -H / --header= and any Authorization or Bearer arg', () => {
    expect(
      maskArgs([
        'mcp-remote',
        'https://mcp.example.com/sse',
        '--header',
        `Authorization: Bearer ${S}H1`,
        '-H',
        `Authorization:Bearer ${S}H2`,
        `--header=Authorization:Bearer ${S}H3`,
        '--headers',
        'X-Org:${env:ORG}',
        `Authorization: Basic ${S}H4`,
        `Bearer ${S}H5`,
      ]),
    ).toEqual([
      'mcp-remote',
      'https://mcp.example.com/sse',
      '--header',
      `Authorization: ${REDACTED}`,
      '-H',
      `Authorization: ${REDACTED}`,
      `--header=Authorization: ${REDACTED}`,
      '--headers',
      'X-Org:${env:ORG}',
      REDACTED,
      REDACTED,
    ]);
  });

  it('masks known token prefixes and long opaque positional tokens, not paths or packages', () => {
    const prefixes = ['ghp_', 'gho_', 'github_pat_', 'glpat-', 'xoxb-', 'sk-', 'AKIA', 'eyJ'];
    expect(maskArgs(prefixes.map((p) => `${p}${S}P`))).toEqual(prefixes.map(() => REDACTED));
    expect(
      maskArgs([
        'SENTINELnot0a0secret0E1234',
        '/home/User/Projects2026/server-bin',
        '@modelcontextprotocol/server-filesystem',
      ]),
    ).toEqual([
      REDACTED,
      '/home/User/Projects2026/server-bin',
      '@modelcontextprotocol/server-filesystem',
    ]);
  });

  it('masks key=value secrets anywhere in connection strings', () => {
    expect(
      maskArgs([
        `host=localhost user=app password=${S}L1 dbname=app`,
        `Server=db;Password=${S}L2;Database=x`,
        `--dsn=user=app pwd=${S}L3`,
      ]),
    ).toEqual([
      `host=localhost user=app password=${REDACTED} dbname=app`,
      `Server=db;Password=${REDACTED};Database=x`,
      `--dsn=user=app pwd=${REDACTED}`,
    ]);
  });

  it('masks combined -p<value> short flags (and, fail-closed, the next arg)', () => {
    expect(maskArgs(['-u', 'app', `-p${S}M1`, 'appdb', '-p8080:80'])).toEqual([
      '-u',
      'app',
      `-p${REDACTED}`,
      REDACTED,
      `-p${REDACTED}`,
    ]);
  });
});

describe('maskCommand', () => {
  it('masks secrets inside a whitespace-separated command string', () => {
    expect(maskCommand(`docker run -e API_TOKEN=${S}C1 img`)).toBe(
      `docker run -e API_TOKEN=${REDACTED} img`,
    );
    expect(maskCommand(`env GITHUB_TOKEN=${S}C2 npx srv`)).toBe(
      `env GITHUB_TOKEN=${REDACTED} npx srv`,
    );
    expect(maskCommand('npx')).toBe('npx');
    expect(maskCommand(42)).toBe(REDACTED);
  });
});
