import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { ReportReason, type ReportTarget } from '@vicinity/shared';
import { api, toApiError } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { Button, Chip, InlineError, Notice, Sheet, TextField, Txt } from './ui';
import { View } from 'react-native';

const LABELS: Record<(typeof ReportReason)[number], string> = {
  SPAM: 'Spam',
  FAKE: 'Fake or misleading',
  OFFENSIVE: 'Offensive',
  FRAUD: 'Scam or fraud',
  INAPPROPRIATE: 'Inappropriate',
  OTHER: 'Something else',
};

export function ReportSheet({ visible, onClose, targetType, targetId }: { visible: boolean; onClose: () => void; targetType: ReportTarget; targetId: string }) {
  const [reason, setReason] = useState<(typeof ReportReason)[number] | null>(null);
  const [details, setDetails] = useState('');
  const signedIn = useAuth((s) => s.status === 'signedIn');
  const m = useMutation({ mutationFn: () => api.post('/reports', { targetType, targetId, reason, details }) });

  const close = () => {
    m.reset();
    setReason(null);
    setDetails('');
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={close} title="Report" footer={m.isSuccess ? <Button title="Done" onPress={close} /> : <Button title="Send report" disabled={!reason} loading={m.isPending} onPress={() => (signedIn ? m.mutate() : (close(), router.push('/login')))} />}>
      {m.isSuccess ? (
        <Notice tone="success" icon="check_circle" message="Thanks. Our moderators will review this." />
      ) : (
        <>
          <Txt variant="body-md" className="text-on-surface-variant">Tell us what's wrong. Reports are private.</Txt>
          <View className="flex-row flex-wrap gap-2">
            {ReportReason.map((r) => <Chip key={r} label={LABELS[r]} active={reason === r} onPress={() => setReason(r)} />)}
          </View>
          <TextField label="Details (optional)" multiline value={details} onChangeText={setDetails} maxLength={1000} />
          <InlineError message={m.error ? toApiError(m.error).message : null} />
        </>
      )}
    </Sheet>
  );
}
