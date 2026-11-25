import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { enquirySchema } from '@vicinity/shared';
import { api, toApiError } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { Button, InlineError, Notice, Sheet, TextField, Txt } from './ui';

/** In-app enquiry to a provider (they get a notification and see it in their dashboard). */
export function EnquirySheet({ visible, onClose, providerId, providerName, listing }: { visible: boolean; onClose: () => void; providerId: string; providerName: string; listing?: { id: string; title: string } | null }) {
  const user = useAuth((s) => s.user);
  const [message, setMessage] = useState(listing ? `Hi, I'm interested in "${listing.title}". ` : '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [err, setErr] = useState<string | null>(null);
  const m = useMutation({ mutationFn: (body: unknown) => api.post(`/providers/${providerId}/enquiries`, body) });

  const send = () => {
    setErr(null);
    const parsed = enquirySchema.safeParse({ message, listingId: listing?.id ?? null, contactPhone: phone });
    if (!parsed.success) return setErr(parsed.error.issues[0]?.message ?? 'Check your message');
    m.mutate(parsed.data);
  };
  const close = () => {
    m.reset();
    onClose();
  };

  useEffect(() => {
    if (visible && !user) {
      onClose();
      router.push('/login');
    }
  }, [visible, user, onClose]);
  if (!user) return null;

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title={`Message ${providerName}`}
      footer={m.isSuccess ? <Button title="Done" onPress={close} /> : <Button title="Send enquiry" icon="send" loading={m.isPending} onPress={send} />}
    >
      {m.isSuccess ? (
        <Notice tone="success" icon="check_circle" message={`Sent. ${providerName} will get in touch with you.`} />
      ) : (
        <>
          {listing ? <Txt variant="body-sm" className="text-on-surface-variant">About: {listing.title}</Txt> : null}
          <TextField label="Your message" multiline value={message} onChangeText={setMessage} maxLength={1000} placeholder="What do you need, where and when?" />
          <TextField label="Phone for call-back (optional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" hint="Shared only with this provider" />
          <InlineError message={err ?? (m.error ? toApiError(m.error).message : null)} />
        </>
      )}
    </Sheet>
  );
}
