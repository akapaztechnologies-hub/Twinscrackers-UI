import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import { MainLayout } from '@/layouts/MainLayout.tsx';
import { AuthLayout } from '@/layouts/AuthLayout.tsx';
import { ProtectedRoute } from '@/components/atoms/ProtectedRoute.tsx';
import { PageViewTracker } from '@/components/atoms/PageViewTracker.tsx';
import { useAuthListener } from '@/hooks/useAuth.ts';
import { useSiteStore } from '@/store/site.ts';
import { logoSrc } from '@/lib/logoAssets.ts';
import { HomePage } from '@/pages/HomePage.tsx';
import { AppErrorBoundary } from '@/AppErrorBoundary.tsx';

// Lazy load all non-home pages for optimal code splitting
const ShopPage = lazy(() => import('@/pages/ShopPage.tsx').then((m) => ({ default: m.ShopPage })));
const ProductPage = lazy(() => import('@/pages/ProductPage.tsx').then((m) => ({ default: m.ProductPage })));
const ComboPacksPage = lazy(() => import('@/pages/ComboPacksPage.tsx').then((m) => ({ default: m.ComboPacksPage })));
const ComboDetailPage = lazy(() => import('@/pages/ComboDetailPage.tsx').then((m) => ({ default: m.ComboDetailPage })));
const CheckoutPage = lazy(() => import('@/pages/CheckoutPage.tsx').then((m) => ({ default: m.CheckoutPage })));
const QuickOrderPage = lazy(() => import('@/pages/QuickOrderPage.tsx').then((m) => ({ default: m.QuickOrderPage })));
const AboutPage = lazy(() => import('@/pages/AboutPage.tsx').then((m) => ({ default: m.AboutPage })));
const ContactPage = lazy(() => import('@/pages/ContactPage.tsx').then((m) => ({ default: m.ContactPage })));
const FAQPage = lazy(() => import('@/pages/FAQPage.tsx').then((m) => ({ default: m.FAQPage })));
const SafetyPage = lazy(() => import('@/pages/SafetyPage.tsx').then((m) => ({ default: m.SafetyPage })));
const TrackOrderPage = lazy(() => import('@/pages/TrackOrderPage.tsx').then((m) => ({ default: m.TrackOrderPage })));
const BulkOrdersPage = lazy(() => import('@/pages/BulkOrdersPage.tsx').then((m) => ({ default: m.BulkOrdersPage })));
const ShippingPage = lazy(() => import('@/pages/ShippingPage.tsx').then((m) => ({ default: m.ShippingPage })));
const ReturnsPage = lazy(() => import('@/pages/ReturnsPage.tsx').then((m) => ({ default: m.ReturnsPage })));
const TermsPage = lazy(() => import('@/pages/TermsPage.tsx').then((m) => ({ default: m.TermsPage })));
const PrivacyPage = lazy(() => import('@/pages/PrivacyPage.tsx').then((m) => ({ default: m.PrivacyPage })));
const OrderConfirmationPage = lazy(() => import('@/pages/OrderConfirmationPage.tsx').then((m) => ({ default: m.OrderConfirmationPage })));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage.tsx').then((m) => ({ default: m.NotFoundPage })));

// Auth pages
const LoginPage = lazy(() => import('@/pages/auth/LoginPage.tsx').then((m) => ({ default: m.LoginPage })));
const SignupPage = lazy(() => import('@/pages/auth/SignupPage.tsx').then((m) => ({ default: m.SignupPage })));
const ForgotPasswordPage = lazy(() => import('@/pages/auth/ForgotPasswordPage.tsx').then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import('@/pages/auth/ResetPasswordPage.tsx').then((m) => ({ default: m.ResetPasswordPage })));
const OAuthCallbackPage = lazy(() => import('@/pages/auth/OAuthCallbackPage.tsx').then((m) => ({ default: m.OAuthCallbackPage })));
const ClaimAccountPage = lazy(() => import('@/pages/auth/ClaimAccountPage.tsx').then((m) => ({ default: m.ClaimAccountPage })));

