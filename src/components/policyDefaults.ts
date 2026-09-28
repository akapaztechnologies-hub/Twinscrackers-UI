/**
 * What the Shipping, Returns, Terms and Privacy pages say before the shop has
 * written its own (Admin -> Content -> Policies).
 *
 * The same starter text the admin editor opens with (`pages/admin/PoliciesTab`),
 * kept word for word so the storefront and the editor never disagree. It is a
 * copy rather than an import: storefront code does not load admin modules. If
 * one changes, change the other.
 *
 * It promises nothing a particular shop would have to stand behind. The old
 * built-in pages carried another shop's specifics — 7-day returns, "refunds in
 * 5-7 days", free delivery above ₹999, same-day delivery, a named payment
 * gateway and security audits, a court in a named city — and every shop
 * running this build published them as its own until it wrote its policies.
 *
 * {{company}} / {{email}} / {{phone}} / {{address}} are filled from Company
 * Info at render time (see `defaultPolicy`).
 */

export type PolicyType = 'shipping' | 'returns' | 'terms' | 'privacy';

export interface PolicySectionContent {
  id: string;
  /** A lucide icon name, resolved with `getIcon`. */
  icon: string;
  title: string;
  /** Plain text. */
  summary: string;
  /** HTML — always rendered through SafeHtml. */
  content: string;
}

/** A policy page as Admin -> Content saves it. */
export interface PolicyPageContent {
  title: string;
  eyebrow: string;
  description: string;
  lastUpdated: string;
  sections: PolicySectionContent[];
}

type PolicyDefault = Omit<PolicyPageContent, 'lastUpdated'>;

