import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { colors, isValidPhone, MOBILE_MONEY_PHONE, normalizePhone, PLAN_TERMS_MONTHS, type PaymentSummary, type SubscriptionPlan } from '@vicinity/shared';
import { Screen, useWide } from '@/components/Screen';
import { Badge, Button, ErrorState, Icon, InlineError, ListSkeleton, Notice, Sheet, TextField, Txt } from '@/components/ui';
import { useMyPayments, useMyProvider, usePayment, usePlans, useSubscription } from '@/hooks/api';
import { api, toApiError } from '@/lib/api';

const FEATURES: { key: string; label: (v: number | boolean) => string }[] = [
  { key: 'maxListings', label: (v) => `Up to ${v} listings` },
  { key: 'maxPortfolioProjects', label: (v) => `${v} portfolio projects` },
  { key: 'maxGalleryMedia', label: (v) => `${v} gallery photos` },
  { key: 'maxLocations', label: (v) => `${v} business location${v === 1 ? '' : 's'}` },
  { key: 'advancedAnalytics', label: (v) => (v ? 'Advanced analytics' : 'Basic analytics') },
];
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Lusaka' }) : '');
const zmw = (n: number) => `ZMW ${n.toLocaleString('en-ZM', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

/** Plan & billing: buy Pro/Business with MTN, Airtel or Zamtel mobile money (Lenco USSD prompt). */
export default function PlanBilling() {
  const { plan: preselect } = useLocalSearchParams<{ plan?: string }>();
  const sub = useSubscription();
  const plans = usePlans();
  const history = useMyPayments();
  const wide = useWide();
  const [checkoutPlan, setCheckoutPlan] = useState<SubscriptionPlan | null>(null);
  const [watching, setWatching] = useState<string | null>(null);

  const s = sub.data;
  const current = plans.data?.find((p) => p.code === (s?.plan.code ?? 'FREE'));

  useEffect(() => {
    if (preselect && plans.data && s?.paymentsAvailable) setCheckoutPlan(plans.data.find((p) => p.code === preselect.toUpperCase() && p.priceMonthly > 0) ?? null);
  }, [preselect, plans.data, s?.paymentsAvailable]);

  if (sub.isLoading || plans.isLoading) return <Screen back title="Plan & billing"><View className="px-margin"><ListSkeleton rows={3} /></View></Screen>;
  if (sub.isError || plans.isError) return <Screen back title="Plan & billing"><ErrorState error={sub.error ?? plans.error} onRetry={() => { void sub.refetch(); void plans.refetch(); }} /></Screen>;

  return (
    <Screen back title="Plan & billing" subtitle="Grow your storefront" maxWidth="max-w-5xl">
      <View className="gap-5 px-margin">
        <View className="gap-3 overflow-hidden rounded-panel bg-primary-dark p-5">
          <View className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/10" />
          <Txt variant="eyebrow" className="text-white/75">CURRENT PLAN</Txt>
          <View className="flex-row items-end justify-between gap-3">
            <View className="flex-1">
              <Txt variant="display-sm" className="text-white">{s?.plan.name ?? 'Free'}</Txt>
              <Txt variant="body-md" className="text-white/80">
                {s?.plan.code !== 'FREE' && s?.currentPeriodEnd ? `Active until ${fmtDate(s.currentPeriodEnd)}` : 'Free forever. Basic discovery is never paywalled.'}
              </Txt>
            </View>
            {current && current.priceMonthly > 0 ? <Badge label={`${zmw(current.priceMonthly)}/mo`} tone="glass" /> : null}
          </View>
          <View className="flex-row flex-wrap gap-2">
            {FEATURES.map((f) => (s?.entitlements[f.key] !== undefined ? (
              <View key={f.key} className="rounded-full bg-white/15 px-3 py-1"><Txt variant="label-sm" className="text-white">{f.label(s.entitlements[f.key]!)}</Txt></View>
            ) : null))}
          </View>
        </View>

        {s?.pendingPayment ? (
          <Pressable onPress={() => setWatching(s.pendingPayment!.id)} className="flex-row items-center gap-3 rounded-3xl bg-amber-soft p-4">
            <ActivityIndicator color="#92400E" />
            <View className="flex-1">
              <Txt variant="label-lg">Payment waiting for approval</Txt>
              <Txt variant="body-sm" className="text-on-surface-variant">{zmw(s.pendingPayment.amount)} to {s.pendingPayment.payerPhone}. Tap to see its status.</Txt>
            </View>
            <Icon name="chevron_right" size={20} color="#92400E" />
          </Pressable>
        ) : null}
        {!s?.paymentsAvailable ? <Notice tone="info" icon="info" message="Online payment is not switched on yet. Contact Vicinity support to upgrade your plan." /> : null}

        <View className={wide ? 'flex-row gap-4' : 'gap-4'}>
          {plans.data?.map((p) => {
            const isCurrent = p.code === (s?.plan.code ?? 'FREE');
            const isTop = p.code === 'PRO';
            const lower = !!current && p.priceMonthly < current.priceMonthly;
            return (
              <View key={p.id} className={`gap-4 rounded-3xl bg-white p-5 shadow-card ${wide ? 'flex-1' : ''} ${isTop ? 'border-2 border-primary' : ''}`}>
                <View className="flex-row items-center justify-between">
                  <Txt variant="headline-md">{p.name}</Txt>
                  {isCurrent ? <Badge label="Current" tone="teal" icon="check" /> : isTop ? <Badge label="Recommended" tone="mint" /> : null}
                </View>
                <View className="flex-row items-end gap-1">
                  <Txt variant="display-sm">{p.priceMonthly ? zmw(p.priceMonthly) : 'Free'}</Txt>
                  {p.priceMonthly ? <Txt variant="body-md" className="pb-1.5 text-on-surface-variant">/ month</Txt> : null}
                </View>
                <View className="gap-2">
                  {FEATURES.map((f) => (p.entitlements[f.key] !== undefined ? (
                    <View key={f.key} className="flex-row items-center gap-2">
                      <Icon name={f.key === 'advancedAnalytics' && !p.entitlements[f.key] ? 'remove' : 'check_circle'} size={18} color={f.key === 'advancedAnalytics' && !p.entitlements[f.key] ? colors.outline : colors.primaryDark} fill />
                      <Txt variant="body-md">{f.label(p.entitlements[f.key]!)}</Txt>
                    </View>
                  ) : null))}
                </View>
                {p.priceMonthly > 0 ? (
                  <Button
                    title={isCurrent ? 'Extend plan' : lower ? 'Available after your plan ends' : `Upgrade to ${p.name}`}
                    kind={isTop ? 'primary' : 'soft'}
                    disabled={!s?.paymentsAvailable || lower || !!s?.pendingPayment}
                    onPress={() => setCheckoutPlan(p)}
                  />
                ) : null}
              </View>
            );
          })}
        </View>

        <View className="flex-row items-start gap-3 rounded-3xl bg-secondary-fixed/40 p-4">
          <Icon name="lock" size={20} color={colors.primaryDark} />
          <Txt variant="body-sm" className="flex-1 text-on-surface-variant">
            Payments are processed by Lenco. You approve each payment on your own phone with your mobile money PIN; Vicinity never sees your PIN. Plans do not renew automatically. Upgrading moves your unused days to the new plan.
          </Txt>
        </View>

        <View className="gap-3">
          <Txt variant="headline-sm">Payment history</Txt>
          {history.data?.length ? (
            <View className="overflow-hidden rounded-3xl bg-white shadow-card">
              {history.data.map((h, i) => (
                <Pressable key={h.id} onPress={() => setWatching(h.id)} className={`flex-row items-center gap-3 p-4 ${i ? 'border-t border-surface-container' : ''}`}>
                  <StatusDot status={h.status} />
                  <View className="flex-1">
                    <Txt variant="label-lg">{h.plan?.name ?? 'Plan'} · {h.months} month{h.months === 1 ? '' : 's'}</Txt>
                    <Txt variant="body-sm" className="text-on-surface-variant">{fmtDate(h.createdAt)} · {h.payerPhone}{h.simulated ? ' · test' : ''}</Txt>
                  </View>
                  <View className="items-end">
                    <Txt variant="label-lg">{zmw(h.amount)}</Txt>
                    <Txt variant="label-sm" className="text-on-surface-variant">{STATUS_LABEL[h.status]}</Txt>
                  </View>
                </Pressable>
              ))}
            </View>
          ) : (
            <Txt variant="body-md" className="text-on-surface-variant">No payments yet.</Txt>
          )}
        </View>
      </View>

      {checkoutPlan ? (
        <CheckoutSheet
          plan={checkoutPlan}
          onClose={() => setCheckoutPlan(null)}
          onStarted={(p) => {
            setCheckoutPlan(null);
            setWatching(p.id);
          }}
        />
      ) : null}
      {watching ? <PaymentStatusSheet id={watching} onClose={() => setWatching(null)} onRetry={(code) => { setWatching(null); setCheckoutPlan(plans.data?.find((p) => p.code === code) ?? null); }} /> : null}
    </Screen>
  );
}

const STATUS_LABEL: Record<PaymentSummary['status'], string> = {
  PENDING: 'Waiting for approval',
  SUCCEEDED: 'Paid',
  FAILED: 'Failed',
  REFUNDED: 'Refunded',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
};

function StatusDot({ status }: { status: PaymentSummary['status'] }) {
  const map = { SUCCEEDED: ['check_circle', colors.primaryDark], PENDING: ['schedule', '#B45309'], REFUNDED: ['undo', colors.outline] } as Record<string, [string, string]>;
  const [icon, color] = map[status] ?? ['cancel', colors.error];
  return <Icon name={icon} size={22} color={color} fill />;
}

function CheckoutSheet({ plan, onClose, onStarted }: { plan: SubscriptionPlan; onClose: () => void; onStarted: (p: PaymentSummary) => void }) {
  const qc = useQueryClient();
  const me = useMyProvider();
  const [months, setMonths] = useState<number>(1);
  const [phone, setPhone] = useState('');
  useEffect(() => {
    if (!phone && me.data?.phone) setPhone(me.data.phone.replace(/^\+260/, '0'));
  }, [me.data?.phone, phone]);
  const total = useMemo(() => Math.round(plan.priceMonthly * months * 100) / 100, [plan.priceMonthly, months]);
  const normalized = phone ? normalizePhone(phone) : '';
  const phoneOk = !!phone && isValidPhone(phone) && MOBILE_MONEY_PHONE.test(normalized);

  const start = useMutation({
    mutationFn: () => api.post<PaymentSummary>('/payments/subscriptions', { planCode: plan.code, months, phone }),
    onSuccess: (p) => {
      void qc.invalidateQueries({ queryKey: ['subscription'] });
      void qc.invalidateQueries({ queryKey: ['payments'] });
      onStarted(p);
    },
  });

  return (
    <Sheet
      visible
      onClose={onClose}
      title={`${plan.name} plan`}
      footer={<Button title={`Pay ${zmw(total)} with mobile money`} icon="phone_iphone" disabled={!phoneOk} loading={start.isPending} onPress={() => start.mutate()} />}
    >
      <View className="gap-2">
        <Txt variant="label-md" className="text-on-surface-variant">How long?</Txt>
        <View className="flex-row gap-2">
          {PLAN_TERMS_MONTHS.map((m) => (
            <Pressable key={m} onPress={() => setMonths(m)} className={`flex-1 items-center rounded-2xl py-3 ${m === months ? 'border-2 border-primary-dark bg-tertiary-fixed/40' : 'bg-surface-container-low'}`}>
              <Txt variant="headline-sm">{m}</Txt>
              <Txt variant="label-sm" className="text-on-surface-variant">month{m > 1 ? 's' : ''}</Txt>
            </Pressable>
          ))}
        </View>
      </View>
      <TextField
        label="Mobile money number"
        icon="phone_iphone"
        keyboardType="phone-pad"
        placeholder="096 123 4567"
        value={phone}
        onChangeText={setPhone}
        error={phone && !phoneOk ? 'Enter an MTN, Airtel or Zamtel number' : undefined}
        hint="MTN, Airtel or Zamtel. You will get a prompt on this phone to approve with your PIN."
      />
      <View className="gap-1 rounded-2xl bg-surface-container-low p-4">
        <Row label={`${plan.name} × ${months} month${months > 1 ? 's' : ''}`} value={zmw(total)} />
        <Row label="Total" value={zmw(total)} bold />
      </View>
      <InlineError message={start.error ? toApiError(start.error).message : null} />
    </Sheet>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View className="flex-row justify-between">
      <Txt variant={bold ? 'label-lg' : 'body-md'} className={bold ? '' : 'text-on-surface-variant'}>{label}</Txt>
      <Txt variant={bold ? 'headline-sm' : 'body-md'}>{value}</Txt>
    </View>
  );
}

function PaymentStatusSheet({ id, onClose, onRetry }: { id: string; onClose: () => void; onRetry: (planCode: string) => void }) {
  const qc = useQueryClient();
  const q = usePayment(id);
  const p = q.data;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (p && p.status !== 'PENDING') {
      void qc.invalidateQueries({ queryKey: ['subscription'] });
      void qc.invalidateQueries({ queryKey: ['payments'] });
    }
  }, [p?.status, qc, p]);

  const act = useMutation({
    mutationFn: (path: 'cancel') => api.post<PaymentSummary>(`/payments/${id}/${path}`),
    onSuccess: (r) => qc.setQueryData(['payment', id], r),
  });
  const simulate = useMutation({
    mutationFn: (outcome: 'SUCCEEDED' | 'FAILED') => api.post<PaymentSummary>(`/payments/${id}/simulate`, { outcome, reason: outcome === 'FAILED' ? 'Declined in the simulator' : undefined }),
    onSuccess: (r) => qc.setQueryData(['payment', id], r),
  });

  const left = p?.expiresAt ? Math.max(0, Math.round((new Date(p.expiresAt).getTime() - now) / 1000)) : null;

  return (
    <Sheet visible onClose={onClose} title="Payment">
      {!p ? (
        <ActivityIndicator color={colors.primary} />
      ) : p.status === 'PENDING' ? (
        <View className="items-center gap-3 py-2">
          <View className="h-20 w-20 items-center justify-center rounded-full bg-secondary-fixed/60">
            <Icon name="phone_iphone" size={38} color={colors.primaryDark} />
          </View>
          <Txt variant="headline-md" className="text-center">Check your phone</Txt>
          <Txt variant="body-md" className="text-center text-on-surface-variant">
            Approve the {zmw(p.amount)} prompt sent to {p.payerPhone} with your mobile money PIN. This page updates by itself.
          </Txt>
          <View className="flex-row items-center gap-2">
            <ActivityIndicator color={colors.primary} />
            <Txt variant="label-md" className="text-on-surface-variant">
              Waiting for approval{left !== null ? ` · ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} left` : ''}
            </Txt>
          </View>
          <Txt variant="body-sm" className="text-center text-on-surface-variant">No prompt after a minute? Check the number and your network signal, then cancel and try again.</Txt>
          {p.simulated ? (
            <View className="w-full gap-2 rounded-2xl bg-amber-soft p-3">
              <Txt variant="label-md">Test mode: no real money moves</Txt>
              <View className="flex-row gap-2">
                <Button title="Approve" size="sm" className="flex-1" loading={simulate.isPending && simulate.variables === 'SUCCEEDED'} onPress={() => simulate.mutate('SUCCEEDED')} />
                <Button title="Decline" size="sm" kind="soft" className="flex-1" loading={simulate.isPending && simulate.variables === 'FAILED'} onPress={() => simulate.mutate('FAILED')} />
              </View>
            </View>
          ) : null}
          <Button title="Cancel this payment" kind="ghost" size="sm" loading={act.isPending} onPress={() => act.mutate('cancel')} />
        </View>
      ) : p.status === 'SUCCEEDED' ? (
        <View className="items-center gap-3 py-2">
          <View className="h-20 w-20 items-center justify-center rounded-full bg-tertiary-fixed/50">
            <Icon name="check_circle" size={44} color={colors.primaryDark} fill />
          </View>
          <Txt variant="headline-md" className="text-center">Payment received</Txt>
          <Txt variant="body-md" className="text-center text-on-surface-variant">
            {p.failureReason ? 'We received your payment and are checking it. Our team will confirm your plan shortly.' : `${zmw(p.amount)} paid. Your ${p.plan?.name ?? ''} plan is active.`}
          </Txt>
          <Button title="Done" className="w-full" onPress={onClose} />
        </View>
      ) : (
        <View className="items-center gap-3 py-2">
          <View className="h-20 w-20 items-center justify-center rounded-full bg-error-container">
            <Icon name="error" size={40} color={colors.error} />
          </View>
          <Txt variant="headline-md" className="text-center">{STATUS_LABEL[p.status]}</Txt>
          <Txt variant="body-md" className="text-center text-on-surface-variant">{p.status === 'REFUNDED' ? 'This payment was refunded to your mobile money account.' : `${p.failureReason ?? 'The payment did not go through.'} You have not been charged.`}</Txt>
          {p.plan ? <Button title="Try again" className="w-full" onPress={() => onRetry(p.plan!.code)} /> : null}
          <Button title="Close" kind="ghost" className="w-full" onPress={onClose} />
        </View>
      )}
      <InlineError message={act.error ? toApiError(act.error).message : simulate.error ? toApiError(simulate.error).message : null} />
    </Sheet>
  );
}
