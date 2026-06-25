const SLUG_ID_RE = /^[a-z0-9][a-z0-9._-]{1,63}$/i;
const EMAIL_ID_RE = /^[a-z0-9._%+-]{1,64}@[a-z0-9.-]{1,190}\.[a-z]{2,24}$/i;

export function isValidUserId(value: string): boolean {
  const id = value.trim();
  return SLUG_ID_RE.test(id) || (id.length <= 254 && EMAIL_ID_RE.test(id));
}

export function isValidSlugId(value: string): boolean {
  return SLUG_ID_RE.test(value.trim());
}