// Account pages
const AccountLayout = lazy(() => import('@/layouts/AccountLayout.tsx').then((m) => ({ default: m.AccountLayout })));
const AccountDashboardPage = lazy(() => import('@/pages/account/AccountDashboardPage.tsx').then((m) => ({ default: m.AccountDashboardPage })));
const ProfilePage = lazy(() => import('@/pages/account/ProfilePage.tsx').then((m) => ({ default: m.ProfilePage })));
const OrdersPage = lazy(() => import('@/pages/account/OrdersPage.tsx').then((m) => ({ default: m.OrdersPage })));
const OrderDetailPage = lazy(() => import('@/pages/account/OrderDetailPage.tsx').then((m) => ({ default: m.OrderDetailPage })));
const AddressBookPage = lazy(() => import('@/pages/account/AddressBookPage.tsx').then((m) => ({ default: m.AddressBookPage })));
const SecurityPage = lazy(() => import('@/pages/account/SecurityPage.tsx').then((m) => ({ default: m.SecurityPage })));
const WishlistPage = lazy(() => import('@/pages/account/WishlistPage.tsx').then((m) => ({ default: m.WishlistPage })));
const NotificationsPage = lazy(() => import('@/pages/account/NotificationsPage.tsx').then((m) => ({ default: m.NotificationsPage })));

