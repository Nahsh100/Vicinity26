import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Txt } from './ui';

/**
 * Single-series daily bar chart. One measure per chart (no dual axes); bar colour is the darker
 * brand teal (#006B5F) because the bright teal is below 3:1 against the card surface.
 * Thin bars, 4 px rounded tops anchored to the baseline, 2 px gaps, recessive axis.
 * Tap/hover a bar for its exact value; the full series is exposed as an accessible list.
 */
export function BarChart({ title, data, total }: { title: string; data: { date: string; value: number }[]; total: number }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const H = 120;
  const sel = active !== null ? data[active] : null;

  return (
    <View className="gap-2 rounded-card bg-white p-4 shadow-card" accessible accessibilityLabel={`${title}: ${total} in total. ${data.map((d) => `${d.date}: ${d.value}`).join(', ')}`}>
      <View className="flex-row items-baseline justify-between">
        <Txt variant="label-lg">{title}</Txt>
        <Txt variant="headline-md">{total}</Txt>
      </View>
      <View className="h-5">
        {sel ? (
          <Txt variant="body-sm" className="text-ink-muted">
            {new Date(sel.date).toLocaleDateString('en-ZM', { day: 'numeric', month: 'short' })}: <Txt variant="label-md">{sel.value}</Txt>
          </Txt>
        ) : (
          <Txt variant="body-sm" className="text-on-surface-variant">Last {data.length} days · tap a bar for details</Txt>
        )}
      </View>
      <View style={{ height: H }} className="flex-row items-end border-b border-surface-container" onPointerLeave={() => setActive(null)}>
        {data.map((d, i) => (
          <Pressable
            key={d.date}
            onPress={() => setActive(i)}
            onHoverIn={() => setActive(i)}
            style={{ height: H }}
            className="flex-1 justify-end px-[1px]"
            accessibilityLabel={`${d.date}: ${d.value}`}
          >
            <View
              style={{ height: Math.max(d.value ? 3 : 0, (d.value / max) * (H - 8)), backgroundColor: '#006B5F', opacity: active === null || active === i ? 1 : 0.45 }}
              className="rounded-t"
            />
          </Pressable>
        ))}
      </View>
      <View className="flex-row justify-between">
        <Txt variant="label-sm" className="font-sans text-on-surface-variant">{data[0] ? new Date(data[0].date).toLocaleDateString('en-ZM', { day: 'numeric', month: 'short' }) : ''}</Txt>
        <Txt variant="label-sm" className="font-sans text-on-surface-variant">max {max}</Txt>
        <Txt variant="label-sm" className="font-sans text-on-surface-variant">Today</Txt>
      </View>
    </View>
  );
}

/** KPI stat tile: the number is the chart. */
export function StatTile({ label, value, icon }: { label: string; value: number | string; icon?: React.ReactNode }) {
  return (
    <View className="min-w-[46%] flex-1 gap-1 rounded-card bg-white p-3 shadow-card">
      <View className="flex-row items-center gap-1.5">
        {icon}
        <Txt variant="label-md" className="text-ink-muted">{label}</Txt>
      </View>
      <Txt variant="headline-lg">{value}</Txt>
    </View>
  );
}
