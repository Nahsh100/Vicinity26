import { useState } from 'react';
import { Pressable, TextInput, View, type TextInputProps } from 'react-native';
import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form';
import { colors } from '@vicinity/shared';
import { Icon } from './Icon';
import { Txt } from './Text';

interface FieldProps extends TextInputProps {
  label?: string;
  error?: string;
  hint?: string;
  icon?: string;
  secure?: boolean;
}

export function TextField({ label, error, hint, icon, secure, multiline, ...props }: FieldProps) {
  const [hidden, setHidden] = useState(!!secure);
  return (
    <View className="gap-1.5">
      {label ? <Txt variant="label-md" className="text-on-surface-variant">{label}</Txt> : null}
      <View
        className={`flex-row items-center rounded-2xl border bg-surface-container-low px-4 ${multiline ? 'min-h-[104px] items-start py-3' : 'h-12'} ${error ? 'border-error' : 'border-transparent'}`}
      >
        {icon ? <View className="mr-2"><Icon name={icon} size={18} color={colors.placeholder} /></View> : null}
        <TextInput
          placeholderTextColor={colors.placeholder}
          secureTextEntry={hidden}
          multiline={multiline}
          textAlignVertical={multiline ? 'top' : 'center'}
          accessibilityLabel={label}
          className="flex-1 font-sans text-body-lg text-ink"
          style={{ outlineStyle: 'none' } as never}
          {...props}
        />
        {secure ? (
          <Pressable accessibilityLabel={hidden ? 'Show password' : 'Hide password'} onPress={() => setHidden((h) => !h)} hitSlop={8}>
            <Icon name={hidden ? 'visibility' : 'visibility_off'} size={18} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Txt variant="body-sm" className="text-error">{error}</Txt>
      ) : hint ? (
        <Txt variant="body-sm" className="text-on-surface-variant">{hint}</Txt>
      ) : null}
    </View>
  );
}

/** TextField bound to react-hook-form. `numeric` converts to number|null. */
export function FormField<T extends FieldValues>({
  control,
  name,
  numeric,
  ...rest
}: Omit<FieldProps, 'value' | 'onChangeText'> & { control: Control<T>; name: Path<T>; numeric?: boolean }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <TextField
          {...rest}
          value={field.value === null || field.value === undefined ? '' : String(field.value)}
          onChangeText={(t) => {
            if (!numeric) return field.onChange(t);
            const cleaned = t.replace(/[^0-9.]/g, '');
            field.onChange(cleaned === '' ? null : Number(cleaned));
          }}
          onBlur={field.onBlur}
          keyboardType={numeric ? 'decimal-pad' : rest.keyboardType}
          error={fieldState.error?.message}
        />
      )}
    />
  );
}

/** Pill segmented choice, e.g. Individual / Business. */
export function Segmented<V extends string>({ options, value, onChange }: { options: { value: V; label: string; icon?: string }[]; value: V; onChange: (v: V) => void }) {
  return (
    <View className="flex-row gap-1 rounded-full bg-surface-container-low p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={o.label}
            onPress={() => onChange(o.value)}
            className={`flex-1 flex-row items-center justify-center gap-1 rounded-full py-2 ${active ? 'bg-white shadow-card' : ''}`}
          >
            {o.icon ? <Icon name={o.icon} size={16} color={active ? colors.primaryDark : colors.muted} /> : null}
            <Txt variant="label-md" className={active ? 'text-ink' : 'text-on-surface-variant'}>{o.label}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Toggle({ label, description, value, onChange }: { label: string; description?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable accessibilityRole="switch" accessibilityLabel={label} accessibilityHint={description} accessibilityState={{ checked: value }} onPress={() => onChange(!value)} className="flex-row items-center justify-between gap-3 py-2">
      <View className="flex-1">
        <Txt variant="label-lg">{label}</Txt>
        {description ? <Txt variant="body-sm" className="text-on-surface-variant">{description}</Txt> : null}
      </View>
      <View className={`h-7 w-12 justify-center rounded-full px-1 ${value ? 'bg-primary' : 'bg-outline-variant'}`}>
        <View className={`h-5 w-5 rounded-full bg-white ${value ? 'self-end' : 'self-start'}`} />
      </View>
    </Pressable>
  );
}
