import { create } from 'zustand';

const PIN_KEY = 'ak_admin_sidebar_pinned';

/** Sidebar starts pinned (open + static) unless the user previously unpinned it. */
function loadPinned(): boolean {
  try {
    const raw = localStorage.getItem(PIN_KEY);
    return raw === null ? true : raw === 'true';
  } catch {
    return true;
  }
}

function persistPinned(pinned: boolean) {
  try {
    localStorage.setItem(PIN_KEY, String(pinned));
  } catch {
    /* ignore */
  }
}

interface AdminState {
  sidebarOpen: boolean;
  /**
   * Pinned = sidebar stays open and static (pushes content). Unpinned = it
   * collapses to an icon rail and expands on hover/focus. Persisted.
   */
  sidebarPinned: boolean;
  mobileSidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarPinned: (pinned: boolean) => void;
  toggleSidebarPinned: () => void;
  setMobileSidebarOpen: (open: boolean) => void;
}

export const useAdminStore = create<AdminState>()((set) => ({
  sidebarOpen: true,
  sidebarPinned: loadPinned(),
  mobileSidebarOpen: false,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setSidebarPinned: (sidebarPinned) => {
    persistPinned(sidebarPinned);
    set({ sidebarPinned });
  },
  toggleSidebarPinned: () =>
    set((s) => {
      const next = !s.sidebarPinned;
      persistPinned(next);
      return { sidebarPinned: next };
    }),
  setMobileSidebarOpen: (mobileSidebarOpen) => set({ mobileSidebarOpen }),
}));
