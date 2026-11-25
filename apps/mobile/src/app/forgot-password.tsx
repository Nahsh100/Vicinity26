import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useForm } from 'react-hook-form';
import { View } from 'react-native';
import type { z } from 'zod';
import { forgotPasswordSchema } from '@vicinity/shared';
import { Screen } from '@/components/Screen';
import { Button, FormField, InlineError, Notice, Txt } from '@/components/ui';
import { api, toApiError } from '@/lib/api';

export default function ForgotPassword() {
  const { control, handleSubmit } = useForm<z.input<typeof forgotPasswordSchema>>({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: '' } });
  const m = useMutation({ mutationFn: (email: string) => api.post('/auth/forgot-password', { email }) });

  return (
    <Screen back title="Reset password">
      <View className="w-full max-w-md gap-4 self-center px-6 pt-2">
        {m.isSuccess ? (
          <>
            <Notice tone="success" icon="mark_email_read" message="If an account exists for that email, we've sent a reset link and code. It expires in 30 minutes." />
            <Button title="I have a code" onPress={() => router.push('/reset-password')} />
            <Button title="Back to sign in" kind="ghost" onPress={() => router.replace('/login')} />
          </>
        ) : (
          <>
            <Txt variant="body-lg" className="text-ink-muted">Enter your account email and we'll send you a link to choose a new password.</Txt>
            <FormField control={control} name="email" label="Email" icon="mail_outline" keyboardType="email-address" autoCapitalize="none" />
            <InlineError message={m.error ? toApiError(m.error).message : null} />
            <Button title="Send reset link" loading={m.isPending} onPress={handleSubmit((v) => m.mutate(v.email))} />
          </>
        )}
      </View>
    </Screen>
  );
}
