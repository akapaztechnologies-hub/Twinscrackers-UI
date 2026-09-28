import { useState, useEffect } from 'react';
import { Container } from '@/components/atoms/Container.tsx';
import { TrustBadge } from '@/components/molecules/TrustBadge.tsx';
import { useSiteStore } from '@/store/site.ts';
import api from '@/lib/api.ts';

interface TrustBadgeData {
  label: string;
  value: string;
}

export function TrustBar() {
  const siteConfig = useSiteStore(s => s.config);
  const [badges, setBadges] = useState<TrustBadgeData[]>([...siteConfig.trustBadges]);

  useEffect(() => {
    (api.get('/content/homepage-sections') as Promise<Record<string, unknown> | null>)
      .then((result) => {
        if (!result) return;
        const data = (result.data || result) as Record<string, unknown>;
        if (data && Array.isArray(data.trustBadges)) {
          setBadges(data.trustBadges as TrustBadgeData[]);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <section className="py-8 bg-white dark:bg-surface-900 border-y border-surface-200 dark:border-surface-800">
      <Container size="wide">
        <div className="grid grid-cols-2 lg:grid-cols-4">
          {badges.map((badge, i) => (
            <TrustBadge key={badge.label} label={badge.label} value={badge.value} index={i} />
          ))}
        </div>
      </Container>
    </section>
  );
}
