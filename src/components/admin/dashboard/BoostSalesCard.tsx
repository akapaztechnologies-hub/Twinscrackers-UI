import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';

/**
 * Decorative promo card. Carries no business figures by design — nothing here
 * is derived from store data, so there is nothing that could misreport it.
 */
export function BoostSalesCard() {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-red-800 via-red-700 to-red-900 p-5 text-white shadow-sm shadow-red-900/20">
      {/* Firework flourish — soft glows plus a spark burst, purely decorative. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-10 -right-8 w-32 h-32 rounded-full bg-amber-300/20 blur-2xl" />
        <div className="absolute -bottom-6 -right-10 w-24 h-24 rounded-full bg-red-400/25 blur-2xl" />
        <svg
          viewBox="0 0 100 100"
          className="absolute -top-2 right-2 w-28 h-28 text-amber-200/30"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <circle cx="50" cy="50" r="3" fill="currentColor" stroke="none" />
          <path d="M50 44V26M50 56v18M44 50H26M56 50h18M45 45L32 32M55 45l13-13M45 55L32 68M55 55l13 13" />
          <circle cx="50" cy="22" r="1.8" fill="currentColor" stroke="none" />
          <circle cx="78" cy="50" r="1.8" fill="currentColor" stroke="none" />
          <circle cx="50" cy="78" r="1.8" fill="currentColor" stroke="none" />
          <circle cx="22" cy="50" r="1.8" fill="currentColor" stroke="none" />
        </svg>
        <Sparkles className="absolute bottom-3 right-4 w-10 h-10 text-amber-200/25" />
      </div>

      <div className="relative">
        <h3 className="font-display font-bold text-body-lg leading-snug text-white">
          Boost Your Festive Sales!
        </h3>
        <p className="mt-2 text-body-sm text-white/80 leading-relaxed">
          Add a limited-time offer or combo to move festive stock faster.
        </p>
        <p className="mt-1 text-body-sm text-white/80 leading-relaxed">
          Fresh banners keep your storefront looking festive and pull in more customers.
        </p>
        <Link
          to="/admin/combos"
          className="mt-4 inline-flex items-center justify-center px-4 py-2 rounded-lg bg-amber-400 text-red-950 text-body-sm font-semibold hover:bg-amber-300 transition-colors shadow-sm shadow-red-950/20"
        >
          Create Offer
        </Link>
      </div>
    </div>
  );
}
