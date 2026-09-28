import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Quote } from 'lucide-react';
import { Container } from '@/components/atoms/Container.tsx';
import { SectionHeading } from '@/components/atoms/SectionHeading.tsx';
import { StarRating } from '@/components/atoms/StarRating.tsx';
import { Avatar } from '@/components/atoms/Avatar.tsx';
import api from '@/lib/api.ts';

interface Review {
  id: string;
  name: string;
  location: string;
  rating: number;
  text: string;
  avatar: string;
  isActive?: boolean;
  order?: number;
}

/*
 * No stand-in reviews. This section used to fall back to three invented,
 * named customers under a "Real reviews" heading whenever the shop had not
 * saved any — presented as genuine, which they were not. It now shows only
 * the testimonials the shop adds in Admin -> Content, and stays hidden until
 * there are some.
 */
const defaultReviews: Review[] = [];

const defaultHeading = {
  eyebrow: 'Customer Love',
  title: 'What Our Customers Say',
  subtitle: 'Real reviews from celebrations across India.',
};

export function Testimonials() {
  const [reviews, setReviews] = useState<Review[]>(defaultReviews);
  const [heading, setHeading] = useState(defaultHeading);

  useEffect(() => {
    (api.get('/content/testimonials') as Promise<Record<string, unknown> | null>)
      .then((result) => {
        if (!result) return;
        const data = (result.data || result) as Record<string, unknown>;
        if (Array.isArray(data.testimonials)) {
          const active = (data.testimonials as Review[])
            .filter((t) => t.isActive !== false && t.text?.trim())
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
          if (active.length) setReviews(active);
        }
        if (data.heading && typeof data.heading === 'object') {
          setHeading((h) => ({ ...h, ...(data.heading as typeof defaultHeading) }));
        }
      })
      .catch(() => {});
  }, []);

  // Nothing saved (or nothing active): no section, rather than an empty one.
  if (reviews.length === 0) return null;

  return (
    <section className="section-padding bg-surface-50 dark:bg-surface-950">
      <Container size="wide">
        <SectionHeading
          eyebrow={heading.eyebrow}
          title={heading.title}
          subtitle={heading.subtitle}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {reviews.map((r, index) => (
            <motion.article
              key={r.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              viewport={{ once: true, amount: 0.2 }}
              className="group flex h-full flex-col rounded-2xl bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800 p-6 lg:p-8 hover:border-brand-500/30 hover:shadow-glow transition-all duration-300"
            >
              <Quote size={32} className="text-brand-500/25 flex-shrink-0" />
              <StarRating rating={r.rating} showCount={false} size="md" className="mt-4" />
              <p className="mt-4 flex-1 text-body-md text-surface-700 dark:text-surface-300">
                “{r.text}”
              </p>
              <div className="mt-6 flex items-center gap-3 border-t border-surface-100 dark:border-surface-800 pt-5">
                <Avatar src={r.avatar} name={r.name} size="md" />
                <div className="min-w-0">
                  <div className="font-display font-semibold text-body-md text-surface-900 dark:text-surface-50 truncate">
                    {r.name}
                  </div>
                  <div className="text-caption text-surface-500 dark:text-surface-400 truncate">
                    {r.location}
                  </div>
                </div>
              </div>
            </motion.article>
          ))}
        </div>
      </Container>
    </section>
  );
}
