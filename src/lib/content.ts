import * as LucideIcons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const iconMap = LucideIcons as unknown as Record<string, LucideIcon>;

/**
 * Resolve a Lucide icon for CMS-driven content. Accepts an icon name string
 * (as stored in admin content), an already-resolved icon component, or nothing,
 * and always returns a renderable component (falling back when the name is unknown).
 */
export function getIcon(
  name: string | LucideIcon | undefined | null,
  fallback: LucideIcon,
): LucideIcon {
  if (!name) return fallback;
  if (typeof name === 'string') return iconMap[name] || fallback;
  return name;
}

/**
 * Unwrap an API response that may be either the payload directly or a
 * `{ data: payload }` envelope, returning the caller-specified type.
 */
export function unwrapData<T>(res: unknown): T {
  const r = res as { data?: unknown } | null;
  return (r && typeof r === 'object' && r.data !== undefined ? r.data : res) as T;
}
