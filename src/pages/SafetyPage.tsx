import { motion } from 'framer-motion';
import * as LucideIcons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { getIcon } from '@/lib/content.ts';
import {
  Shield, AlertTriangle, Eye, Flame,
  Droplets, MapPin, Phone, CheckCircle, XCircle,
  Sparkles, Rocket, Package, CircleDot, Star,
  Thermometer, Lock, CloudRain,
} from 'lucide-react';
import { Container } from '@/components/atoms/Container.tsx';
import { SEO } from '@/components/SEO.tsx';
import { useSiteStore } from '@/store/site.ts';
import { cn } from '@/lib/utils.ts';
import type { SafetyPageData } from '@/pages/admin/SafetyTab.tsx';

const fadeUp = {
  initial: { opacity: 0, y: 30 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.2 },
  transition: { duration: 0.5 },
};

const stats = [
  { value: '2,000°F', label: 'Sparklers burn hot enough to melt glass', icon: Thermometer },
  { value: '20 min', label: 'Wait before approaching a dud firework', icon: AlertTriangle },
  { value: '15 ft', label: 'Minimum safe distance for ground fireworks', icon: MapPin },
  { value: '100 ft', label: 'Safe viewing distance for aerial shells', icon: Eye },
];

const safetyDos = [
  'Read all instructions on the label before use',
  'Light fireworks one at a time and move away quickly',
  'Keep a bucket of water or fire extinguisher nearby',
  'Supervise children at all times — even with "safe" products',
  'Wear cotton clothing — avoid synthetic fabrics',
  'Store fireworks in a cool, dry place away from heat',
  'Maintain a safe distance as specified on the product',
  'Use fireworks outdoors in open areas only',
];

const safetyDonts = [
  'Never relight a firework that didn\'t go off — wait 20 minutes then soak in water',
  'Never point or throw fireworks at people or animals',
  'Don\'t carry fireworks in your pockets',
  'Don\'t use fireworks near flammable materials or dry vegetation',
  'Never give fireworks to young children without supervision',
  'Don\'t experiment with or modify firework products',
  'Don\'t light fireworks indoors or in enclosed spaces',
  'Never lean over a firework while lighting it',
];

const categoryCards = [
  {
    icon: Sparkles,
    name: 'Sparklers',
    color: 'border-emerald-500/30 bg-emerald-500/5',
    iconColor: 'bg-emerald-500/10 text-emerald-500',
    distance: '2 ft',
    tips: ['Hold at arm\'s length, away from body', 'Never hand to children under 5', 'Drop spent sparklers in a water bucket — don\'t touch the wire'],
  },
  {
    icon: Star,
    name: 'Fountains & Cones',
    color: 'border-blue-500/30 bg-blue-500/5',
    iconColor: 'bg-blue-500/10 text-blue-500',
    distance: '15 ft',
    tips: ['Place on flat, hard surface before lighting', 'Never hold in hand while lit', 'Keep a 15 ft radius clear of people and objects'],
  },
  {
    icon: Rocket,
    name: 'Rockets & Missiles',
    color: 'border-amber-500/30 bg-amber-500/5',
    iconColor: 'bg-amber-500/10 text-amber-500',
    distance: '30 ft',
    tips: ['Launch from a stable tube or bottle anchored in sand', 'Aim straight up, never at an angle toward people', 'Clear the area before lighting — use a long lighter'],
  },
  {
    icon: CircleDot,
    name: 'Ground Spinners',
    color: 'border-violet-500/30 bg-violet-500/5',
    iconColor: 'bg-violet-500/10 text-violet-500',
    distance: '10 ft',
    tips: ['Place on smooth, flat ground — avoid gravel', 'Clear a wide area as they move unpredictably', 'Keep children and pets well back'],
  },
  {
    icon: Package,
    name: 'Multi-Shot Cakes',
    color: 'border-orange-500/30 bg-orange-500/5',
    iconColor: 'bg-orange-500/10 text-orange-500',
    distance: '50 ft',
    tips: ['Place on firm, level ground — never on a table', 'Light the single fuse and move away immediately', 'Do NOT approach until all shots have fired and 5 minutes have passed'],
  },
  {
    icon: Star,
    name: 'Aerial Shells',
    color: 'border-red-500/30 bg-red-500/5',
    iconColor: 'bg-red-500/10 text-red-500',
    distance: '100 ft',
    tips: ['For experienced adults only — requires a mortar tube', 'Clear a 100 ft perimeter around launch site', 'Never look down the tube after a misfire'],
  },
];

