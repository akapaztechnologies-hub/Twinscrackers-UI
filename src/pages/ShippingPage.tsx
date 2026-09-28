import { PolicyContentPage } from '@/components/organisms/PolicyContentPage.tsx';
import { useSiteStore } from '@/store/site.ts';

/**
 * The shop's shipping policy, or the shared starter text until it writes one.
 *
 * The starter text quotes no prices or delivery times: those are in Settings ->
 * Shipping and shown at checkout, which is the one place they are always right.
 */
export function ShippingPage() {
  const siteName = useSiteStore((s) => s.config.name);
  return (
    <PolicyContentPage
      type="shipping"
      seoDescription={`${siteName} shipping policy — how your order reaches you, and how to follow it.`}
      canonical="/shipping"
    />
  );
}
