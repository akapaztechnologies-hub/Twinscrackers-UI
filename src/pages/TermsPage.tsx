import { PolicyContentPage } from '@/components/organisms/PolicyContentPage.tsx';
import { useSiteStore } from '@/store/site.ts';

/** The shop's terms of service, or the shared starter text until it writes its own. */
export function TermsPage() {
  const siteName = useSiteStore((s) => s.config.name);
  return (
    <PolicyContentPage
      type="terms"
      seoDescription={`${siteName} terms of service. Read our policies on eligibility, ordering, payments, shipping, and usage of our website and services.`}
      canonical="/terms"
    />
  );
}