const emergencySteps = [
  {
    icon: Droplets,
    title: 'Minor Burns',
    color: 'border-amber-500/30',
    iconColor: 'bg-amber-500/10 text-amber-500',
    steps: [
      'Run cool (not cold) water over the burn for 10+ minutes',
      'Cover with a sterile, non-stick bandage',
      'Take over-the-counter pain relief if needed',
      'Do NOT apply ice, butter, or ointments',
    ],
  },
  {
    icon: Eye,
    title: 'Eye Injury',
    color: 'border-red-500/30',
    iconColor: 'bg-red-500/10 text-red-500',
    steps: [
      'Do NOT rub or touch the eye',
      'Do NOT attempt to remove any debris',
      'Cover with a rigid shield (e.g. paper cup)',
      'Seek emergency medical attention immediately',
    ],
  },
  {
    icon: Flame,
    title: 'Fire Emergency',
    color: 'border-orange-500/30',
    iconColor: 'bg-orange-500/10 text-orange-500',
    steps: [
      'Call fire services (101) immediately',
      'Evacuate all people from the area',
      'Use a fire extinguisher only if safe to do so',
      'Account for all persons — do not re-enter',
    ],
  },
  {
    icon: Phone,
    title: 'Serious Injury',
    color: 'border-red-500/30',
    iconColor: 'bg-red-500/10 text-red-500',
    steps: [
      'Call emergency services (112) immediately',
      'Do NOT move the injured person',
      'Apply pressure to any bleeding wounds',
      'Keep the person calm until help arrives',
    ],
  },
];

const storageRules = [
  { icon: Thermometer, title: 'Cool & Dry', desc: 'Store below 30°C in a dry, well-ventilated area away from direct sunlight.' },
  { icon: Lock, title: 'Locked Away', desc: 'Keep out of reach of children and pets. Use a locked cabinet or high shelf.' },
  { icon: Flame, title: 'Away from Heat', desc: 'Never store near stoves, heaters, electrical panels, or gas cylinders.' },
  { icon: CloudRain, title: 'Moisture-Free', desc: 'Damp fireworks are unpredictable. Keep sealed in original packaging until use.' },
];

// Loose shape shared by every safety content row (stats, cards, rules, steps),
// covering both the built-in defaults and any admin-supplied content.
type SafetyRow = {
  id?: string;
  icon?: string | LucideIcon;
  iconColor?: string;
  color?: string;
  value?: string;
  label?: string;
  title?: string;
  desc?: string;
  name?: string;
  distance?: string;
  number?: string;
  tips?: Array<string | { text: string }>;
  steps?: string[];
};

