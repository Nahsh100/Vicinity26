import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useForm } from 'react-hook-form';
import { View } from 'react-native';
import type { z } from 'zod';
import { resetPasswordSchema } from '@vicinity/shared';
import { Screen } from '@/components/Screen';
import { Button, FormField, InlineError, Notice } from '@/components/ui';
import { api, toApiError } from '@/lib/api';

export default function ResetPassword() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { control, handleSubmit } = useForm<z.input<typeof resetPasswordSchema>>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token: token ?? '', password: '' },
  });
  const m = useMutation({ mutationFn: (v: z.input<typeof resetPasswordSchema>) => api.post('/auth/reset-password', v) });

  return (
    <Screen back title="Choose a new password">
      <View className="w-full max-w-md gap-4 self-center px-6 pt-2">
        {m.isSuccess ? (
          <>
            <Notice tone="success" icon="check_circle" message="Password updated. All other sessions have been signed out." />
            <Button title="Sign in" onPress={() => router.replace('/login')} />
          </>
        ) : (
          <>
            {!token ? <FormField control={control} name="token" label="Reset code" autoCapitalize="none" autoCorrect={false} /> : null}
            <FormField control={control} name="password" label="New password" secure hint="At least 8 characters with a letter and a number" />
            <InlineError message={m.error ? toApiError(m.error).message : null} />
            <Button title="Update password" loading={m.isPending} onPress={handleSubmit((v) => m.mutate(v))} />
          </>
        )}
      </View>
    </Screen>
  );
}
