export type SeedStage =
  | 'input validation'
  | 'account hashing'
  | 'database configuration'
  | 'transaction acquisition'
  | 'project creation'
  | 'project lock'
  | 'project settings'
  | 'zones'
  | 'blocks'
  | 'work packages'
  | 'activities'
  | 'initial account locks'
  | 'initial account PIN uniqueness'
  | 'initial account lookup'
  | 'initial administrator upsert'
  | 'initial supervisor upsert'
  | 'initial account session revocation'
  | 'initial account audit creation'
  | 'transaction commit'
  | 'database disconnect';

const messages: Record<string, string> = {
  INVALID_INPUT:
    'Provide a secret of at least 32 characters and distinct three-digit initialization PINs.',
  INVALID_DATABASE_CONFIG: 'Provide a PostgreSQL connection URL privately.',
  PIN_CONFLICT:
    'An initialization PIN belongs to another account; no changes were committed.',
  P1000:
    'Database authentication failed; check the connection credentials privately.',
  P1001: 'Database server could not be reached.',
  P1002: 'Database connection timed out.',
  P1003: 'The configured database does not exist.',
  P1010: 'Database access was denied.',
  P1011:
    'TLS connection failed; verify the server certificate and SSL configuration.',
  P1012:
    'Prisma configuration validation failed; regenerate the client and verify configuration.',
  P1013: 'The database connection configuration is invalid.',
  P1017: 'The database closed the connection.',
  P2002:
    'A unique constraint was violated; verify initial account PIN uniqueness.',
  P2003: 'A required parent record is missing (foreign key constraint).',
  P2004: 'A database integrity constraint rejected the seed.',
  P2010: 'A raw database query failed.',
  P2021:
    'A required table is missing; verify migration status and the selected database/schema.',
  P2022:
    'A required column is missing; verify migration status and regenerate the client.',
  P2024: 'Timed out acquiring a database connection.',
  P2028:
    'The transaction could not start or expired; check database latency and lock contention.',
  P2034: 'Transaction conflict or deadlock; retry initialization.',
  '23505':
    'A unique constraint was violated; verify initial account PIN uniqueness.',
  '23503': 'A required parent record is missing (foreign key constraint).',
  '23514': 'A database integrity constraint rejected the seed.',
  '23502': 'A required field was missing.',
  '28P01':
    'Database authentication failed; check the connection credentials privately.',
  '28000': 'Database authorization failed.',
  '42501':
    'The database account lacks permission for the initialization operation.',
  '42P01':
    'A required table is missing; verify migration status and the selected database/schema.',
  '42703':
    'A required column is missing; verify migration status and regenerate the client.',
  '40P01': 'A database deadlock occurred; retry initialization.',
  '40001': 'A serialization conflict occurred; retry initialization.',
  '55P03': 'Timed out waiting for a database lock.',
  '57014':
    'The database canceled a query (statement timeout or server cancellation).',
  '53300': 'The database connection limit was reached.',
  ECONNREFUSED: 'Database connection was refused.',
  ECONNRESET: 'Database connection was reset.',
  ETIMEDOUT: 'Database connection timed out.',
  ENOTFOUND: 'Database hostname could not be resolved.',
  EAI_AGAIN: 'Database DNS lookup temporarily failed.',
  TLS_ERROR:
    'TLS certificate validation failed; verify the certificate and SSL configuration.',
  CONNECTION_TIMEOUT:
    'Timed out acquiring or establishing a database connection.',
};

function diagnostics(error: unknown) {
  const codes: string[] = [];
  const seen = new Set<object>();
  const visit = (value: unknown, depth: number) => {
    if (!value || typeof value !== 'object' || depth > 6 || seen.has(value))
      return;
    seen.add(value);
    const record = value as Record<string, unknown>;
    for (const key of ['code', 'errorCode', 'originalCode']) {
      const code = record[key];
      if (
        typeof code === 'string' &&
        (/^P\d{4}$/.test(code) || Object.hasOwn(messages, code))
      )
        codes.push(code);
      else if (
        typeof code === 'string' &&
        /^(DEPTH_ZERO_SELF_SIGNED_CERT|SELF_SIGNED_CERT_IN_CHAIN|UNABLE_TO_VERIFY_LEAF_SIGNATURE|CERT_HAS_EXPIRED|ERR_TLS_CERT_ALTNAME_INVALID|UNABLE_TO_GET_ISSUER_CERT_LOCALLY)$/.test(
          code,
        )
      )
        codes.push('TLS_ERROR');
    }
    // Classify known pg errors, but NEVER interpolate their message, stack,
    // metadata, query or arguments. Redaction alone cannot safely cover all PINs.
    if (
      typeof record.message === 'string' &&
      /timeout exceeded when trying to connect|Connection terminated due to connection timeout/i.test(
        record.message,
      )
    )
      codes.push('CONNECTION_TIMEOUT');
    for (const key of ['cause', 'meta', 'driverAdapterError', 'error'])
      visit(record[key], depth + 1);
  };
  visit(error, 0);
  return [...new Set(codes)];
}

export class SeedError extends Error {
  readonly codes: readonly string[];
  constructor(
    readonly stage: SeedStage,
    error?: unknown,
    reason?: 'INVALID_INPUT' | 'PIN_CONFLICT' | 'INVALID_DATABASE_CONFIG',
  ) {
    const codes = reason ? [reason] : diagnostics(error);
    const details = codes.map((code) => messages[code]).filter(Boolean);
    super(
      [...new Set(details)].join(' ') ||
        'Database initialization failed; no safe driver detail is available. Verify connectivity, schema and generated client.',
    );
    this.name = 'SeedError';
    this.codes = codes;
  }
}

export function formatSeedError(error: SeedError): string {
  return `Initialization failed. Stage: ${error.stage}. Code: ${error.codes.join(', ') || 'unavailable'}. ${error.message}`;
}