// Admin pages (lazy-loaded — zero impact on customer bundle)
const AdminRoute = lazy(() => import('@/components/atoms/AdminRoute.tsx').then((m) => ({ default: m.AdminRoute })));
const AdminLayout = lazy(() => import('@/layouts/AdminLayout.tsx').then((m) => ({ default: m.AdminLayout })));
const ScreenGuard = lazy(() => import('@/components/atoms/ScreenGuard.tsx').then((m) => ({ default: m.ScreenGuard })));
const AdminDashboardPage = lazy(() => import('@/pages/admin/AdminDashboardPage.tsx').then((m) => ({ default: m.AdminDashboardPage })));
const AdminOrdersPage = lazy(() => import('@/pages/admin/AdminOrdersPage.tsx').then((m) => ({ default: m.AdminOrdersPage })));
const AdminPaymentVerificationPage = lazy(() => import('@/pages/admin/AdminPaymentVerificationPage.tsx').then((m) => ({ default: m.AdminPaymentVerificationPage })));
const AdminOrderDetailPage = lazy(() => import('@/pages/admin/AdminOrderDetailPage.tsx').then((m) => ({ default: m.AdminOrderDetailPage })));
const AdminProductsPage = lazy(() => import('@/pages/admin/AdminProductsPage.tsx').then((m) => ({ default: m.AdminProductsPage })));
const AdminProductFormPage = lazy(() => import('@/pages/admin/AdminProductFormPage.tsx').then((m) => ({ default: m.AdminProductFormPage })));
const AdminCombosPage = lazy(() => import('@/pages/admin/AdminCombosPage.tsx').then((m) => ({ default: m.AdminCombosPage })));
const AdminComboFormPage = lazy(() => import('@/pages/admin/AdminComboFormPage.tsx').then((m) => ({ default: m.AdminComboFormPage })));
const AdminCustomersPage = lazy(() => import('@/pages/admin/AdminCustomersPage.tsx').then((m) => ({ default: m.AdminCustomersPage })));
const AdminCreditPage = lazy(() => import('@/pages/admin/AdminCreditPage.tsx').then((m) => ({ default: m.AdminCreditPage })));
const AdminCustomerDetailPage = lazy(() => import('@/pages/admin/AdminCustomerDetailPage.tsx').then((m) => ({ default: m.AdminCustomerDetailPage })));
const AdminCategoriesPage = lazy(() => import('@/pages/admin/AdminCategoriesPage.tsx').then((m) => ({ default: m.AdminCategoriesPage })));
const AdminInventoryPage = lazy(() => import('@/pages/admin/AdminInventoryPage.tsx').then((m) => ({ default: m.AdminInventoryPage })));
const AdminReviewsPage = lazy(() => import('@/pages/admin/AdminReviewsPage.tsx').then((m) => ({ default: m.AdminReviewsPage })));
const AdminNewsletterPage = lazy(() => import('@/pages/admin/AdminNewsletterPage.tsx').then((m) => ({ default: m.AdminNewsletterPage })));
const AdminPriceListPage = lazy(() => import('@/pages/admin/AdminPriceListPage.tsx').then((m) => ({ default: m.AdminPriceListPage })));
const AdminSuppliersPage = lazy(() => import('@/pages/admin/AdminSuppliersPage.tsx').then((m) => ({ default: m.AdminSuppliersPage })));
const AdminExpensesPage = lazy(() => import('@/pages/admin/AdminExpensesPage.tsx').then((m) => ({ default: m.AdminExpensesPage })));
const AdminCouponsPage = lazy(() => import('@/pages/admin/AdminCouponsPage.tsx').then((m) => ({ default: m.AdminCouponsPage })));
const AdminCouponDetailPage = lazy(() => import('@/pages/admin/AdminCouponDetailPage.tsx').then((m) => ({ default: m.AdminCouponDetailPage })));
const AdminInfluencersPage = lazy(() => import('@/pages/admin/AdminInfluencersPage.tsx').then((m) => ({ default: m.AdminInfluencersPage })));
const AdminInfluencerDetailPage = lazy(() => import('@/pages/admin/AdminInfluencerDetailPage.tsx').then((m) => ({ default: m.AdminInfluencerDetailPage })));
const AdminMonthlyReportPage = lazy(() => import('@/pages/admin/AdminMonthlyReportPage.tsx').then((m) => ({ default: m.AdminMonthlyReportPage })));
const AdminAnalyticsPage = lazy(() => import('@/pages/admin/AdminAnalyticsPage.tsx').then((m) => ({ default: m.AdminAnalyticsPage })));
const AdminProductsAnalyticsPage = lazy(() => import('@/pages/admin/AdminProductsAnalyticsPage.tsx').then((m) => ({ default: m.AdminProductsAnalyticsPage })));
const AdminContentPage = lazy(() => import('@/pages/admin/AdminContentPage.tsx').then((m) => ({ default: m.AdminContentPage })));
const AdminSettingsPage = lazy(() => import('@/pages/admin/AdminSettingsPage.tsx').then((m) => ({ default: m.AdminSettingsPage })));
const AdminProfilePage = lazy(() => import('@/pages/admin/AdminProfilePage.tsx').then((m) => ({ default: m.AdminProfilePage })));
const AdminEmployeesPage = lazy(() => import('@/pages/admin/AdminEmployeesPage.tsx').then((m) => ({ default: m.AdminEmployeesPage })));
const AdminRolesPage = lazy(() => import('@/pages/admin/AdminRolesPage.tsx').then((m) => ({ default: m.AdminRolesPage })));
const AdminBillingPage = lazy(() => import('@/pages/admin/AdminBillingPage.tsx').then((m) => ({ default: m.AdminBillingPage })));
const AdminBillsPage = lazy(() => import('@/pages/admin/AdminBillsPage.tsx').then((m) => ({ default: m.AdminBillsPage })));
const AdminQuotationsPage = lazy(() => import('@/pages/admin/AdminQuotationsPage.tsx').then((m) => ({ default: m.AdminQuotationsPage })));
const AdminDeliveryPointsPage = lazy(() => import('@/pages/admin/AdminDeliveryPointsPage.tsx').then((m) => ({ default: m.AdminDeliveryPointsPage })));
const AdminQuotationLayoutPage = lazy(() => import('@/pages/admin/AdminQuotationLayoutPage.tsx').then((m) => ({ default: m.AdminQuotationLayoutPage })));
const AdminBillDetailPage = lazy(() => import('@/pages/admin/AdminBillDetailPage.tsx').then((m) => ({ default: m.AdminBillDetailPage })));
const AdminCaseInvoicePage = lazy(() => import('@/pages/admin/AdminCaseInvoicePage.tsx').then((m) => ({ default: m.AdminCaseInvoicePage })));
const AdminFactoryBillPage = lazy(() => import('@/pages/admin/AdminFactoryBillPage.tsx').then((m) => ({ default: m.AdminFactoryBillPage })));
const AdminFactoryProductsPage = lazy(() => import('@/pages/admin/AdminFactoryProductsPage.tsx').then((m) => ({ default: m.AdminFactoryProductsPage })));
const AdminFactoryBillsPage = lazy(() => import('@/pages/admin/AdminFactoryBillsPage.tsx').then((m) => ({ default: m.AdminFactoryBillsPage })));
const AdminContactMessagesPage = lazy(() => import('@/pages/admin/AdminContactMessagesPage.tsx').then((m) => ({ default: m.AdminContactMessagesPage })));
const AdminBulkOrdersPage = lazy(() => import('@/pages/admin/AdminBulkOrdersPage.tsx').then((m) => ({ default: m.AdminBulkOrdersPage })));

