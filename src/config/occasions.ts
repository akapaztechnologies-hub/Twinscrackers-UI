import type { ProductOccasion } from '@/types/index.ts';

export interface OccasionDef {
  slug: ProductOccasion;
  label: string;
}

/**
 * Single source of truth for shop "occasions" (the Collections menu / occasion filters).
 * Occasions are a fixed set with no admin-management page yet, so centralizing them here
 * keeps the navbar, footer, and product form perfectly in sync instead of drifting apart.
 * (To make occasions fully admin-managed, add an Occasions resource + API and source this from it.)
 */
export const OCCASIONS: OccasionDef[] = [
  { slug: 'diwali', label: 'Diwali Special' },
  { slug: 'new-year', label: 'New Year' },
  { slug: 'wedding', label: 'Wedding' },
  { slug: 'birthday', label: 'Birthday' },
  { slug: 'festival', label: 'Festival Essentials' },
  { slug: 'professional', label: 'Professional Grade' },
];
