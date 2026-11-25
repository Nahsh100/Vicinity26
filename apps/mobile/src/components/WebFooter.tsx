import { router, type Href } from 'expo-router';
import { Pressable, View } from 'react-native';
import { colors } from '@vicinity/shared';
import { useCategories } from '@/hooks/api';
import { useLocation } from '@/store/location';
import { useSearch } from '@/store/search';
import { Logo } from './AppHeader';
import { Icon, Txt } from './ui';

const AREAS = [
  ['Kabulonga', -15.417, 28.342],
  ['Woodlands', -15.429, 28.317],
  ['Rhodes Park', -15.411, 28.302],
  ['Roma', -15.379, 28.32],
  ['Chelston', -15.368, 28.383],
  ['Kalingalinga', -15.414, 28.327],
] as const;

function FooterLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="link" className="py-1">
      <Txt variant="body-md" className="text-on-surface-variant">{label}</Txt>
    </Pressable>
  );
}

/** Desktop web footer (Stitch "Web Home Discovery"). Links go to real destinations only. */
export function WebFooter() {
  const cats = useCategories();
  const go = (h: Href) => router.push(h);
  return (
    <View className="mt-16 bg-surface-container-low">
      <View className="w-full max-w-[1280px] flex-row flex-wrap gap-10 self-center px-10 py-12">
        <View className="min-w-[240px] flex-1 gap-3">
          <Logo size={32} />
          <Txt variant="body-md" className="max-w-xs text-on-surface-variant">
            Zambia's neighbourhood directory for local services, products and skilled people — from registered businesses to independent pros.
          </Txt>
          <View className="flex-row items-center gap-1.5">
            <Icon name="verified_user" size={16} color={colors.primaryDark} />
            <Txt variant="label-md" className="text-primary-dark">Find. Connect. Support Local.</Txt>
          </View>
        </View>
        <View className="min-w-[180px] flex-1 gap-1">
          <Txt variant="headline-sm" className="mb-2">Popular Services</Txt>
          {(cats.data ?? []).slice(0, 5).map((c) => (
            <FooterLink key={c.id} label={c.name} onPress={() => go(`/category/${c.slug}`)} />
          ))}
        </View>
        <View className="min-w-[180px] flex-1 gap-1">
          <Txt variant="headline-sm" className="mb-2">Lusaka Neighbourhoods</Txt>
          {AREAS.map(([name, lat, lng]) => (
            <FooterLink
              key={name}
              label={name}
              onPress={() => {
                useLocation.getState().setManual({ lat, lng, label: name });
                useSearch.getState().setQuery('');
                go('/search');
              }}
            />
          ))}
        </View>
        <View className="min-w-[180px] flex-1 gap-1">
          <Txt variant="headline-sm" className="mb-2">Support & Community</Txt>
          <FooterLink label="Help Center" onPress={() => go('/help')} />
          <FooterLink label="Privacy" onPress={() => go('/settings/privacy')} />
          <FooterLink label="Become a Provider" onPress={() => go('/become-provider')} />
          <FooterLink label="Organizations & Groups" onPress={() => go('/organizations')} />
        </View>
      </View>
      <View className="w-full max-w-[1280px] self-center border-t border-surface-container px-10 py-5">
        <Txt variant="body-sm" className="text-on-surface-variant">© {new Date().getFullYear()} Vicinity Zambia</Txt>
      </View>
    </View>
  );
}
