import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { colors, isValidPhone, normalizePhone, OTP_CODE_LENGTH, ZM_MOBILE } from '@vicinity/shared';
import { api, toApiError } from '@/lib/api';
import { Button, Icon, InlineError, Notice, TextField, Txt } from './ui';

interface StartResponse {
  sent: boolean;
  expiresAt: string;
  resendInSeconds: number;
  codeLength: number;
  devMode: boolean;
}

/** Six boxes over one real input: paste, SMS autofill (iOS one-time-code, Android sms-otp) and screen readers all work. */
export function CodeInput({ value, onChange, onComplete, length = OTP_CODE_LENGTH, error }: { value: string; onChange: (v: string) => void; onComplete?: (v: string) => void; length?: number; error?: boolean }) {
  const ref = useRef<ComponentRef<typeof TextInput>>(null);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => ref.current?.focus(), 250);
    return () => clearTimeout(t);
  }, []);
  return (
    <Pressable onPress={() => ref.current?.focus()} className="relative" accessible={false}>
      <View className="flex-row justify-between gap-2" pointerEvents="none">
        {Array.from({ length }, (_, i) => {
          const ch = value[i] ?? '';
          const active = focused && (i === value.length || (i === length - 1 && value.length === length));
          return (
            <View
              key={i}
              className={`h-14 flex-1 items-center justify-center rounded-2xl border-2 ${error ? 'border-error bg-error-container/30' : active ? 'border-primary bg-white' : ch ? 'border-transparent bg-secondary-fixed/50' : 'border-transparent bg-surface-container-low'}`}
            >
              <Txt variant="headline-md">{ch}</Txt>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={(t) => {
          const v = t.replace(/\D/g, '').slice(0, length);
          onChange(v);
          if (v.length === length) onComplete?.(v);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={length}
        accessibilityLabel={`${length}-digit code`}
        caretHidden
        style={{ position: 'absolute', inset: 0, opacity: 0.02, color: 'transparent', fontSize: 1 } as never}
      />
    </Pressable>
  );
}

/**
 * Phone number → SMS code. `startPath`/`verify` decide what the code is for: signing in
 * (/auth/phone/start) or adding a sign-in number to the current account (/auth/phone/link/start).
 */
export function PhoneCodeFlow({
  startPath,
  verify,
  submitLabel = 'Continue',
  initialPhone = '',
}: {
  startPath: '/auth/phone/start' | '/auth/phone/link/start';
  verify: (phone: string, code: string) => Promise<void>;
  submitLabel?: string;
  initialPhone?: string;
}) {
  const [phone, setPhone] = useState(initialPhone.replace(/^\+260/, '0'));
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [info, setInfo] = useState<StartResponse | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [sentAt, setSentAt] = useState(0);

  useEffect(() => {
    if (!sentTo) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [sentTo]);

  const normalized = phone ? normalizePhone(phone) : '';
  const phoneOk = !!phone && isValidPhone(phone) && ZM_MOBILE.test(normalized);
  const wait = info ? Math.max(0, Math.ceil((sentAt + info.resendInSeconds * 1000 - now) / 1000)) : 0;

  const send = async () => {
    setError(null);
    setBusy(true);
    try {
      const r = await api.post<StartResponse>(startPath, { phone: normalized });
      setInfo(r);
      setSentTo(normalized);
      setSentAt(Date.now());
      setNow(Date.now());
      setCode('');
    } catch (e) {
      setError(toApiError(e).message);
    } finally {
      setBusy(false);
    }
  };

  const submit = async (c = code) => {
    if (!sentTo || c.length !== OTP_CODE_LENGTH || busy) return;
    setError(null);
    setBusy(true);
    try {
      await verify(sentTo, c);
    } catch (e) {
      setError(toApiError(e).message);
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  if (!sentTo) {
    return (
      <View className="gap-4">
        <TextField
          label="Mobile number"
          icon="call"
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          placeholder="097 123 4567"
          value={phone}
          onChangeText={setPhone}
          onSubmitEditing={() => phoneOk && void send()}
          error={phone.length > 9 && !phoneOk ? 'Enter a Zambian mobile number (MTN, Airtel or Zamtel)' : undefined}
          hint="We'll text you a 6-digit code. Standard SMS rates may apply."
        />
        <InlineError message={error} />
        <Button title="Send code" icon="sms" disabled={!phoneOk} loading={busy} onPress={() => void send()} />
      </View>
    );
  }

  return (
    <View className="gap-4">
      <View className="flex-row items-center gap-3 rounded-2xl bg-secondary-fixed/40 p-3">
        <Icon name="sms" size={20} color={colors.primaryDark} />
        <Txt variant="body-md" className="flex-1">
          Code sent to <Txt variant="label-lg">{sentTo.replace(/^\+260/, '0')}</Txt>
        </Txt>
        <Pressable onPress={() => { setSentTo(null); setError(null); }} hitSlop={8}>
          <Txt variant="label-md" className="text-primary-dark">Change</Txt>
        </Pressable>
      </View>
      {info?.devMode ? <Notice tone="warning" icon="developer_mode" message="Development mode: no SMS was sent. The code is printed in the API log." /> : null}
      <CodeInput value={code} onChange={setCode} onComplete={(c) => void submit(c)} error={!!error} />
      <InlineError message={error} />
      <Button title={submitLabel} disabled={code.length !== OTP_CODE_LENGTH} loading={busy} onPress={() => void submit()} />
      <View className="flex-row items-center justify-center gap-1">
        <Txt variant="body-sm" className="text-on-surface-variant">Didn't get it?</Txt>
        {wait > 0 ? (
          <Txt variant="label-md" className="text-on-surface-variant">Resend in {wait}s</Txt>
        ) : (
          <Pressable onPress={() => void send()} disabled={busy} hitSlop={8}>
            <Txt variant="label-md" className="text-primary-dark">Resend code</Txt>
          </Pressable>
        )}
      </View>
    </View>
  );
}
