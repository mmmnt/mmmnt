import { createHash } from 'node:crypto';

/** The UUID-shaped string form: 8-4-4-4-12 hex digits. */
export const UUID_FORM = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The version 5 style UUID derive samples for a UUID field of this name, built here on its own. */
export function expectedSampleUuid(name: string): string {
  const hex = createHash('sha1').update(`moment:sample:${name}`).digest('hex').slice(0, 32);
  const version = '5' + hex.slice(13, 16);
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16) + hex.slice(17, 20);
  return [hex.slice(0, 8), hex.slice(8, 12), version, variant, hex.slice(20, 32)].join('-');
}
