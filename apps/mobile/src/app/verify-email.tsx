import { useMutation } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { colors } from '@vicinity/shared';
import { Screen } from '@/components/Screen';
import { Button, Icon, InlineError, Notice, TextField, Txt } from '@/components/ui';
import { api, toApiError } from '@/lib/api';
import { useAuth } from '@/store/auth';

/** Email verification: opened from the emailed link (?token=) or by typing the code. */
export default function VerifyEmail() {
  const params = useLocalSearchParams<{ token?: string }>();
  const { user, status, refreshUser } = useAuth();
  const [code, setCode] = useState(params.token ?? '');
  const verify = useMutation({
    mutationFn: (token: string) => api.post('/auth/verify-email', { token: token.trim() }),
    onSuccess: () => void refreshUser(),
  });
  const resend = useMutation({ mutationFn: () => api.post<{ sent: boolean }>('/auth/resend-verification') });

  useEffect(() => {
    if (params.token) verify.mutate(params.token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.token]);

  const done = verify.isSuccess || user?.emailVerified;

  return (
    <Screen back title="Confirm your email">
      <View className="w-full max-w-md gap-4 self-center px-6 pt-4">
        <View className="h-20 w-20 items-center justify-center self-center rounded-full bg-primary-soft">
          <Icon name={done ? 'mark_email_read' : 'mark_email_unread'} size={40} color={colors.primaryDark} />
        </View>
        {done ? (
          <>
            <Txt variant="headline-md" className="text-center">Email confirmed</Txt>
            <Button title="Continue" onPress={() => router.replace('/')} />
          </>
        ) : (
          <>
            <Txt variant="body-lg" className="text-center text-ink-muted">
              We sent a confirmation link{user ? ` to ${user.email}` : ''}. Tap the link, or enter the code from the email.
            </Txt>
            <TextField label="Confirmation code" value={code} onChangeText={setCode} autoCapitalize="none" autoCorrect={false} />
            <InlineError message={verify.error ? toApiError(verify.error).message : null} />
            <Button title="Confirm" disabled={code.trim().length < 10} loading={verify.isPending} onPress={() => verify.mutate(code)} />
            {status === 'signedIn' ? (
              <>
                {resend.isSuccess ? <Notice tone="success" message="A new email is on its way." /> : null}
                <InlineError message={resend.error ? toApiError(resend.error).message : null} />
                <Button title="Send a new email" kind="ghost" loading={resend.isPending} onPress={() => resend.mutate()} />
              </>
            ) : null}
            <Button title="Do this later" kind="ghost" onPress={() => router.replace('/')} />
          </>
        )}
      </View>
    </Screen>
  );
}
