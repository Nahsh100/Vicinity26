import { Linking, View } from 'react-native';
import { recordContact } from '@/hooks/api';
import { IconButton } from './ui';

export function telUrl(phone: string) {
  return `tel:${phone.replace(/\s/g, '')}`;
}

export function whatsappUrl(phone: string, text?: string) {
  const n = phone.replace(/[^\d]/g, '');
  return `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

export function callProvider(providerId: string, phone: string, listingId?: string) {
  recordContact(providerId, 'PHONE', listingId);
  void Linking.openURL(telUrl(phone));
}

export function whatsappProvider(providerId: string, phone: string, listingId?: string, text?: string) {
  recordContact(providerId, 'WHATSAPP', listingId);
  void Linking.openURL(whatsappUrl(phone, text ?? 'Hi! I found you on Vicinity.'));
}

/** Circular call + WhatsApp triggers (design: "Circular Contact Triggers"). Each tap is recorded for provider analytics. */
export function ContactActions({ providerId, phone, whatsapp, listingId, name, size = 40 }: { providerId: string; phone: string | null; whatsapp: string | null; listingId?: string; name: string; size?: number }) {
  return (
    <View className="flex-row items-center gap-2">
      {phone ? <IconButton icon="call" tone="primary" size={size} label={`Call ${name}`} onPress={() => callProvider(providerId, phone, listingId)} /> : null}
      {whatsapp ? <IconButton icon="chat" tone="whatsapp" size={size} label={`Message ${name} on WhatsApp`} onPress={() => whatsappProvider(providerId, whatsapp, listingId)} /> : null}
    </View>
  );
}