export function SafetyPage() {
  const siteConfig = useSiteStore((s) => s.config);
  // Safety content is no longer admin-editable — always render the built-in defaults below.
  const data = null as SafetyPageData | null;

  const heroTitle = data?.heroTitle || 'Celebrate';
  const heroHighlight = data?.heroHighlight || 'Safely';
  const heroSubtitle = data?.heroSubtitle || 'Fireworks bring joy, but safety must always come first. Follow these essential guidelines to ensure your celebrations remain beautiful, memorable, and injury-free.';
  const heroBgImage = data?.heroBgImage || 'https://images.unsplash.com/photo-1498931299472-f7a63a5a1cfa?w=1920&q=30';

  const statsToUse = data?.stats?.length ? data.stats : stats;
  const dosToUse = data?.safetyDos?.length ? data.safetyDos.map(d => d.text) : safetyDos;
  const dontsToUse = data?.safetyDonts?.length ? data.safetyDonts.map(d => d.text) : safetyDonts;
  const cardsToUse = data?.categoryCards?.length ? data.categoryCards : categoryCards;
  const emergencyStepsToUse = data?.emergencySteps?.length ? data.emergencySteps.map(step => ({
    ...step,
    steps: step.steps.map(s => s.text)
  })) : emergencySteps;
  const storageRulesToUse = data?.storageRules?.length ? data.storageRules : storageRules;

  const sosLabel = data?.sosLabel || 'Emergency 112';
  const sosPhone = data?.sosPhone || '112';
  const dosEyebrow = data?.dosEyebrow || 'Know the Rules';
  const dosHeading = data?.dosHeading || "Do's & Don'ts";
  const dosColumnTitle = data?.dosColumnTitle || "Safety Do's";
  const dontsColumnTitle = data?.dontsColumnTitle || "Safety Don'ts";
  const categoryEyebrow = data?.categoryEyebrow || 'By Product Type';
  const categoryHeading = data?.categoryHeading || 'Category Safety Guide';
  const categorySubtitle = data?.categorySubtitle || 'Different fireworks require different precautions. Know the safe distance and handling for each type.';
  const storageEyebrow = data?.storageEyebrow || 'Storage';
  const storageHeading = data?.storageHeading || 'Safe Storage & Handling';
  const emergencyEyebrow = data?.emergencyEyebrow || 'Be Prepared';
  const emergencyHeading = data?.emergencyHeading || 'Emergency First Aid';
  const emergencySubtitle = data?.emergencySubtitle || 'Know what to do in an emergency. Follow these steps while waiting for professional help.';
  const emergencyNumbersHeader = data?.emergencyNumbersHeader || 'Emergency Numbers — Save These';
  const emergencyNumbersToUse = data?.emergencyNumbers?.length ? data.emergencyNumbers : [
    { id: 'e1', icon: 'Phone', label: 'Emergency', number: '112' },
    { id: 'e2', icon: 'Flame', label: 'Fire Services', number: '101' },
    { id: 'e3', icon: 'Square', label: 'Ambulance', number: '108' },
  ];

  return (
    <div className="pt-16 lg:pt-18 min-h-screen">
      <SEO
        title="Fireworks Safety Guidelines — Do's, Don'ts & First Aid"
        description={`Essential fireworks safety guidelines from ${siteConfig.name}. Learn proper handling, storage, safety ratings, emergency first aid, and important dos and don'ts.`}
        canonical="/safety"
      />

      {/* Floating emergency button */}
      <a
        href={`tel:${sosPhone}`}
        // Lifted clear of the mobile tab bar, which publishes its height as
        // `--tab-bar-h`. An emergency call button sitting half under the
        // navigation is the last one that should be hard to hit.
        className="fixed right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-full bg-red-600 text-white shadow-lg hover:bg-red-700 active:scale-95 transition-all lg:right-6 bottom-[calc(var(--tab-bar-h,0px)+1.25rem)] lg:bottom-[calc(var(--tab-bar-h,0px)+1.5rem)]"
      >
        <Phone size={18} />
        <span className="text-body-sm font-bold">{sosLabel}</span>
      </a>

      {/* Hero */}
      <section className="relative py-16 lg:py-24 overflow-hidden bg-gradient-to-br from-emerald-600 via-emerald-700 to-emerald-900">
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-10" 
          style={{ backgroundImage: `url('${heroBgImage}')` }}
        />
        <Container size="narrow" className="relative z-10">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-sm mb-6">
              <Shield size={32} className="text-white" />
            </div>
            <h1 className="font-display font-bold text-display-sm sm:text-display-md text-white">
              {heroTitle} {heroHighlight && <span className="text-emerald-400">{heroHighlight}</span>}
            </h1>
            <p className="mt-4 text-body-lg text-white/70 max-w-xl mx-auto">
              {heroSubtitle}
            </p>
          </div>
        </Container>
      </section>

      {/* Statistics */}
      <section className="py-8 bg-surface-900 dark:bg-surface-800">
        <Container size="wide">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {(statsToUse as SafetyRow[]).map((stat, i) => {
              const Icon = getIcon(stat.icon, LucideIcons.Info);
              return (
                <div key={stat.label || i} className="text-center py-3">
                  <Icon size={20} className="text-brand-400 mx-auto mb-2" />
                  <p className="font-display font-bold text-heading-md lg:text-heading-lg text-white">{stat.value}</p>
                  <p className="mt-1 text-caption lg:text-body-sm text-surface-400">{stat.label}</p>
                </div>
              );
            })}
          </div>
        </Container>
      </section>

      {/* Do's and Don'ts */}
      <section className="section-padding bg-surface-50 dark:bg-surface-950">
        <Container size="wide">
          <motion.div {...fadeUp} className="text-center mb-10">
            <span className="inline-block mb-3 text-label font-bold uppercase tracking-widest text-brand-500">{dosEyebrow}</span>
            <h2 className="font-display font-bold text-display-sm text-surface-900 dark:text-surface-50">{dosHeading}</h2>
          </motion.div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Do's */}
            <motion.div {...fadeUp} className="bg-white dark:bg-surface-900 rounded-2xl p-6 lg:p-8 border border-emerald-500/20">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                  <CheckCircle size={22} className="text-emerald-500" />
                </div>
                <h3 className="font-display font-bold text-heading-md text-surface-900 dark:text-surface-50">{dosColumnTitle}</h3>
              </div>
              <div className="space-y-3">
                {dosToUse.map((item, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: i * 0.05 }}
                    viewport={{ once: true }}
                    className="flex items-start gap-3"
                  >
                    <CheckCircle size={18} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                    <span className="text-body-md text-surface-700 dark:text-surface-300">{item}</span>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* Don'ts */}
            <motion.div {...fadeUp} className="bg-white dark:bg-surface-900 rounded-2xl p-6 lg:p-8 border border-red-500/20">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                  <XCircle size={22} className="text-red-500" />
                </div>
                <h3 className="font-display font-bold text-heading-md text-surface-900 dark:text-surface-50">{dontsColumnTitle}</h3>
              </div>
              <div className="space-y-3">
                {dontsToUse.map((item, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: i * 0.05 }}
                    viewport={{ once: true }}
                    className="flex items-start gap-3"
                  >
                    <XCircle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
                    <span className="text-body-md text-surface-700 dark:text-surface-300">{item}</span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </Container>
      </section>

      {/* Category-Specific Safety */}
      <section className="section-padding bg-white dark:bg-surface-900">
        <Container size="wide">
          <motion.div {...fadeUp} className="text-center mb-10">
            <span className="inline-block mb-3 text-label font-bold uppercase tracking-widest text-brand-500">{categoryEyebrow}</span>
            <h2 className="font-display font-bold text-display-sm text-surface-900 dark:text-surface-50">{categoryHeading}</h2>
            <p className="mt-3 text-body-md text-surface-500 max-w-lg mx-auto">
              {categorySubtitle}
            </p>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {(cardsToUse as SafetyRow[]).map((cat, i) => {
              const Icon = getIcon(cat.icon, LucideIcons.Info);
              const catTips = cat.tips && typeof cat.tips[0] === 'object' ? (cat.tips as Array<{ text: string }>).map((t) => t.text) : (cat.tips as string[]);
              return (
                <motion.div
                  key={cat.name}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: i * 0.08 }}
                  viewport={{ once: true }}
                  className={cn('rounded-2xl p-6 border', cat.color)}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', cat.iconColor)}>
                        <Icon size={20} />
                      </div>
                      <h3 className="font-display font-bold text-heading-sm text-surface-900 dark:text-surface-50">{cat.name}</h3>
                    </div>
                    <span className="text-caption font-bold uppercase tracking-wider text-surface-400 bg-surface-100 dark:bg-surface-800 px-2.5 py-1 rounded-lg">
                      {cat.distance}
                    </span>
                  </div>
                  <ul className="space-y-2">
                    {catTips.map((tip: string) => (
                      <li key={tip} className="flex items-start gap-2 text-body-sm text-surface-600 dark:text-surface-400">
                        <div className="w-1.5 h-1.5 rounded-full bg-surface-400 flex-shrink-0 mt-1.5" />
                        {tip}
                      </li>
                    ))}
                  </ul>
                </motion.div>
              );
            })}
          </div>
        </Container>
      </section>

      {/* Storage & Handling */}
      <section className="section-padding bg-white dark:bg-surface-900">
        <Container size="wide">
          <motion.div {...fadeUp} className="text-center mb-10">
            <span className="inline-block mb-3 text-label font-bold uppercase tracking-widest text-brand-500">{storageEyebrow}</span>
            <h2 className="font-display font-bold text-display-sm text-surface-900 dark:text-surface-50">{storageHeading}</h2>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {(storageRulesToUse as SafetyRow[]).map((rule, i) => {
              const Icon = getIcon(rule.icon, LucideIcons.Info);
              return (
                <motion.div
                  key={rule.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: i * 0.1 }}
                  viewport={{ once: true }}
                  className="p-6 rounded-2xl bg-surface-50 dark:bg-surface-850 border border-surface-200 dark:border-surface-800 text-center"
                >
                  <div className="w-12 h-12 rounded-xl bg-brand-500/10 flex items-center justify-center mx-auto mb-4">
                    <Icon size={24} className="text-brand-500" />
                  </div>
                  <h3 className="font-display font-bold text-heading-sm text-surface-900 dark:text-surface-50">{rule.title}</h3>
                  <p className="mt-2 text-body-sm text-surface-500 dark:text-surface-400">{rule.desc}</p>
                </motion.div>
              );
            })}
          </div>
        </Container>
      </section>

      {/* Emergency First Aid */}
      <section className="section-padding bg-surface-50 dark:bg-surface-950">
        <Container size="wide">
          <motion.div {...fadeUp} className="text-center mb-10">
            <span className="inline-block mb-3 text-label font-bold uppercase tracking-widest text-red-500">{emergencyEyebrow}</span>
            <h2 className="font-display font-bold text-display-sm text-surface-900 dark:text-surface-50">{emergencyHeading}</h2>
            <p className="mt-3 text-body-md text-surface-500 max-w-lg mx-auto">
              {emergencySubtitle}
            </p>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {(emergencyStepsToUse as SafetyRow[]).map((step, i) => {
              const Icon = getIcon(step.icon, LucideIcons.Info);
              return (
                <motion.div
                  key={step.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: i * 0.1 }}
                  viewport={{ once: true }}
                  className={cn('p-6 rounded-2xl bg-white dark:bg-surface-900 border', step.color)}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', step.iconColor)}>
                      <Icon size={20} />
                    </div>
                    <h3 className="font-display font-bold text-heading-sm text-surface-900 dark:text-surface-50">{step.title}</h3>
                  </div>
                  <ol className="space-y-2">
                    {(step.steps || []).map((s: string, j: number) => (
                      <li key={j} className="flex items-start gap-3 text-body-sm text-surface-600 dark:text-surface-400">
                        <span className="w-5 h-5 rounded-full bg-surface-100 dark:bg-surface-800 flex items-center justify-center flex-shrink-0 text-[11px] font-bold text-surface-500 mt-0.5">
                          {j + 1}
                        </span>
                        {s}
                      </li>
                    ))}
                  </ol>
                </motion.div>
              );
            })}
          </div>
        </Container>
      </section>

      {/* Emergency Numbers Banner */}
      <section className="py-10 bg-red-600">
        <Container size="wide">
          <p className="text-center text-body-sm font-medium text-white/70 mb-5 uppercase tracking-wider">{emergencyNumbersHeader}</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 lg:gap-12 text-white">
            {emergencyNumbersToUse.map((num, i) => {
              const Icon = getIcon(num.icon, LucideIcons.Phone);
              return (
                <div key={num.id || i} className="flex items-center gap-6 lg:gap-12">
                  {i > 0 && <div className="w-px h-8 bg-white/20 hidden sm:block" />}
                  <div className="flex items-center gap-3">
                    <Icon size={20} />
                    <div>
                      <p className="text-body-sm text-white/70">{num.label}</p>
                      <p className="font-display font-bold text-heading-sm">{num.number}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Container>
      </section>
    </div>
  );
}