const DEFAULT_POLICIES: Record<PolicyType, PolicyDefault> = {
  shipping: {
    title: 'Shipping Policy',
    eyebrow: 'Logistics',
    description: 'Information about our shipping and delivery terms.',
    sections: [
      {
        id: 'shipping-options',
        icon: 'Truck',
        title: 'How Your Order Reaches You',
        summary: 'Fireworks travel by licensed transport to a parcel office near you. Charges and times are shown at checkout.',
        content: `<p>Fireworks are classed as explosives, so they cannot be sent to your door like an ordinary parcel. Your order travels by a transport line licensed to carry them, to a parcel office near you, where you collect it.</p><p>The delivery charge and the estimated time for your order are shown at checkout, before you pay.</p>`,
      },
      {
        id: 'order-processing',
        icon: 'Clock',
        title: 'Order Processing',
        summary: 'We pack your order once your payment is confirmed. It can take a little longer in the festival rush.',
        content: `<p>We start packing your order once your payment is confirmed. During the festival rush it can take a little longer — we will keep you updated.</p><p>You will receive a confirmation with your order number when you place your order, and another message when it is dispatched.</p>`,
      },
      {
        id: 'packaging',
        icon: 'Package',
        title: 'Packaging & Safety',
        summary: 'Fireworks are packed and transported under the Indian rules for carrying explosives.',
        content: `<p>Fireworks are packed in sturdy cartons, following the Indian rules for transporting explosives, and handed only to transport operators licensed to carry them.</p>`,
      },
      {
        id: 'coverage',
        icon: 'Globe',
        title: 'Delivery Coverage',
        summary: 'Enter your PIN code at checkout to see whether we can reach you.',
        content: `<p>Enter your PIN code at checkout to see whether we can deliver to you. Some states restrict transporting fireworks at certain times of the year; if your order is affected, we will contact you before sending it.</p>`,
      },
      {
        id: 'tracking',
        icon: 'Navigation',
        title: 'Tracking Your Order',
        summary: 'Follow your order on our Track Order page using your order number.',
        content: `<p>Once your order is dispatched, you can follow it on our <a href="/track-order">Track Order</a> page using your order number. Some transport lines do not publish tracking online; for those we add updates as we get them.</p>`,
      },
      {
        id: 'damaged',
        icon: 'AlertTriangle',
        title: 'Damaged or Missing Items',
        summary: 'Tell us as soon as you can, with photos, and we will look into it straight away.',
        content: `<p>If your parcel arrives damaged or something is missing, contact us as soon as you can with your order number and photos, and we will look into it straight away.</p><p>Contact: <a href="mailto:{{email}}">{{email}}</a> or call {{phone}}</p>`,
      },
    ],
  },
  returns: {
    title: 'Return Policy',
    eyebrow: 'Customer Care',
    description: 'What to do if something is wrong with your order.',
    sections: [
      {
        id: 'promise',
        icon: 'Heart',
        title: 'Our Approach',
        summary: 'Fireworks cannot be taken back for resale, but if something is wrong we will help put it right.',
        content: `<p>Fireworks are explosives, so once they have left us we cannot take them back for resale. If something is wrong with your order, talk to {{company}} and we will do our best to put it right.</p>`,
      },
      {
        id: 'eligibility',
        icon: 'CheckCircle',
        title: 'Damaged or Wrong Items',
        summary: 'Items that arrive damaged, or that we sent by mistake, are replaced or refunded.',
        content: `<p>If an item arrives damaged, or we sent you the wrong thing, contact us with your order number and photos. We will arrange a replacement or a refund for the items affected.</p>`,
      },
      {
        id: 'non-returnable',
        icon: 'XCircle',
        title: 'Non-Returnable Items',
        summary: 'Opened, used, or improperly stored products cannot be returned for safety reasons.',
        content: `<p>For safety reasons, the following cannot be returned:</p><ul><li>Products that have been opened, lit, or partly used</li><li>Products without their original packaging or labels</li><li>Products damaged by improper storage after delivery</li><li>Custom or made-to-order packages</li></ul>`,
      },
      {
        id: 'how-to-return',
        icon: 'ListOrdered',
        title: 'How to Get Help',
        summary: 'Contact us with your order number and tell us what went wrong.',
        content: `<ol><li><strong>Contact us:</strong> email {{email}} or call {{phone}} with your order number.</li><li><strong>Tell us what went wrong:</strong> send photos if something is damaged.</li><li><strong>Next steps:</strong> we will confirm what happens next — a replacement, a refund, or collecting the wrong item.</li></ol>`,
      },
      {
        id: 'refunds',
        icon: 'Clock',
        title: 'Refunds',
        summary: 'Approved refunds go back to the way you paid.',
        content: `<p>Approved refunds go back to the way you paid. How long they take to reach you depends on your bank or payment app.</p>`,
      },
      {
        id: 'exchanges',
        icon: 'Repeat',
        title: 'Exchanges',
        summary: `We don't offer direct exchanges. Contact us and place a new order for the item you want.`,
        content: `<p>We don't offer direct exchanges. If you want a different product, contact us about the original item and place a new order for the one you want.</p>`,
      },
    ],
  },
  terms: {
    title: 'Terms of Service',
    eyebrow: 'Legal',
    description: 'Terms and conditions for using our website and services.',
    sections: [
      {
        id: 'agreement',
        icon: 'Handshake',
        title: 'Agreement to Terms',
        summary: 'By using our website you agree to these terms. If you disagree, please do not use our services.',
        content: `<p>By accessing and using the {{company}} website and services, you agree to be bound by these Terms of Service. If you do not agree with any part of these terms, please do not use our website or services.</p>`,
      },
      {
        id: 'eligibility',
        icon: 'UserCheck',
        title: 'Eligibility',
        summary: 'You must be at least 18 years old to purchase fireworks from us.',
        content: `<p>You must be at least 18 years of age to purchase products from our store. By placing an order, you confirm that you meet this age requirement. Fireworks classified as "Professional Grade" may have additional age and licensing requirements as per local regulations.</p>`,
      },
      {
        id: 'products-pricing',
        icon: 'Tag',
        title: 'Products & Pricing',
        summary: 'Prices are in INR and may change without notice.',
        content: `<p>Products are sold under the Indian regulations for fireworks and pyrotechnic articles.</p><ul><li>Prices are listed in Indian Rupees (₹) and include applicable taxes unless stated otherwise.</li><li>We reserve the right to modify prices at any time without prior notice.</li><li>Product images are representative. Actual packaging and product appearance may vary slightly.</li><li>Product availability is subject to stock levels and may change without notice.</li></ul>`,
      },
      {
        id: 'orders-payment',
        icon: 'CreditCard',
        title: 'Orders & Payment',
        summary: 'Orders are confirmed once payment is verified. The ways to pay are shown at checkout.',
        content: `<p>Placing an order constitutes an offer to purchase. We reserve the right to accept or decline orders. An order is confirmed only once payment is verified and a confirmation is sent.</p><p>The payment methods available for your order are shown at checkout. Online payments are handled by our payment provider; we never see or store your full card details.</p>`,
      },
      {
        id: 'shipping',
        icon: 'Truck',
        title: 'Shipping & Delivery',
        summary: 'Delivery timelines are estimates. Delays due to weather or logistics are beyond our control.',
        content: `<p>Please refer to our <a href="/shipping">Shipping Policy</a> for detailed information on delivery timelines, packaging, and coverage. Delivery timelines are estimates and not guaranteed — delays due to weather, logistics, or regulatory factors are beyond our control.</p>`,
      },
      {
        id: 'returns',
        icon: 'RotateCcw',
        title: 'Returns & Refunds',
        summary: 'Returns are subject to our Return Policy. Check it before purchasing.',
        content: `<p>Our return and refund policies are outlined in our <a href="/returns">Return Policy</a>. By purchasing from us, you agree to the terms and conditions specified therein.</p>`,
      },
      {
        id: 'safety',
        icon: 'AlertTriangle',
        title: 'Safety & Liability',
        summary: 'Fireworks are dangerous. We are not liable for misuse or improper handling.',
        content: `<p>Fireworks are inherently hazardous products. By purchasing from {{company}}, you acknowledge that:</p><ul><li>You will use all products in accordance with the safety instructions provided on each product and on our <a href="/safety">Safety Guidelines</a> page.</li><li>You are solely responsible for ensuring you have the knowledge and ability to use the products safely.</li><li>{{company}} is not liable for injuries, property damage, or any loss resulting from misuse, improper storage, or failure to follow safety guidelines.</li><li>You will comply with all local, state, and national laws and regulations regarding fireworks use in your area.</li></ul>`,
      },
      {
        id: 'ip',
        icon: 'Copyright',
        title: 'Intellectual Property',
        summary: 'All content on this site is our property.',
        content: `<p>All content on this website — including text, images, logos, product names, and design elements — is the property of {{company}} and protected by applicable intellectual property laws. You may not reproduce, distribute, or use any content without our written permission.</p>`,
      },
      {
        id: 'liability',
        icon: 'Scale',
        title: 'Limitation of Liability',
        summary: 'Our liability is limited to the purchase price of the product.',
        content: `<p>To the maximum extent permitted by law, {{company}} shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of our website or products. Our total liability shall not exceed the amount paid by you for the specific product in question.</p>`,
      },
      {
        id: 'governing-law',
        icon: 'MapPin',
        title: 'Governing Law',
        summary: 'These terms are governed by Indian law.',
        content: `<p>These Terms of Service are governed by and construed in accordance with the laws of India. Any disputes arising from these terms shall be subject to the jurisdiction of the courts where {{company}} is based.</p>`,
      },
      {
        id: 'contact',
        icon: 'Mail',
        title: 'Contact',
        summary: 'Reach us via email or phone for any questions about these terms.',
        content: `<p>For questions about these Terms of Service, contact us at:</p><p>Email: {{email}}<br/>Phone: {{phone}}</p>`,
      },
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    eyebrow: 'Data Protection',
    description: 'How we collect, use, and protect your personal information.',
    sections: [
      {
        id: 'introduction',
        icon: 'Shield',
        title: 'Introduction',
        summary: 'We are committed to protecting your personal information and privacy.',
        content: `<p>{{company}} ("we", "our", "us") is committed to protecting your personal information and your right to privacy. This Privacy Policy describes how we collect, use, and protect information when you visit our website or make a purchase.</p><p>By using our services, you consent to the data practices described in this policy.</p>`,
      },
      {
        id: 'info-collect',
        icon: 'Eye',
        title: 'Information We Collect',
        summary: 'We collect personal details you provide (name, email, address) and automatic data (IP, browser, cookies).',
        content: `<p><strong>Personal Information:</strong> When you place an order or create an account, we collect:</p><ul><li>Full name, email address, and phone number</li><li>Shipping and billing address</li><li>Payment information (processed securely via third-party payment gateways — we do not store card details)</li><li>Order history and product preferences</li></ul><p><strong>Automatically Collected Information:</strong> When you browse our website, we may collect:</p><ul><li>IP address, browser type, and device information</li><li>Pages visited, time spent, and navigation patterns</li><li>Referral source and search queries</li><li>Cookies and similar tracking technologies</li></ul>`,
      },
      {
        id: 'how-we-use',
        icon: 'Database',
        title: 'How We Use Your Information',
        summary: 'We use your data to process orders, communicate with you, improve our services, and comply with the law.',
        content: `<p>We use the collected information for the following purposes:</p><ul><li><strong>Order fulfillment:</strong> Processing, shipping, and delivering your orders</li><li><strong>Communication:</strong> Sending order confirmations, shipping updates, and customer support responses</li><li><strong>Improvement:</strong> Analyzing usage patterns to improve our website, products, and services</li><li><strong>Marketing:</strong> Sending promotional offers and newsletters (only with your consent; you can unsubscribe at any time)</li><li><strong>Legal compliance:</strong> Meeting regulatory requirements related to the sale and transport of pyrotechnic products</li></ul>`,
      },
      {
        id: 'data-sharing',
        icon: 'Share2',
        title: 'Data Sharing',
        summary: 'We never sell your data. We only share with shipping partners, payment processors, and when legally required.',
        content: `<p>We do not sell, trade, or rent your personal information. We may share data with:</p><ul><li><strong>Shipping partners:</strong> Name, phone, and address for delivery purposes</li><li><strong>Payment provider:</strong> To process your payment securely</li><li><strong>Analytics providers:</strong> Anonymized usage data for website improvement</li><li><strong>Legal authorities:</strong> If required by law, court order, or government request</li></ul>`,
      },
      {
        id: 'data-security',
        icon: 'Lock',
        title: 'Data Security',
        summary: 'We use encrypted connections and limit who can see your data.',
        content: `<p>We take care to protect your information:</p><ul><li>Encrypted (HTTPS) connections for everything you send us</li><li>Card payments handled by our payment provider — we never store card details</li><li>Access to your details limited to staff who need it</li></ul>`,
      },
      {
        id: 'cookies',
        icon: 'Cookie',
        title: 'Cookies',
        summary: 'We use essential, preference, and analytics cookies. You can control them via your browser.',
        content: `<p>We use cookies and similar technologies to enhance your browsing experience. These include:</p><ul><li><strong>Essential cookies:</strong> Required for website functionality (cart, login sessions)</li><li><strong>Preference cookies:</strong> Remember your settings (theme, currency, language)</li><li><strong>Analytics cookies:</strong> Help us understand how visitors use our website</li></ul><p>You can control cookie settings through your browser. Disabling essential cookies may affect website functionality.</p>`,
      },
      {
        id: 'your-rights',
        icon: 'UserCheck',
        title: 'Your Rights',
        summary: 'You can access, correct, delete your data, or withdraw marketing consent at any time.',
        content: `<p>Under applicable Indian data protection laws, you have the right to:</p><ul><li>Access the personal data we hold about you</li><li>Request correction of inaccurate information</li><li>Request deletion of your personal data (subject to legal obligations)</li><li>Withdraw consent for marketing communications</li><li>Lodge a complaint with the relevant data protection authority</li></ul><p>To exercise these rights, contact us at {{email}}.</p>`,
      },
      {
        id: 'data-retention',
        icon: 'Clock',
        title: 'Data Retention',
        summary: 'We keep your data as long as needed. Order data is retained for 8 years per Indian tax law.',
        content: `<p>We retain your personal information for as long as necessary to fulfill the purposes outlined in this policy, comply with legal obligations, and resolve disputes. Order data is retained for a minimum of 8 years as required by Indian tax and commercial regulations.</p>`,
      },
      {
        id: 'changes',
        icon: 'RefreshCw',
        title: 'Changes to This Policy',
        summary: 'We may update this policy. Changes will be posted here with an updated date.',
        content: `<p>We may update this Privacy Policy periodically. Changes will be posted on this page with an updated "Last Updated" date. We encourage you to review this policy regularly.</p>`,
      },
      {
        id: 'contact',
        icon: 'Mail',
        title: 'Contact',
        summary: 'Reach our Data Protection Officer for any privacy-related questions.',
        content: `<p>For privacy-related questions or requests, contact our Data Protection Officer:</p><p>Email: {{email}}<br/>Phone: {{phone}}</p><p>{{company}}, {{address}}</p>`,
      },
    ],
  },
};

/** The company details the starter text names. */
export interface PolicyCompany {
  name: string;
  email: string;
  phone: string;
  address: string;
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const TOKEN = /\{\{(company|email|phone|address)\}\}/g;

/**
 * Put the shop's name and contact details into a policy section.
 *
 * Applied to the starter text AND to whatever the shop saved: the admin editor
 * fills the tokens when it opens, but leaves one in place when that Company
 * Info field is blank, and a policy saved like that would otherwise show a raw
 * `{{address}}` to customers. A blank detail becomes an empty string, never the
 * token. Values put into HTML are escaped — a shop name with an ampersand must
 * read as one.
 */
export function fillPolicySection<S extends Pick<PolicySectionContent, 'summary' | 'content'>>(
  section: S,
  company: PolicyCompany,
): S {
  const values: Record<string, string> = {
    company: company.name,
    email: company.email,
    phone: company.phone,
    address: company.address,
  };
  return {
    ...section,
    summary: (section.summary ?? '').replace(TOKEN, (_, key: string) => values[key] ?? ''),
    content: (section.content ?? '').replace(TOKEN, (_, key: string) => escapeHtml(values[key] ?? '')),
  };
}

/** The starter text for one policy page, with the shop's own details filled in. */
export function defaultPolicy(type: PolicyType, company: PolicyCompany): PolicyDefault {
  const page = DEFAULT_POLICIES[type];
  return {
    ...page,
    sections: page.sections.map((section) => fillPolicySection(section, company)),
  };
}
