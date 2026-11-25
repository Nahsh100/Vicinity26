import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { isValidPhone, normalizePhone, type CurrentUser } from '@vicinity/shared';
import { SingleImagePicker } from '@/components/MediaPicker';
import { Screen } from '@/components/Screen';
import { Button, InlineError, Notice, TextField, Txt } from '@/components/ui';
import { api, toApiError } from '@/lib/api';
import { useAuth } from '@/store/auth';

export default function EditPersonalInfo() {
  const { user, setUser } = useAuth();
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [locationName, setLocationName] = useState(user?.locationName ?? '');
  const [avatar, setAvatar] = useState<{ id: string; url: string } | null>(user?.avatarUrl ? { id: '', url: user.avatarUrl } : null);
  const m = useMutation({
    mutationFn: async () => {
      if (fullName.trim().length < 2) throw new Error('Enter your name');
      if (phone && !isValidPhone(phone)) throw new Error('Enter a valid phone number');
      return api.patch<CurrentUser>('/users/me', {
        fullName,
        phone: phone ? normalizePhone(phone) : '',
        bio,
        locationName,
        ...(avatar?.id ? { avatarMediaId: avatar.id } : {}),
      });
    },
    onSuccess: (u) => setUser(u),
  });

  if (!user) {
    return (
      <Screen back title="Personal information">
        <Button title="Sign in" className="mx-margin" onPress={() => router.push('/login')} />
      </Screen>
    );
  }

  return (
    <Screen back title="Personal information">
      <View className="w-full max-w-xl gap-4 self-center px-margin">
        <SingleImagePicker label="Profile photo" value={avatar} onChange={(m2) => setAvatar(m2 ? { id: m2.id, url: m2.url } : null)} purpose="AVATAR" />
        <TextField label="Full name" value={fullName} onChangeText={setFullName} />
        <TextField label="Email" value={user.email ?? ''} editable={false} placeholder="No email yet" hint={user.email ? "Contact support to change a confirmed email" : "Add one in Account & security"} />
        <TextField label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" editable={!user.phoneVerified} hint={user.phoneVerified ? "Your sign-in number. Change it in Account & security (we confirm by SMS)." : undefined} />
        <TextField label="Where you live (area)" value={locationName} onChangeText={setLocationName} placeholder="e.g. Woodlands, Lusaka" />
        <TextField label="Bio" multiline value={bio} onChangeText={setBio} maxLength={500} />
        <Txt variant="body-sm" className="text-on-surface-variant">Member since {new Date(user.createdAt).toLocaleDateString('en-ZM', { month: 'long', year: 'numeric' })}</Txt>
        {m.isSuccess ? <Notice tone="success" message="Saved" /> : null}
        <InlineError message={m.error ? toApiError(m.error).message : null} />
        <Button title="Save" loading={m.isPending} onPress={() => m.mutate()} />
      </View>
    </Screen>
  );
}
