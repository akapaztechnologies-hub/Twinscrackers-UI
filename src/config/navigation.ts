import type { NavLink } from '@/types/index.ts';

export const mainNavLinks: NavLink[] = [
  {
    label: 'Shop',
    href: '/shop',
    children: [
      { label: 'All Products', href: '/shop' },
      { label: 'Aerial Shells', href: '/shop?category=aerial' },
      { label: 'Rockets', href: '/shop?category=rockets' },
      { label: 'Sparklers', href: '/shop?category=sparklers' },
      { label: 'Fountains', href: '/shop?category=fountains' },
      { label: 'Roman Candles', href: '/shop?category=roman-candles' },
      { label: 'Ground Effects', href: '/shop?category=ground' },
      { label: 'Combo Packs', href: '/combo-packs' },
    ],
  },
  {
    label: 'Collections',
    href: '/shop',
    children: [
      { label: 'Diwali Special', href: '/shop?occasion=diwali' },
      { label: 'New Year Bash', href: '/shop?occasion=new-year' },
      { label: 'Wedding Celebrations', href: '/shop?occasion=wedding' },
      { label: 'Birthday Packs', href: '/shop?occasion=birthday' },
      { label: 'Professional Grade', href: '/shop?occasion=professional' },
    ],
  },
  { label: 'Quick Order', href: '/quick-order', highlight: true },
  { label: 'Combos', href: '/combo-packs' },
  { label: 'About', href: '/about' },
];

export const footerLinks = {
  shop: [
    { label: 'All Products', href: '/shop' },
    { label: 'Aerial Shells', href: '/shop?category=aerial' },
    { label: 'Rockets', href: '/shop?category=rockets' },
    { label: 'Sparklers', href: '/shop?category=sparklers' },
    { label: 'Combo Packs', href: '/shop?category=combo-packs' },
    { label: 'Combo Packs', href: '/combo-packs' },
  ],
  occasions: [
    { label: 'Diwali Collection', href: '/shop?occasion=diwali' },
    { label: 'New Year Special', href: '/shop?occasion=new-year' },
    { label: 'Wedding Fireworks', href: '/shop?occasion=wedding' },
    { label: 'Birthday Packs', href: '/shop?occasion=birthday' },
    { label: 'Festival Essentials', href: '/shop?occasion=festival' },
  ],
  company: [
    { label: 'About Us', href: '/about' },
    { label: 'Safety Guidelines', href: '/safety' },
    { label: 'Shipping Policy', href: '/shipping' },
    { label: 'Return Policy', href: '/returns' },
    { label: 'Contact Us', href: '/contact' },
  ],
  support: [
    { label: 'FAQ', href: '/faq' },
    { label: 'Track Order', href: '/track-order' },
    { label: 'Bulk Orders', href: '/bulk-orders' },
    { label: 'Terms of Service', href: '/terms' },
    { label: 'Privacy Policy', href: '/privacy' },
  ],
};
