import { PolicyContentPage } from '@/components/organisms/PolicyContentPage.tsx';
import { useSiteStore } from '@/store/site.ts';

/** The shop's privacy policy, or the shared starter text until it writes one. */
export function PrivacyPage() {
  const siteName = useSiteStore((s) => s.config.name);
  return (
    <PolicyContentPage
      type="privacy"
      seoDescription={`${siteName} privacy policy. Learn how we collect, use, and protect your personal information when you use our website and services.`}
      canonical="/privacy"
    />
  );
}
