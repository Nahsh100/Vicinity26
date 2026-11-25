import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@vicinity/shared';
import { Icon } from './Icon';
import { Txt } from './Text';

/** Bottom sheet (Layer 2 elevation). Centered dialog on wide web screens. */
export function Sheet({ visible, onClose, title, children, footer }: { visible: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType={Platform.OS === 'web' ? 'fade' : 'slide'} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <Pressable accessibilityLabel="Close" onPress={onClose} className="flex-1 bg-navy/40" />
        <View
          style={{ paddingBottom: Math.max(insets.bottom, 12), maxHeight: '88%' }}
          className="w-full self-center rounded-t-panel bg-white shadow-raised md:mb-12 md:max-w-xl md:rounded-panel"
        >
          <View className="flex-row items-center justify-between px-margin pb-2 pt-4">
            <Txt variant="headline-sm">{title}</Txt>
            <Pressable accessibilityLabel="Close" onPress={onClose} hitSlop={10} className="h-9 w-9 items-center justify-center rounded-full bg-surface-container-low">
              <Icon name="close" size={18} color={colors.onSurface} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="px-margin py-4 gap-4">
            {children}
          </ScrollView>
          {footer ? <View className="px-margin pt-2">{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
