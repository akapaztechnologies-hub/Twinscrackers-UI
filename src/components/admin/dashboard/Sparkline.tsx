import { memo, useId, useMemo } from 'react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/utils.ts';

export type SparklineTone = 'red' | 'amber' | 'green';

const TONE_STROKE: Record<SparklineTone, string> = {
  red: '#DC2626',
  amber: '#F59E0B',
  green: '#16A34A',
};

interface SparklineProps {
  data: number[];
  tone: SparklineTone;
  className?: string;
}

interface SparklinePoint {
  index: number;
  value: number;
}

function SparklineBase({ data, tone, className }: SparklineProps) {
  // useId keeps the gradient id unique per mounted sparkline — recharts resolves
  // fill="url(#id)" against the whole document, so repeated ids bleed across cards.
  const rawId = useId();
  const gradientId = `sparkline-${tone}-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`;
  const stroke = TONE_STROKE[tone];

  const points = useMemo<SparklinePoint[]>(
    () =>
      data
        .filter((value) => Number.isFinite(value))
        .map((value, index) => ({ index, value })),
    [data],
  );

  const isFlat = points.length < 2 || points.every((point) => point.value === 0);

  if (isFlat) {
    return (
      <div className={cn('w-full h-full flex items-center', className)} aria-hidden="true">
        <span className="block w-full h-px rounded-full bg-surface-200 dark:bg-surface-700" />
      </div>
    );
  }

  return (
    <div className={cn('w-full h-full', className)} aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 3, right: 0, bottom: 3, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.28} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke={stroke}
            strokeWidth={2}
            strokeLinecap="round"
            fill={`url(#${gradientId})`}
            fillOpacity={1}
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export const Sparkline = memo(SparklineBase);
Sparkline.displayName = 'Sparkline';
