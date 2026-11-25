import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import type { CurrentUser } from '@vicinity/shared';
import { Logo } from '@/components/AppHeader';
import { Screen } from '@/components/Screen';
import { Button, InlineError, TextField, Txt } from '@/components/ui';
import { api, toApiError } from '@/lib/api';
import { useAuth } from '@/store/auth';

/** Shown once after a first phone sign-in: the account exists, it just needs a name. */
export default function CompleteProfile() {
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);
  const [name, setName] = useState(user?.fullName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nameOk = name.trim().length >= 2;

  const save = async () => {
    setError(null);
    setBusy(true);
    try {
      let u = await api.patch<CurrentUser>('/users/me', { fullName: name.trim() });
      if (email.trim() && email.trim().toLowerCase() !== (u.email ?? '')) u = await api.post<CurrentUser>('/auth/email', { email: email.trim() });
      setUser(u);
      router.replace('/');
    } catch (e) {
      setError(toApiError(e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View className="w-full max-w-md gap-5 self-center px-6 pt-8">
        <Logo />
        <View className="gap-1">
          <Txt variant="headline-lg">What's your name?</Txt>
          <Txt variant="body-lg" className="text-on-surface-variant">Providers see it when you message or book them.</Txt>
        </View>
        <TextField label="Full name" icon="person" value={name} onChangeText={setName} autoComplete="name" textContentType="name" autoCapitalize="words" placeholder="e.g. Natasha Mulenga" />
        <TextField
          label="Email (optional)"
          icon="mail"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          hint="For receipts and as a backup way to sign in. We'll send a confirmation link."
        />
        <InlineError message={error} />
        <Button title="Continue" disabled={!nameOk} loading={busy} onPress={() => void save()} />
      </View>
    </Screen>
  );
}
