import { Outlet } from 'react-router-dom';
import { Navbar } from '@/components/organisms/Navbar.tsx';
import { Footer } from '@/components/organisms/Footer.tsx';
import { CartDrawer } from '@/components/organisms/CartDrawer.tsx';
import { ScrollToTop } from '@/components/atoms/ScrollToTop.tsx';
import { WhatsAppButton } from '@/components/atoms/WhatsAppButton.tsx';
import { QuickOrderFAB } from '@/components/atoms/QuickOrderFAB.tsx';
import { MobileTabBar } from '@/components/organisms/MobileTabBar.tsx';
import { NewComboModal } from '@/components/atoms/NewComboModal.tsx';
import { RouteErrorBoundary } from '@/AppErrorBoundary.tsx';

export function MainLayout() {
  return (
    <div className="flex flex-col min-h-screen">
      <ScrollToTop />
      <Navbar />
      {/* Offset content by the announcement bar's height so no page's top hides behind the fixed header. */}
      <main className="flex-1" style={{ paddingTop: 'var(--announcement-h, 0px)' }}>
        <RouteErrorBoundary>
          <Outlet />
        </RouteErrorBoundary>
      </main>
      {/* The mobile tab bar is fixed over the bottom of the viewport, so the
          page has to end above it or its last row is untappable. The bar
          measures itself and publishes `--tab-bar-h`; it is 0 on desktop and on
          the pages the bar hides from. */}
      <div style={{ paddingBottom: 'var(--tab-bar-h, 0px)' }}>
        <Footer />
      </div>
      <CartDrawer />
      <WhatsAppButton />
      <QuickOrderFAB />
      <MobileTabBar />
      <NewComboModal />
    </div>
  );
}
