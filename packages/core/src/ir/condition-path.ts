/**
 * ADR-050: a policy's `when` field may be a path into the trigger event's payload. Only `<field>.kind`,
 * the discriminator of a tagged union field (ADR-049 D3), is valid (V56); the IR keeps the path as written.
 */

/** The property that holds a union value's variant name (ADR-049 D3). */
export const UNION_DISCRIMINATOR = 'kind';

/** `decision.kind` is `{ field: 'decision', path: ['kind'] }`; a field with no dot has an empty path. */
export function conditionPath(written: string): { field: string; path: string[] } {
  const [field = '', ...path] = written.split('.');
  return { field, path };
}
