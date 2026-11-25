import { Pressable, TextInput, View } from 'react-native';
import { colors } from '@vicinity/shared';
import { Icon, Txt } from './ui';

/** Pill search field (h-12, white, hairline border). When `onPressStatic` is set it renders as a button that opens search. */
export function SearchBar({
  value,
  onChangeText,
  onSubmit,
  onPressStatic,
  onFilter,
  filterCount = 0,
  autoFocus,
  placeholder = 'Search for services or products…',
}: {
  value?: string;
  onChangeText?: (t: string) => void;
  onSubmit?: () => void;
  onPressStatic?: () => void;
  onFilter?: () => void;
  filterCount?: number;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const field = (
    <View className="h-12 flex-1 flex-row items-center rounded-full border border-surface-container bg-white px-4 shadow-card">
      <Icon name="search" size={20} color={colors.outline} />
      {onPressStatic ? (
        <Txt variant="body-md" className="ml-3 flex-1 text-placeholder">{placeholder}</Txt>
      ) : (
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onSubmitEditing={onSubmit}
          returnKeyType="search"
          autoFocus={autoFocus}
          autoCorrect={false}
          placeholder={placeholder}
          placeholderTextColor={colors.placeholder}
          accessibilityLabel="Search"
          className="ml-3 flex-1 font-sans text-body-lg text-ink"
          style={{ outlineStyle: 'none' } as never}
        />
      )}
      {value && onChangeText ? (
        <Pressable accessibilityLabel="Clear search" onPress={() => onChangeText('')} hitSlop={8} className="h-7 w-7 items-center justify-center rounded-full bg-surface-high">
          <Icon name="close" size={16} color={colors.onSurfaceVariant} />
        </Pressable>
      ) : null}
    </View>
  );
  return (
    <View className="flex-row items-center gap-2">
      {onPressStatic ? (
        <Pressable accessibilityRole="search" accessibilityLabel="Search for services or products" onPress={onPressStatic} className="flex-1">
          {field}
        </Pressable>
      ) : (
        field
      )}
      {onFilter ? (
        <Pressable accessibilityLabel={`Filters${filterCount ? `, ${filterCount} active` : ''}`} onPress={onFilter} className="h-12 w-12 items-center justify-center rounded-full bg-surface-low">
          <Icon name="tune" size={20} color={colors.onSurface} />
          {filterCount ? (
            <View className="absolute -right-0.5 -top-0.5 h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1">
              <Txt variant="label-sm" className="text-card">{filterCount}</Txt>
            </View>
          ) : null}
        </Pressable>
      ) : null}
    </View>
  );
}
