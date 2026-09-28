/**
 * Shared field validators.
 *
 * The phone rule was already enforced at checkout (`CheckoutPage.tsx`) and, in a
 * stricter bare-10-digit form, at the billing counter. It is lifted here so every
 * form that takes a phone number agrees on what a valid one looks like, instead
 * of each screen inventing its own regex — or, as on the account Profile page,
 * accepting anything at all.
 */

/**
 * Indian mobile number: ten digits starting 6-9, optionally prefixed with +91,
 * 91 or a leading 0. Spaces and hyphens are stripped before testing, so
 * "98765 43210" and "+91-98765-43210" both pass.
 */
const INDIAN_MOBILE = /^(?:\+?91|0)?[6-9]\d{9}$/;

/** Strip the separators people type, leaving digits and a leading +. */
export function normalizePhone(value: string): string {
  return value.replace(/[\s-()]/g, '').trim();
}

export function isValidPhone(value: string): boolean {
  return INDIAN_MOBILE.test(normalizePhone(value));
}

/**
 * The ten significant digits, for storing a number in one consistent shape.
 *
 * A prefix is only a prefix when ten digits follow it: 9123456789 is itself a
 * mobile number, and stripping its leading "91" would store eight digits.
 */
export function toTenDigitPhone(value: string): string {
  const digits = normalizePhone(value);
  const match = /^(?:\+?91|0)(\d{10})$/.exec(digits);
  return match ? match[1] : digits;
}

/**
 * Deliberately not RFC 5322 — that regex accepts addresses no mail server here
 * would ever deliver to. This catches the mistakes people actually make: a
 * missing @, a missing dot, trailing punctuation, internal spaces.
 */
const EMAIL = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

export function isValidEmail(value: string): boolean {
  return EMAIL.test(value.trim());
}

export const PHONE_ERROR = 'Enter a valid 10-digit mobile number';
export const EMAIL_ERROR = 'Enter a valid email address';
