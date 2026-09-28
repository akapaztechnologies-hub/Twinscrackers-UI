import { useState, useEffect, useCallback, useRef } from 'react';
import { getEnquiries, getEnquiryStats, deleteEnquiry } from '@/services/enquiries.ts';
import type { Enquiry, EnquiryStats, EnquiryType } from '@/types/admin.ts';

/** How long to wait after the last keystroke before asking the server. */
const SEARCH_DEBOUNCE_MS = 350;

/**
 * Everything the two enquiry screens do with data, in one place.
 *
 * Both lists page, filter, search and triage identically — only the columns and
 * the headline figures differ — so the contact and bulk pages are thin views
 * over this rather than two copies of the same state machine.
 *
 * Paging is server-side, unlike the expenses screen which loads everything and
 * slices in the browser. Enquiries are public submissions: their number is set
 * by how much traffic the shop gets, not by how much work the shop does, so
 * there is no size at which loading them all stays safe.
 */
export function useEnquiries(type: EnquiryType) {
  const [rows, setRows] = useState<Enquiry[]>([]);
  const [stats, setStats] = useState<EnquiryStats | null>(null);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  // Guards against a slow early request landing after a faster later one and
  // repainting the table with stale rows.
  const requestId = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  // Any change to what is being asked for starts again at page one; staying on
  // page 4 of a narrower result set shows an empty table.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, sort]);

  const fetchPage = useCallback(async () => {
    const id = ++requestId.current;
    setIsLoading(true);
    try {
      const result = await getEnquiries({
        type,
        status: statusFilter,
        search: debouncedSearch,
        sort,
        page,
        limit,
      });
      if (id !== requestId.current) return;
      setRows(result.data);
      setTotal(result.total);
      setError('');
    } catch (err) {
      if (id !== requestId.current) return;
      setRows([]);
      setTotal(0);
      setError(err instanceof Error ? err.message : 'Could not load enquiries.');
    } finally {
      if (id === requestId.current) setIsLoading(false);
    }
  }, [type, statusFilter, debouncedSearch, sort, page, limit]);

  const fetchStats = useCallback(async () => {
    try {
      setStats(await getEnquiryStats(type));
    } catch {
      // The KPI cards are a nicety; the table below them is the screen. Failing
      // to count must not blank the page.
      setStats(null);
    }
  }, [type]);

  useEffect(() => {
    fetchPage();
  }, [fetchPage]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  /** Fold a saved row back into the table without refetching the whole page. */
  const applySaved = useCallback(
    (saved: Enquiry) => {
      setRows((prev) => prev.map((r) => (r.id === saved.id ? saved : r)));
      // The status counts almost certainly moved, and they are cheap to redo.
      fetchStats();
    },
    [fetchStats],
  );

  const remove = useCallback(
    async (id: string) => {
      await deleteEnquiry(id);
      const remaining = rows.filter((r) => r.id !== id);
      setRows(remaining);
      setTotal((t) => Math.max(0, t - 1));
      fetchStats();
      // Deleting the last row of a page would otherwise leave an empty table
      // with the pager still pointing past the end. Stepping back re-runs the
      // fetch through the `page` dependency below.
      if (remaining.length === 0 && page > 1) setPage(page - 1);
    },
    [rows, fetchStats, page],
  );

  const hasActiveNarrowing = Boolean(debouncedSearch) || statusFilter !== 'all';

  return {
    rows,
    stats,
    total,
    isLoading,
    error,
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    sort,
    setSort,
    page,
    setPage,
    limit,
    setLimit,
    hasActiveNarrowing,
    applySaved,
    remove,
    refresh: fetchPage,
  };
}
