import { zodResolver } from '@hookform/resolvers/zod';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { View } from 'react-native';
import { loginSchema, type LoginInput } from '@vicinity/shared';
import { Logo } from '@/components/AppHeader';
import { PhoneCodeFlow } from '@/components/PhoneCodeFlow';
import { SocialSignIn } from '@/components/social/SocialSignIn';
import { AgreeToLegal } from '@/components/LegalDocument';
import { Screen } from '@/components/Screen';
import { Button, FormField, InlineError, Segmented, Txt } from '@/components/ui';
import { useAuthMethods } from '@/hooks/api';
import { toApiError } from '@/lib/api';
import { useAuth } from '@/store/auth';


function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export default function Login() {
  const { method: initial } = useLocalSearchParams<{ method?: string }>();
  const methods = useAuthMethods();
  const phoneOn = !!methods.data?.phone;
  const [method, setMethod] = useState<'phone' | 'email'>(initial === 'email' ? 'email' : 'phone');
  const showPhone = phoneOn && method === 'phone';
  const loginWithPhone = useAuth((s) => s.loginWithPhone);

  return (
    <Screen back>
      <View className="w-full max-w-md gap-5 self-center px-6 pt-4">
        <Logo />
        <View className="gap-1">
          <Txt variant="headline-lg">Welcome</Txt>
          <Txt variant="body-lg" className="text-on-surface-variant">
            {showPhone ? 'Sign in or create an account with your phone number. No password needed.' : 'Sign in to save providers, contact them and manage your storefront.'}
          </Txt>
        </View>
        <SocialSignIn />
        {phoneOn ? (
          <Segmented
            options={[
              { value: 'phone', label: 'Phone', icon: 'smartphone' },
              { value: 'email', label: 'Email', icon: 'mail' },
            ]}
            value={method}
            onChange={setMethod}
          />
        ) : null}
        {showPhone ? (
          <PhoneCodeFlow
            startPath="/auth/phone/start"
            submitLabel="Verify & continue"
            verify={async (phone, code) => {
              const r = await loginWithPhone(phone, code);
              if (r.isNewUser || !r.user.fullName) router.replace('/complete-profile');
              else leave();
            }}
          />
        ) : (
          <EmailLogin />
        )}
        <View className="flex-row justify-center gap-1">
          <Txt variant="body-md" className="text-on-surface-variant">New to Vicinity?</Txt>
          {showPhone ? (
            <Txt variant="body-md" className="text-on-surface-variant">Enter your number above to sign up.</Txt>
          ) : (
            <Link href="/register" replace><Txt variant="label-md" className="text-primary-dark">Create an account</Txt></Link>
          )}
        </View>
        <AgreeToLegal />
      </View>
    </Screen>
  );
}

function EmailLogin() {
  const login = useAuth((s) => s.login);
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });
  const submit = handleSubmit(async (v) => {
    setError(null);
    try {
      await login(v);
      leave();
    } catch (e) {
      setError(toApiError(e).message);
    }
  });
  return (
    <View className="gap-4">
      <InlineError message={error} />
      <FormField control={control} name="email" label="Email" icon="mail_outline" keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" />
      <FormField control={control} name="password" label="Password" icon="lock_outline" secure autoComplete="password" textContentType="password" onSubmitEditing={() => void submit()} />
      <Link href="/forgot-password" className="self-end">
        <Txt variant="label-md" className="text-primary-dark">Forgot password?</Txt>
      </Link>
      <Button title="Sign in" loading={formState.isSubmitting} onPress={() => void submit()} />
    </View>
  );
}
