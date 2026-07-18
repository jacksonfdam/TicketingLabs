// The design system: atoms, molecules, organisms and the generic UI-state renderer. State
// flows in via props, events out via callbacks. Every piece appears in the Gallery.

import React, { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppError, UiState } from '../core/core';
import { Event, isSoldOut, Order, QueueToken, Sector } from '../domain/models';
import { copyFor } from './copy';
import { tokens } from './theme';

export function formatMoney(amountCents: number, currency: string): string {
  const major = Math.floor(amountCents / 100);
  const minor = String(amountCents % 100).padStart(2, '0');
  return `${major}.${minor} ${currency}`;
}

// --- Atoms ---

export function PrimaryButton({ label, onPress, disabled }: { label: string; onPress?: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.btn, { backgroundColor: tokens.accent, opacity: disabled ? 0.5 : 1 }]}
    >
      <Text style={{ color: tokens.onAccent, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

export function SecondaryButton({ label, onPress, disabled }: { label: string; onPress?: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.btn, { borderColor: tokens.line, borderWidth: 1, opacity: disabled ? 0.5 : 1 }]}
    >
      <Text style={{ color: tokens.text }}>{label}</Text>
    </Pressable>
  );
}

export function StatusBadge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: `${color}26` }]}>
      <Text style={{ color, fontSize: 12, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

export function MutedText({ children }: { children: ReactNode }) {
  return <Text style={{ color: tokens.muted }}>{children}</Text>;
}

/** mm:ss countdown that turns warn-coloured under 30s. Stateless. */
export function CountdownText({ remainingMs }: { remainingMs: number }) {
  const clamped = Math.max(0, remainingMs);
  const totalSeconds = Math.floor(clamped / 1000);
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const ss = String(totalSeconds % 60).padStart(2, '0');
  const urgent = clamped <= 30000;
  return <Text style={{ color: urgent ? tokens.warn : tokens.text, fontSize: 28, fontWeight: '700' }}>{`${mm}:${ss}`}</Text>;
}

// --- Molecules / organisms ---

export function ErrorBanner({ error, onAction }: { error: AppError; onAction?: () => void }) {
  const copy = copyFor(error);
  return (
    <View style={[styles.card, { backgroundColor: tokens.surfaceAlt }]}>
      <Text style={{ color: tokens.err, fontWeight: '700' }}>{copy.title}</Text>
      <View style={{ height: tokens.spaceSm }} />
      <MutedText>{copy.message}</MutedText>
      {error.requestId ? <MutedText>{`Ref: ${error.requestId}`}</MutedText> : null}
      {copy.actionLabel && onAction ? (
        <View style={{ marginTop: tokens.spaceMd }}>
          <PrimaryButton label={copy.actionLabel} onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}

export function PriceTag({ amountCents, currency }: { amountCents: number; currency: string }) {
  return <Text style={{ fontWeight: '700', color: tokens.text }}>{formatMoney(amountCents, currency)}</Text>;
}

export function SectorRow({ sector, onSelect }: { sector: Sector; onSelect: () => void }) {
  const soldOut = isSoldOut(sector);
  return (
    <View style={[styles.card, styles.row]}>
      <View>
        <Text style={{ color: tokens.text, fontWeight: '700' }}>{sector.name}</Text>
        <View style={{ height: tokens.spaceXs }} />
        {soldOut ? <StatusBadge label="Sold out" color={tokens.err} /> : <MutedText>{`${sector.availableInventory} left`}</MutedText>}
      </View>
      <View style={styles.row}>
        <PriceTag amountCents={sector.price.amountCents} currency={sector.price.currency} />
        <View style={{ width: tokens.spaceLg }} />
        <PrimaryButton label="Select" onPress={onSelect} disabled={soldOut} />
      </View>
    </View>
  );
}

export function QueuePositionCard({ token }: { token: QueueToken }) {
  const admitted = token.status === 'admitted';
  return (
    <View style={styles.card}>
      {admitted ? (
        <>
          <StatusBadge label="You're in" color={tokens.ok} />
          <View style={{ height: tokens.spaceSm }} />
          <MutedText>You have been admitted. Pick your seats.</MutedText>
        </>
      ) : (
        <>
          <Text style={{ color: tokens.text, fontSize: 28, fontWeight: '700' }}>{`Position ${token.position}`}</Text>
          <View style={{ height: tokens.spaceSm }} />
          <MutedText>Hold tight. We&apos;ll let you in shortly.</MutedText>
        </>
      )}
    </View>
  );
}

export function EventCard({ event, onOpen }: { event: Event; onOpen: () => void }) {
  const badge =
    event.status === 'onSale'
      ? { label: 'On sale', color: tokens.ok }
      : event.status === 'soldOut'
        ? { label: 'Sold out', color: tokens.err }
        : { label: event.status === 'draft' ? 'Draft' : 'Closed', color: tokens.muted };
  return (
    <View style={styles.card}>
      <Text style={{ color: tokens.text, fontSize: 18, fontWeight: '700' }}>{event.name}</Text>
      <View style={{ height: tokens.spaceXs }} />
      <MutedText>{event.venue}</MutedText>
      <View style={{ height: tokens.spaceSm }} />
      <StatusBadge label={badge.label} color={badge.color} />
      <View style={{ height: tokens.spaceSm }} />
      <SecondaryButton label="View" onPress={onOpen} />
    </View>
  );
}

export function OrderStatusPanel({ order, onDone }: { order: Order; onDone: () => void }) {
  const map = {
    pending: { label: 'Pending', color: tokens.warn, message: 'Payment is processing. This can take a moment.' },
    paid: { label: 'Paid', color: tokens.ok, message: "You're all set. Your tickets are confirmed." },
    failed: { label: 'Failed', color: tokens.err, message: 'Payment failed. You can try ordering again.' },
    refunded: { label: 'Refunded', color: tokens.muted, message: 'This order was refunded.' },
  } as const;
  const info = map[order.status];
  return (
    <View style={styles.card}>
      <StatusBadge label={info.label} color={info.color} />
      <View style={{ height: tokens.spaceMd }} />
      <Text style={{ color: tokens.text, fontSize: 24, fontWeight: '700' }}>{formatMoney(order.amountCents, 'GBP')}</Text>
      <View style={{ height: tokens.spaceSm }} />
      <MutedText>{info.message}</MutedText>
      {order.status !== 'pending' ? (
        <View style={{ marginTop: tokens.spaceMd }}>
          <PrimaryButton label="Done" onPress={onDone} />
        </View>
      ) : null}
    </View>
  );
}

/** Generic renderer for a UiState: loading/empty/error/timeout drawn consistently; the
 * caller supplies only the success renderer. */
export function UiStateView<T>({
  state,
  onRetry,
  emptyText = 'Nothing here yet.',
  children,
}: {
  state: UiState<T>;
  onRetry?: () => void;
  emptyText?: string;
  children: (data: T) => ReactNode;
}) {
  switch (state.kind) {
    case 'idle':
    case 'loading':
    case 'retrying':
      return <ActivityIndicator color={tokens.accent} />;
    case 'empty':
      return <MutedText>{emptyText}</MutedText>;
    case 'error':
    case 'timedOut':
      return <ErrorBanner error={state.error} onAction={onRetry} />;
    case 'success':
      return <>{children(state.data)}</>;
  }
}

const styles = StyleSheet.create({
  btn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: tokens.radiusSm, alignItems: 'center' },
  badge: { alignSelf: 'flex-start', paddingHorizontal: tokens.spaceSm, paddingVertical: tokens.spaceXs, borderRadius: 999 },
  card: { backgroundColor: tokens.surface, borderRadius: tokens.radiusMd, padding: tokens.spaceLg, marginBottom: tokens.spaceMd },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
