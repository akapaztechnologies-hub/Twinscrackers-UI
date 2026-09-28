import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2 } from 'lucide-react';
import { AdminCard } from '@/components/admin/AdminCard.tsx';
import { SkeletonCard } from '@/components/admin/Skeleton.tsx';
import { SaveButton, SuccessToast, SectionLabel, ErrorNotice, errorText, loadErrorText } from '@/components/admin/AdminShared.tsx';
import { cn } from '@/lib/utils.ts';
import { getContentSection, updateContentSection } from '@/services/admin.ts';
import { useSiteStore } from '@/store/site.ts';
import type { SiteConfig } from '@/store/site.ts';

const inputClass =
  'w-full min-w-0 px-3.5 py-2.5 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-body-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500/40 transition-shadow';

const labelClass = 'block text-body-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5';

export interface PolicySectionData {
  id: string;
  icon: string;
  title: string;
  summary: string;
  content: string;
}

export interface PolicyPageData {
  title: string;
  eyebrow: string;
  description: string;
  lastUpdated: string;
  sections: PolicySectionData[];
}

export type PolicyType = 'shipping' | 'returns' | 'terms' | 'privacy';

/**
 * Starter copy for a store that has not written its policies yet.
 *
 * It promises nothing a particular shop would have to stand behind — no
 * delivery prices or free-delivery thresholds, no return windows, no refund
 * timelines, no payment methods the shop may not take — because saving the
 * tab untouched publishes it word for word.
 *
 * The {{company}} / {{email}} / {{phone}} / {{address}} tokens are filled from
 * Admin -> Content -> Company Info by `resolvePolicyTokens` below, so the
 * defaults never publish a previous owner's name or contact details.
 */
