import { zodResolver } from '@hookform/resolvers/zod';
import { Link, router } from 'expo-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { View } from 'react-native';
import type { z } from 'zod';
import { registerSchema } from '@vicinity/shared';
import { Logo } from '@/components/AppHeader';
import { Screen } from '@/components/Screen';
import { Button, FormField, InlineError, Txt } from '@/components/ui';
import { toApiError } from '@/lib/api';
import { useAuth } from '@/store/auth';

type Form = z.input<typeof registerSchema>;

/** One account for everyone: customers can become providers later from their profile. */
export default function Register() {
  const register = useAuth((s) => s.register);
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, formState, setError: setFieldError } = useForm<Form>({
    resolver: zodResolver(registerSchema),
    defaultValues: { fullName: '', email: '', phone: '', password: '' },
  });

  const submit = handleSubmit(async (v) => {
    setError(null);
    try {
      await register(registerSchema.parse(v));
      router.replace('/verify-email');
    } catch (e) {
      const err = toApiError(e);
      if (err.code === 'EMAIL_TAKEN') setFieldError('email', { message: err.message });
      else if (err.details) Object.entries(err.details).forEach(([k, m]) => setFieldError(k as keyof Form, { message: m[0] }));
      else setError(err.message);
    }
  });

  return (
    <Screen back>
      <View className="w-full max-w-md gap-4 self-center px-6 pt-4">
        <Logo />
        <View className="gap-1">
          <Txt variant="headline-lg">Create your account</Txt>
          <Txt variant="body-lg" className="text-ink-muted">Find local services — and list your own whenever you're ready.</Txt>
        </View>
        <InlineError message={error} />
        <FormField control={control} name="fullName" label="Full name" icon="person_outline" autoComplete="name" textContentType="name" />
        <FormField control={control} name="email" label="Email" icon="mail_outline" keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
        <FormField control={control} name="phone" label="Phone (optional)" icon="call" keyboardType="phone-pad" placeholder="097 123 4567" hint="Zambian or international number" />
        <FormField control={control} name="password" label="Password" icon="lock_outline" secure hint="At least 8 characters with a letter and a number" onSubmitEditing={() => void submit()} />
        <Button title="Create account" loading={formState.isSubmitting} onPress={() => void submit()} />
        <Txt variant="body-sm" className="text-center text-on-surface-variant">By continuing you agree to Vicinity's terms and privacy policy.</Txt>
        <View className="flex-row justify-center gap-1">
          <Txt variant="body-md" className="text-on-surface-variant">Already have an account?</Txt>
          <Link href="/login" replace><Txt variant="label-md" className="text-primary-dark">Sign in</Txt></Link>
        </View>
        <View className="flex-row justify-center gap-1 pb-6">
          <Txt variant="body-md" className="text-on-surface-variant">Prefer your phone?</Txt>
          <Link href="/login?method=phone" replace><Txt variant="label-md" className="text-primary-dark">Sign up with an SMS code</Txt></Link>
        </View>
      </View>
    </Screen>
  );
}
