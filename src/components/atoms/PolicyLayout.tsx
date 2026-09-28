import { type ReactNode, useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import { Container } from '@/components/atoms/Container.tsx';
import { cn } from '@/lib/utils.ts';

export interface PolicySection {
  id: string;
  icon: LucideIcon;
  title: string;
  summary: string;
  content: ReactNode;
}

interface PolicyLayoutProps {
  title: string;
  eyebrow: string;
  description: string;
  lastUpdated: string;
  sections: PolicySection[];
}

export function PolicyLayout({ title, eyebrow, description, lastUpdated, sections }: PolicyLayoutProps) {
  const [activeId, setActiveId] = useState(sections[0]?.id ?? '');
  const [tocOpen, setTocOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());

  // Reading progress bar
  useEffect(() => {
    const handleScroll = () => {
      const el = contentRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const total = el.scrollHeight - window.innerHeight;
      const scrolled = -rect.top;
      setProgress(Math.min(100, Math.max(0, (scrolled / total) * 100)));
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Scroll-spy using IntersectionObserver
  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    sectionRefs.current.forEach((el, id) => {
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setActiveId(id);
        },
        { rootMargin: '-20% 0px -60% 0px' },
      );
      observer.observe(el);
      observers.push(observer);
    });
    return () => observers.forEach((o) => o.disconnect());
  }, [sections]);

  const registerRef = useCallback((id: string, el: HTMLElement | null) => {
    if (el) sectionRefs.current.set(id, el);
    else sectionRefs.current.delete(id);
  }, []);

  const scrollTo = (id: string) => {
    const el = sectionRefs.current.get(id);
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 100;
      window.scrollTo({ top, behavior: 'smooth' });
    }
    setTocOpen(false);
  };

  const activeSectionTitle = sections.find((s) => s.id === activeId)?.title ?? '';

  return (
    <div className="pt-16 lg:pt-18 min-h-screen">
      {/* Reading progress bar */}
      <div className="fixed top-0 left-0 right-0 z-[60] h-0.5 bg-surface-200 dark:bg-surface-800">
        <motion.div
          className="h-full bg-brand-500"
          style={{ width: `${progress}%` }}
          transition={{ duration: 0.1 }}
        />
      </div>

      {/* Header */}
      <section className="pt-8 pb-10 lg:pt-10 lg:pb-14 bg-white dark:bg-surface-900">
        <Container size="wide">
          <div className="text-center max-w-2xl mx-auto">
            <span className="inline-block mb-3 text-label font-bold uppercase tracking-widest text-brand-500">
              {eyebrow}
            </span>
            <h1 className="font-display font-bold text-display-sm sm:text-display-md text-surface-900 dark:text-surface-50">
              {title}
            </h1>
            <p className="mt-4 text-body-lg text-surface-500 dark:text-surface-400">
              {description}
            </p>
            {/* Only a date the shop actually saved — never a made-up one. */}
            {lastUpdated && <p className="mt-3 text-body-sm text-surface-400">Last updated: {lastUpdated}</p>}
          </div>
        </Container>
      </section>

      {/* Mobile TOC dropdown */}
      <div className="sticky top-16 z-30 lg:hidden bg-white/95 dark:bg-surface-900/95 backdrop-blur-lg border-b border-surface-200 dark:border-surface-800">
        <Container size="wide">
          <button
            onClick={() => setTocOpen(!tocOpen)}
            className="flex items-center justify-between w-full py-3 text-body-sm font-medium text-surface-700 dark:text-surface-300"
          >
            <span className="truncate">{activeSectionTitle}</span>
            <ChevronDown
              size={16}
              className={cn('flex-shrink-0 ml-2 transition-transform duration-200', tocOpen && 'rotate-180')}
            />
          </button>
          <AnimatePresence>
            {tocOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <nav className="pb-3 space-y-0.5">
                  {sections.map((s, i) => {
                    const Icon = s.icon;
                    return (
                      <button
                        key={s.id}
                        onClick={() => scrollTo(s.id)}
                        className={cn(
                          'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-left text-body-sm transition-colors',
                          activeId === s.id
                            ? 'bg-brand-500/10 text-brand-600 dark:text-brand-400 font-medium'
                            : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800',
                        )}
                      >
                        <span className="w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center bg-surface-100 dark:bg-surface-800 text-surface-400 flex-shrink-0">
                          {i + 1}
                        </span>
                        <Icon size={14} className="flex-shrink-0" />
                        <span className="truncate">{s.title}</span>
                      </button>
                    );
                  })}
                </nav>
              </motion.div>
            )}
          </AnimatePresence>
        </Container>
      </div>

      {/* Content with sidebar */}
      <section className="py-10 lg:py-14 bg-surface-50 dark:bg-surface-950" ref={contentRef}>
        <Container size="wide">
          <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-10 lg:gap-12">
            {/* Desktop sidebar TOC */}
            <aside className="hidden lg:block">
              <nav className="sticky top-28 space-y-1">
                <p className="text-label font-bold uppercase tracking-wider text-surface-400 mb-3 px-3">
                  On this page
                </p>
                {sections.map((s, i) => {
                  const Icon = s.icon;
                  return (
                    <button
                      key={s.id}
                      onClick={() => scrollTo(s.id)}
                      className={cn(
                        'flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-left text-body-sm transition-all duration-200',
                        activeId === s.id
                          ? 'bg-brand-500/10 text-brand-600 dark:text-brand-400 font-medium shadow-sm'
                          : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 hover:bg-white dark:hover:bg-surface-900',
                      )}
                    >
                      <span
                        className={cn(
                          'w-6 h-6 rounded-lg text-[11px] font-bold flex items-center justify-center flex-shrink-0 transition-colors',
                          activeId === s.id
                            ? 'bg-brand-500 text-white'
                            : 'bg-surface-200 dark:bg-surface-800 text-surface-400',
                        )}
                      >
                        {i + 1}
                      </span>
                      <Icon
                        size={15}
                        className={cn(
                          'flex-shrink-0 transition-colors',
                          activeId === s.id ? 'text-brand-500' : '',
                        )}
                      />
                      <span className="truncate">{s.title}</span>
                    </button>
                  );
                })}
              </nav>
            </aside>

            {/* Sections */}
            <div className="space-y-6">
              {sections.map((s, i) => {
                const Icon = s.icon;
                return (
                  <div
                    key={s.id}
                    ref={(el) => registerRef(s.id, el)}
                    id={s.id}
                    className="bg-white dark:bg-surface-900 rounded-2xl p-6 sm:p-8 border border-surface-200 dark:border-surface-800"
                  >
                    {/* Section header */}
                    <div className="flex items-start gap-4 mb-5">
                      <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center flex-shrink-0">
                        <Icon size={20} className="text-brand-500" />
                      </div>
                      <div>
                        <p className="text-caption font-bold uppercase tracking-wider text-surface-400 mb-0.5">
                          Section {i + 1}
                        </p>
                        <h2 className="font-display font-bold text-heading-md text-surface-900 dark:text-surface-50">
                          {s.title}
                        </h2>
                      </div>
                    </div>

                    {/* In short summary */}
                    <div className="mb-5 px-4 py-3 rounded-xl bg-brand-500/5 border border-brand-500/10">
                      <p className="text-body-sm text-brand-700 dark:text-brand-300">
                        <span className="font-bold">In short:</span> {s.summary}
                      </p>
                    </div>

                    {/* Content */}
                    <div className="space-y-3 text-body-md text-surface-600 dark:text-surface-400 leading-relaxed">
                      {s.content}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Container>
      </section>
    </div>
  );
}
