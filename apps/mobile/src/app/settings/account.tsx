import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Share, View } from 'react-native';
import { colors, passwordSchema, type CurrentUser } from '@vicinity/shared';
import { PhoneCodeFlow } from '@/components/PhoneCodeFlow';
import { confirmAction } from '@/components/ReviewCard';
import { Screen } from '@/components/Screen';
import { Button, Card, Icon, InlineError, Notice, Sheet, TextField, Txt } from '@/components/ui';
import { useAuthMethods } from '@/hooks/api';
import { api, toApiError, tokens } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';
import { useAuth } from '@/store/auth';

export default function AccountSettings() {
  const user = useAuth((s) => s.user);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const change = useMutation({
    mutationFn: () => {
      const r = passwordSchema.safeParse(next);
      if (!r.success) throw new Error(r.error.issues[0]?.message);
      return api.post('/auth/change-password', { currentPassword: current, newPassword: next });
    },
    onSuccess: () => {
      setCurrent('');
      setNext('');
    },
  });
  const logoutAll = useMutation({ mutationFn: () => api.post('/auth/logout-all'), onSuccess: () => void useAuth.getState().logout() });
  const exportData = useMutation({
    mutationFn: () => api.get<unknown>('/users/me/export'),
    onSuccess: (data) => {
      const json = JSON.stringify(data, null, 2);
      if (Platform.OS === 'web') {
        const blob = new Blob([json], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'vicinity-data.json';
        a.click();
      } else {
        void Share.share({ message: json, title: 'My Vicinity data' });
      }
    },
  });
  const del = useMutation({
    mutationFn: () => api.del('/users/me'),
    onSuccess: async () => {
      await tokens.clear();
      queryClient.clear();
      useAuth.setState({ status: 'signedOut', user: null });
      router.replace('/');
    },
  });

  return (
    <Screen back title="Account & security">
      <View className="w-full max-w-xl gap-4 self-center px-margin">
        <SignInMethods />
        {user?.hasPassword ? (
        <Card className="gap-3">
          <Txt variant="headline-sm">Change password</Txt>
          <TextField label="Current password" secure value={current} onChangeText={setCurrent} />
          <TextField label="New password" secure value={next} onChangeText={setNext} hint="At least 8 characters with a letter and a number" />
          {change.isSuccess ? <Notice tone="success" message="Password changed" /> : null}
          <InlineError message={change.error ? toApiError(change.error).message : null} />
          <Button title="Update password" size="sm" disabled={!current || !next} loading={change.isPending} onPress={() => change.mutate()} />
        </Card>
        ) : null}
        <Card className="gap-2">
          <Txt variant="headline-sm">Sessions</Txt>
          <Txt variant="body-sm" className="text-on-surface-variant">Sign out of Vicinity on every phone and browser, including this one.</Txt>
          <Button title="Sign out everywhere" size="sm" kind="outline" loading={logoutAll.isPending} onPress={() => logoutAll.mutate()} />
        </Card>
        <Card className="gap-2">
          <Txt variant="headline-sm">Your data</Txt>
          <Txt variant="body-sm" className="text-on-surface-variant">Download a copy of your profile, storefront, listings, reviews, favourites and memberships.</Txt>
          <InlineError message={exportData.error ? toApiError(exportData.error).message : null} />
          <Button title="Export my data" icon="download" size="sm" kind="secondary" loading={exportData.isPending} onPress={() => exportData.mutate()} />
        </Card>
        <Card className="gap-2 border border-error-container">
          <Txt variant="headline-sm" className="text-error">Delete account</Txt>
          <Txt variant="body-sm" className="text-on-surface-variant">Your personal details are erased and your storefront and listings are removed from Vicinity. Reviews you wrote stay, shown as "Deleted user". This cannot be undone.</Txt>
          <InlineError message={del.error ? toApiError(del.error).message : null} />
          <Button title="Delete my account" kind="danger" size="sm" loading={del.isPending} onPress={() => confirmAction('Delete your account?', 'This permanently removes your profile and storefront.', () => del.mutate(), 'Delete')} />
        </Card>
      </View>
    </Screen>
  );
}

/** Phone (SMS code) and email sign-in for this account. */
function SignInMethods() {
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);
  const methods = useAuthMethods();
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [email, setEmail] = useState('');
  const addEmail = useMutation({
    mutationFn: () => api.post<CurrentUser>('/auth/email', { email: email.trim() }),
    onSuccess: (u) => {
      setUser(u);
      setEmail('');
    },
  });
  if (!user) return null;
  return (
    <Card className="gap-3">
      <Txt variant="headline-sm">Sign-in methods</Txt>
      {methods.data?.phone ? (
        <View className="flex-row items-center gap-3">
          <View className="h-10 w-10 items-center justify-center rounded-full bg-secondary-fixed/50"><Icon name="smartphone" size={20} color={colors.primaryDark} /></View>
          <View className="flex-1">
            <Txt variant="label-lg">Phone (SMS code)</Txt>
            <Txt variant="body-sm" className="text-on-surface-variant">
              {user.phoneVerified && user.phone ? `${user.phone.replace(/^\+260/, '0')} · verified` : user.phone ? `${user.phone.replace(/^\+260/, '0')} · not verified yet` : 'Not set up'}
            </Txt>
          </View>
          <Button title={user.phoneVerified ? 'Change' : 'Verify'} size="sm" kind="soft" onPress={() => setPhoneOpen(true)} />
        </View>
      ) : null}
      <View className="flex-row items-center gap-3">
        <View className="h-10 w-10 items-center justify-center rounded-full bg-secondary-fixed/50"><Icon name="mail" size={20} color={colors.primaryDark} /></View>
        <View className="flex-1">
          <Txt variant="label-lg">Email{user.hasPassword ? ' & password' : ''}</Txt>
          <Txt variant="body-sm" className="text-on-surface-variant">
            {user.email ? `${user.email} · ${user.emailVerified ? 'confirmed' : 'check your inbox to confirm'}` : 'No email yet'}
          </Txt>
        </View>
      </View>
      {user.linkedProviders.length ? (
        <View className="flex-row items-center gap-3">
          <View className="h-10 w-10 items-center justify-center rounded-full bg-secondary-fixed/50"><Icon name="link" size={20} color={colors.primaryDark} /></View>
          <View className="flex-1">
            <Txt variant="label-lg">Linked accounts</Txt>
            <Txt variant="body-sm" className="text-on-surface-variant">{user.linkedProviders.map((p) => (p === 'GOOGLE' ? 'Google' : 'Apple')).join(' and ')} · sign in with one tap</Txt>
          </View>
        </View>
      ) : null}
      {!user.email || !user.emailVerified ? (
        <View className="gap-2">
          <TextField label={user.email ? 'Use a different email' : 'Add an email'} keyboardType="email-address" autoCapitalize="none" autoComplete="email" value={email} onChangeText={setEmail} placeholder="you@example.com" />
          <InlineError message={addEmail.error ? toApiError(addEmail.error).message : null} />
          <Button title="Save email" size="sm" kind="soft" disabled={!email.includes('@')} loading={addEmail.isPending} onPress={() => addEmail.mutate()} />
        </View>
      ) : null}
      {!user.hasPassword && user.emailVerified ? (
        <Button title="Set a password" size="sm" kind="ghost" onPress={() => router.push('/forgot-password')} />
      ) : null}
      <Sheet visible={phoneOpen} onClose={() => setPhoneOpen(false)} title={user.phoneVerified ? 'Change sign-in number' : 'Verify your phone'}>
        <Txt variant="body-md" className="text-on-surface-variant">You can then sign in with a code sent to this number. It also lets you post reviews.</Txt>
        <PhoneCodeFlow
          startPath="/auth/phone/link/start"
          initialPhone={user.phoneVerified ? '' : (user.phone ?? '')}
          submitLabel="Verify number"
          verify={async (phone, code) => {
            const u = await api.post<CurrentUser>('/auth/phone/link/verify', { phone, code });
            setUser(u);
            setPhoneOpen(false);
          }}
        />
      </Sheet>
    </Card>
  );
}