const defaultPolicyData: Record<PolicyType, PolicyPageData> = {
  shipping: {
    title: 'Shipping Policy',
    eyebrow: 'Logistics',
    description: 'Information about our shipping and delivery terms.',
    lastUpdated: new Date().toISOString().split('T')[0],
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
    lastUpdated: new Date().toISOString().split('T')[0],
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
    lastUpdated: new Date().toISOString().split('T')[0],
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
    lastUpdated: new Date().toISOString().split('T')[0],
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


/** Fill the {{token}} placeholders in the starter policies from live company info. */
function resolvePolicyTokens(
  policies: Record<PolicyType, PolicyPageData>,
  config: SiteConfig,
): Record<PolicyType, PolicyPageData> {
  const values: Record<string, string> = {
    company: config.name,
    email: config.contact.email,
    phone: config.contact.phone,
    address: config.contact.address,
  };
  const fill = (text: string) =>
    text.replace(/\{\{(company|email|phone|address)\}\}/g, (match, key: string) => values[key] || match);

  return Object.fromEntries(
    Object.entries(policies).map(([type, page]) => [
      type,
      {
        ...page,
        sections: page.sections.map((section) => ({
          ...section,
          summary: fill(section.summary),
          content: fill(section.content),
        })),
      },
    ]),
  ) as Record<PolicyType, PolicyPageData>;
}

export function PoliciesTab({ saveSlot }: { saveSlot: HTMLDivElement | null }) {
  const [policies, setPolicies] = useState<Record<PolicyType, PolicyPageData>>(() =>
    resolvePolicyTokens(defaultPolicyData, useSiteStore.getState().config),
  );
  const [activePolicy, setActivePolicy] = useState<PolicyType>('shipping');
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // A failed load leaves the defaults on screen; saving them would overwrite
  // the real section, so Save stays off until a reload succeeds.
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const data = await getContentSection<Record<PolicyType, PolicyPageData>>('policy-pages');
        if (data) {
          setPolicies({ ...resolvePolicyTokens(defaultPolicyData, useSiteStore.getState().config), ...data });
        }
      } catch (err) {
        setLoadError(loadErrorText(err));
      } finally {
        setIsLoading(false);
      }
    })();
    // Loaded once. Re-running on every site-config refresh (a Company Info save
    // triggers one) reloaded the stored copy over whatever was being typed.
  }, []);

  const handleSave = async () => {
    if (loadError) return;
    setIsSaving(true);
    setSaveError('');
    try {
      await updateContentSection('policy-pages', policies);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setSaveError(errorText(err, 'Your changes could not be saved. Please try again.'));
    } finally {
      setIsSaving(false);
    }
  };

  const currentPolicy = policies[activePolicy];

  const updatePolicy = (field: keyof PolicyPageData, value: string) => {
    setPolicies(prev => ({
      ...prev,
      [activePolicy]: { ...prev[activePolicy], [field]: value }
    }));
  };

  const addSection = () => {
    const newId = crypto.randomUUID();
    setPolicies(prev => ({
      ...prev,
      [activePolicy]: {
        ...prev[activePolicy],
        sections: [...prev[activePolicy].sections, { id: newId, icon: 'FileText', title: 'New Section', summary: '', content: '' }]
      }
    }));
    setExpandedSection(newId);
  };

  const updateSection = (id: string, field: keyof PolicySectionData, value: string) => {
    setPolicies(prev => ({
      ...prev,
      [activePolicy]: {
        ...prev[activePolicy],
        sections: prev[activePolicy].sections.map(s => s.id === id ? { ...s, [field]: value } : s)
      }
    }));
  };

  const removeSection = (id: string) => {
    setPolicies(prev => ({
      ...prev,
      [activePolicy]: {
        ...prev[activePolicy],
        sections: prev[activePolicy].sections.filter(s => s.id !== id)
      }
    }));
  };

  if (isLoading) return <SkeletonCard />;

  return (
    <div className="space-y-6">
      <SuccessToast show={saved} />
      <ErrorNotice message={loadError || saveError} onDismiss={loadError ? undefined : () => setSaveError('')} />
      {saveSlot && createPortal(<SaveButton onClick={handleSave} isSaving={isSaving} disabled={!!loadError} label="Save Policies" />, saveSlot)}

      {/* Policy Selector */}
      <div className="flex gap-2 p-1.5 rounded-xl bg-surface-100 dark:bg-surface-800 w-fit">
        {(Object.keys(defaultPolicyData) as PolicyType[]).map((type) => (
          <button
            key={type}
            onClick={() => setActivePolicy(type)}
            className={cn(
              'px-4 py-2 rounded-lg text-body-sm font-medium transition-all capitalize',
              activePolicy === type
                ? 'bg-white dark:bg-surface-900 text-surface-900 dark:text-surface-100 shadow-sm'
                : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'
            )}
          >
            {type}
          </button>
        ))}
      </div>

      <AdminCard title={`${currentPolicy.title} Config`}>
        <SectionLabel label="Policy configuration" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div>
            <label className={labelClass}>Title</label>
            <input type="text" value={currentPolicy.title} onChange={e => updatePolicy('title', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Eyebrow</label>
            <input type="text" value={currentPolicy.eyebrow} onChange={e => updatePolicy('eyebrow', e.target.value)} className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Description</label>
            <textarea value={currentPolicy.description} onChange={e => updatePolicy('description', e.target.value)} className={inputClass} rows={2} />
          </div>
          <div>
            <label className={labelClass}>Last Updated (YYYY-MM-DD)</label>
            <input type="text" value={currentPolicy.lastUpdated} onChange={e => updatePolicy('lastUpdated', e.target.value)} className={inputClass} />
          </div>
        </div>

        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-surface-900 dark:text-surface-100">Sections ({currentPolicy.sections.length})</h3>
          <button onClick={addSection} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-body-sm text-brand-600 dark:text-brand-400 font-medium hover:bg-brand-500/10 transition-colors">
            <Plus size={16} /> Add Section
          </button>
        </div>

        <div className="space-y-4">
          {currentPolicy.sections.map((section, index) => {
            const isExpanded = expandedSection === section.id;
            return (
              <div key={section.id} className="bg-white dark:bg-surface-900 rounded-2xl border border-surface-200 dark:border-surface-800 overflow-hidden">
                <div
                  className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors"
                  onClick={() => setExpandedSection(isExpanded ? null : section.id)}
                >
                  <span className="w-6 h-6 rounded-lg bg-surface-200 dark:bg-surface-700 flex items-center justify-center text-caption font-semibold text-surface-500 flex-shrink-0">
                    {index + 1}
                  </span>
                  <input
                    type="text"
                    value={section.title}
                    onChange={(e) => { e.stopPropagation(); updateSection(section.id, 'title', e.target.value); }}
                    onClick={(e) => e.stopPropagation()}
                    className={`${inputClass} flex-1`}
                    placeholder="Section Title"
                  />
                  <input
                    type="text"
                    value={section.icon}
                    onChange={(e) => { e.stopPropagation(); updateSection(section.id, 'icon', e.target.value); }}
                    onClick={(e) => e.stopPropagation()}
                    className={`${inputClass.replace('w-full', 'w-32')} hidden sm:block`}
                    placeholder="Lucide Icon (e.g. Shield)"
                  />
                  <button
                    onClick={(e) => { e.stopPropagation(); removeSection(section.id); }}
                    className="p-1.5 rounded-lg text-surface-400 hover:text-red-500 hover:bg-red-500/10 transition-colors flex-shrink-0"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                {isExpanded && (
                  <div className="px-5 pb-5 border-t border-surface-100 dark:border-surface-800 space-y-4 pt-4">
                    <div>
                      <label className={labelClass}>Summary (Appears under title in sidebar)</label>
                      <input
                        type="text"
                        value={section.summary}
                        onChange={(e) => updateSection(section.id, 'summary', e.target.value)}
                        className={inputClass}
                        placeholder="Brief summary of this section"
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Content (HTML Supported)</label>
                      <textarea
                        value={section.content}
                        onChange={(e) => updateSection(section.id, 'content', e.target.value)}
                        className={`${inputClass} font-mono text-sm`}
                        rows={8}
                        placeholder="<p>Enter your policy text here...</p>"
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {currentPolicy.sections.length === 0 && (
            <div className="text-center py-10 bg-surface-50 dark:bg-surface-800/50 rounded-2xl border border-dashed border-surface-300 dark:border-surface-700">
              <p className="text-surface-500 text-body-sm">No sections added yet.</p>
            </div>
          )}
        </div>
      </AdminCard>
    </div>
  );
}
