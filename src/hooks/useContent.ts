import { useEffect, useState } from 'react';
import api from '@/lib/api.ts';

/**
 * Fetch an admin-editable content section (GET /content/:sectionId) and shallow-merge
 * it over the supplied defaults, so a storefront component always has a complete object
 * even before the request resolves or if the admin hasn't saved that section yet.
 *
 * The backend content store is generic — any sectionId works with no backend change.
 */
export function useContentSection<T extends Record<string, unknown>>(
  sectionId: string,
  defaults: T,
): T {
  const [data, setData] = useState<T>(defaults);

  useEffect(() => {
    let cancelled = false;
    (api.get(`/content/${sectionId}`) as Promise<Record<string, unknown> | null>)
      .then((result) => {
        if (cancelled || !result) return;
        const fetched = (result.data ?? result) as Partial<T>;
        if (fetched && typeof fetched === 'object') {
          setData({ ...defaults, ...fetched });
        }
      })
      .catch(() => {
        /* keep defaults on failure */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionId]);

  return data;
}
