import { Outlet } from 'react-router-dom';
import { AdminSidebar } from '@/components/organisms/AdminSidebar.tsx';
import { AdminTopBar } from '@/components/organisms/AdminTopBar.tsx';
import { useAdminStore } from '@/store/admin.ts';
import { useIdleSignOut } from '@/hooks/useIdleSignOut.ts';
import { RouteErrorBoundary } from '@/AppErrorBoundary.tsx';

export function AdminLayout() {
  const mobileSidebarOpen = useAdminStore((s) => s.mobileSidebarOpen);
  useIdleSignOut();

  return (
    // Pinned to the viewport rather than sized in flow: the shell then contributes
    // no document height at all, so only <main> can ever scroll. With h-screen the
    // page itself could still pick up a few stray pixels of scroll and drag the
    // sidebar and top bar out of view.
    <div className="fixed inset-0 bg-surface-50 dark:bg-surface-950 flex overflow-hidden">
      {/* Desktop sidebar — always rendered, width controlled internally */}
      <AdminSidebar />

      {/* Mobile sidebar (overlay) — only when explicitly opened */}
      {mobileSidebarOpen && <AdminSidebar mobile />}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <AdminTopBar />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 xl:p-8">
          <RouteErrorBoundary homeHref="/admin">
            <Outlet />
          </RouteErrorBoundary>
        </main>
      </div>
    </div>
  );
}