function PageLoader() {
  // Read once, outside the subscription: this renders during a route
  // transition and must not re-render on unrelated store writes.
  const logo = logoSrc(useSiteStore.getState().config, 'loader');
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-50 dark:bg-surface-950">
      <div className="flex flex-col items-center gap-4">
        <img src={logo || undefined} alt="" width={200} height={200} className="w-[200px] h-[200px] max-w-[70vw] object-contain" />
        <div className="w-10 h-10 rounded-full border-3 border-brand-500 border-t-transparent animate-spin" />
        <p className="text-body-sm text-surface-500 font-medium">Loading...</p>
      </div>
    </div>
  );
}

// Old /admin/users/:uid detail & edit routes are retired — redirect any lingering
// links/bookmarks to the unified customer detail page.
function RedirectUserToCustomer() {
  const { uid } = useParams();
  return <Navigate to={`/admin/customers/${uid}`} replace />;
}

export default function App() {
  useAuthListener();
  const fetchCompanyInfo = useSiteStore((s) => s.fetchCompanyInfo);

  useEffect(() => {
    fetchCompanyInfo();
  }, [fetchCompanyInfo]);

  return (
    <BrowserRouter>
      <PageViewTracker />
      <AppErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Auth pages — minimal layout */}
            <Route element={<AuthLayout />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/auth/callback" element={<OAuthCallbackPage />} />
              {/* Where a guest goes to turn their orders into an account. */}
              <Route path="/claim-account" element={<ClaimAccountPage />} />
            </Route>

            {/* Main site */}
            <Route element={<MainLayout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/shop" element={<ShopPage />} />
              <Route path="/product/:slug" element={<ProductPage />} />
              <Route path="/combo-packs" element={<ComboPacksPage />} />
              <Route path="/combo-packs/:slug" element={<ComboDetailPage />} />
              <Route path="/checkout" element={<CheckoutPage />} />
              <Route path="/order-confirmation/:orderId" element={<OrderConfirmationPage />} />
              <Route path="/quick-order" element={<QuickOrderPage />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="/contact" element={<ContactPage />} />
              <Route path="/faq" element={<FAQPage />} />
              <Route path="/safety" element={<SafetyPage />} />
              <Route path="/track-order" element={<TrackOrderPage />} />
              <Route path="/bulk-orders" element={<BulkOrdersPage />} />
              <Route path="/shipping" element={<ShippingPage />} />
              <Route path="/returns" element={<ReturnsPage />} />
              <Route path="/terms" element={<TermsPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />

              {/* Protected account routes */}
              <Route element={<ProtectedRoute />}>
                <Route path="/account" element={<AccountLayout />}>
                  <Route index element={<AccountDashboardPage />} />
                  <Route path="profile" element={<ProfilePage />} />
                  <Route path="orders" element={<OrdersPage />} />
                  <Route path="orders/:orderId" element={<OrderDetailPage />} />
                  <Route path="addresses" element={<AddressBookPage />} />
                  <Route path="security" element={<SecurityPage />} />
                  <Route path="wishlist" element={<WishlistPage />} />
                  <Route path="notifications" element={<NotificationsPage />} />
                </Route>
              </Route>

              {/* 404 — catch all unmatched routes */}
              <Route path="*" element={<NotFoundPage />} />
            </Route>

            {/* Admin panel. AdminRoute answers "is this staff?", ScreenGuard then
                answers "may they open *this* screen?" for every route below. */}
            <Route element={<AdminRoute />}>
              <Route element={<ScreenGuard />}>
                <Route path="/admin" element={<AdminLayout />}>
                  <Route index element={<AdminDashboardPage />} />
                  <Route path="billing" element={<AdminBillingPage />} />
                  <Route path="bills" element={<AdminBillsPage />} />
                  <Route path="quotations" element={<AdminQuotationsPage />} />
                  {/* The factory bills its own traders — its own screens, sharing nothing with the shop above. */}
                  <Route path="factory" element={<AdminFactoryBillPage />} />
                  <Route path="factory/bills" element={<AdminFactoryBillsPage />} />
                  <Route path="factory/products" element={<AdminFactoryProductsPage />} />
                  <Route path="delivery-points" element={<AdminDeliveryPointsPage />} />
                  <Route path="quotations/:quotationId/layout" element={<AdminQuotationLayoutPage />} />
                  <Route path="bills/:billId" element={<AdminBillDetailPage />} />
                  <Route path="bills/:billId/case-invoice" element={<AdminCaseInvoicePage />} />
                  <Route path="orders" element={<AdminOrdersPage />} />
                  <Route path="orders/:orderId" element={<AdminOrderDetailPage />} />
                  <Route path="payment-verification" element={<AdminPaymentVerificationPage />} />
                  <Route path="contact-messages" element={<AdminContactMessagesPage />} />
                  <Route path="bulk-orders" element={<AdminBulkOrdersPage />} />
                  <Route path="products" element={<AdminProductsPage />} />
                  <Route path="products/new" element={<AdminProductFormPage />} />
                  <Route path="products/:productId/edit" element={<AdminProductFormPage />} />
                  <Route path="combos" element={<AdminCombosPage />} />
                  <Route path="combos/new" element={<AdminComboFormPage />} />
                  <Route path="combos/:comboId/edit" element={<AdminComboFormPage />} />
                  {/* Users pages retired — Customers is the single people list + detail. Old links redirect. */}
                  <Route path="users" element={<Navigate to="/admin/customers" replace />} />
                  <Route path="users/:uid" element={<RedirectUserToCustomer />} />
                  <Route path="users/:uid/edit" element={<RedirectUserToCustomer />} />
                  <Route path="customers" element={<AdminCustomersPage />} />
                  <Route path="credit" element={<AdminCreditPage />} />
                  <Route path="customers/:id" element={<AdminCustomerDetailPage />} />
                  <Route path="categories" element={<AdminCategoriesPage />} />
                  <Route path="inventory" element={<AdminInventoryPage />} />
                  <Route path="reviews" element={<AdminReviewsPage />} />
                  <Route path="newsletter" element={<AdminNewsletterPage />} />
                  <Route path="price-list" element={<AdminPriceListPage />} />
                  <Route path="suppliers" element={<AdminSuppliersPage />} />
                  <Route path="expenses" element={<AdminExpensesPage />} />
                  <Route path="coupons" element={<AdminCouponsPage />} />
                  <Route path="coupons/:couponId" element={<AdminCouponDetailPage />} />
                  <Route path="influencers" element={<AdminInfluencersPage />} />
                  <Route path="influencers/:influencerId" element={<AdminInfluencerDetailPage />} />
                  <Route path="reports/monthly" element={<AdminMonthlyReportPage />} />
                  <Route path="analytics" element={<AdminAnalyticsPage />} />
                  <Route path="analytics/products" element={<AdminProductsAnalyticsPage />} />
                  <Route path="content" element={<AdminContentPage />} />
                  <Route path="settings" element={<AdminSettingsPage />} />
                  <Route path="employees" element={<AdminEmployeesPage />} />
                  <Route path="roles" element={<AdminRolesPage />} />
                  <Route path="profile" element={<AdminProfilePage />} />
                </Route>
              </Route>
            </Route>
          </Routes>
        </Suspense>
      </AppErrorBoundary>
    </BrowserRouter>
  );
}
