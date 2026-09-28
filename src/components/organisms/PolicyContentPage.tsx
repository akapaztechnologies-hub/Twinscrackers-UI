import { useEffect, useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import { getIcon, unwrapData } from '@/lib/content.ts';
import { PolicyLayout, type PolicySection } from '@/components/atoms/PolicyLayout.tsx';
import { SafeHtml } from '@/components/atoms/SafeHtml.tsx';
import { SEO } from '@/components/SEO.tsx';
import { useSiteStore } from '@/store/site.ts';
import api from '@/lib/api.ts';
import { defaultPolicy, fillPolicySection, type PolicyPageContent, type PolicyType } from '@/components/policyDefaults.ts';

/**
 * One policy page — Shipping, Returns, Terms or Privacy — as the shop wrote it
 * in Admin -> Content -> Policies, or the shared starter text until it has.
 *
 * The four pages were four copies of this logic, each with its own built-in
 * text full of another shop's promises. They now share one loader and one
 * starter text (see policyDefaults), which is also what the admin editor opens
 * with, so a shop that has not written its policies publishes nothing it
 * would have to stand behind.
 */
export function PolicyContentPage({
  type,
  seoDescription,
  canonical,
}: {
  type: PolicyType;
  seoDescription: string;
  canonical: string;
}) {
  const siteConfig = useSiteStore((s) => s.config);
  const [saved, setSaved] = useState<PolicyPageContent | null>(null);

  useEffect(() => {
    let cancelled = false;
    (api.get('/content/policy-pages') as Promise<unknown>)
      .then((res) => {
        const pages = unwrapData<Record<string, PolicyPageContent> | null>(res);
        if (!cancelled && pages?.[type]) setSaved(pages[type]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [type]);

  const { name } = siteConfig;
  const { email, phone, address } = siteConfig.contact;
  const company = useMemo(() => ({ name, email, phone, address }), [name, email, phone, address]);
  const fallback = useMemo(() => defaultPolicy(type, company), [type, company]);

  const sections = useMemo<PolicySection[]>(
    () =>
      // Saved text is filled too: a policy saved from the starter text while a
      // Company Info field was blank still carries that `{{token}}`.
      (saved?.sections?.length ? saved.sections.map((s) => fillPolicySection(s, company)) : fallback.sections).map(
        (s) => ({
          id: s.id,
          title: s.title,
          summary: s.summary,
          icon: getIcon(s.icon, FileText),
          content: (
            <SafeHtml html={s.content} className="prose dark:prose-invert max-w-none text-surface-600 dark:text-surface-400" />
          ),
        }),
      ),
    [saved, fallback, company],
  );

  const title = saved?.title || fallback.title;

  return (
    <>
      <SEO title={title} description={seoDescription} canonical={canonical} />
      <PolicyLayout
        title={title}
        eyebrow={saved?.eyebrow || fallback.eyebrow}
        description={saved?.description || fallback.description}
        // No made-up date: the line is shown only once the shop has saved one.
        lastUpdated={saved?.lastUpdated || ''}
        sections={sections}
      />
    </>
  );
}
