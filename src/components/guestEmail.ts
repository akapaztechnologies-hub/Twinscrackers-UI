/**
 * The address to show or use for a signed-in customer — never a guest placeholder.
 *
 * A guest checkout attaches the order to a passwordless customer record, and
 * the User model needs a unique email, so the server fills one in as
 * `guest.<phone>@guest.invalid` when the guest gave none (a reserved domain that
 * can never receive mail). It is a database filler, not the customer's address:
 * shown on screen it confuses them, prefilled at checkout it becomes the address
 * their receipt goes to, and used for a back-in-stock alert it silently promises
 * an email that can never arrive. Every storefront read goes through here.
 */
const PLACEHOLDER_DOMAIN = '@guest.invalid';

export function realEmail(email: string | null | undefined): string {
  const value = (email ?? '').trim();
  return value.toLowerCase().endsWith(PLACEHOLDER_DOMAIN) ? '' : value;
}
