export const nowIso = (): string => new Date().toISOString();

export function describeError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
