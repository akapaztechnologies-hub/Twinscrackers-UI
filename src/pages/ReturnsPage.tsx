import { PolicyContentPage } from '@/components/organisms/PolicyContentPage.tsx';
import { useSiteStore } from '@/store/site.ts';

/** The shop's return policy, or the shared starter text until it writes one. */
export function ReturnsPage() {
  const siteName = useSiteStore((s) => s.config.name);
  return (
    <PolicyContentPage
      type="returns"
      seoDescription={`${siteName} return policy. What to do if something is wrong with your order.`}
      canonical="/returns"
    />
  );
}
