// The seven flow screens. Stateless: each takes a UiState and callbacks and renders via
// UiStateView.

import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { UiState } from '../core/core';
import { Event, EventDetail, isHeld, isSoldOut, Order, QueueToken, Reservation, Sector } from '../domain/models';
import { tokens } from './theme';
import {
  CountdownText,
  EventCard,
  MutedText,
  OrderStatusPanel,
  PriceTag,
  PrimaryButton,
  QueuePositionCard,
  SecondaryButton,
  SectorRow,
  UiStateView,
} from './widgets';

function Screen({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: tokens.bg }} contentContainerStyle={{ padding: tokens.spaceXl }}>
      <Text style={{ color: tokens.text, fontSize: 22, fontWeight: '700', marginBottom: tokens.spaceLg }}>{title}</Text>
      {children}
    </ScrollView>
  );
}

export function EventsScreen({ state, onOpen, onRetry }: { state: UiState<Event[]>; onOpen: (e: Event) => void; onRetry: () => void }) {
  return (
    <Screen title="Events">
      <UiStateView state={state} onRetry={onRetry} emptyText="No events on sale.">
        {(events) => <>{events.map((e) => <EventCard key={e.id} event={e} onOpen={() => onOpen(e)} />)}</>}
      </UiStateView>
    </Screen>
  );
}

export function EventDetailScreen({ state, onJoinQueue, onRetry }: { state: UiState<EventDetail>; onJoinQueue: () => void; onRetry: () => void }) {
  return (
    <Screen title="Event">
      <UiStateView state={state} onRetry={onRetry}>
        {(detail) => (
          <View>
            <Text style={{ color: tokens.text, fontWeight: '700', fontSize: 18 }}>{detail.event.name}</Text>
            <MutedText>{detail.event.venue}</MutedText>
            <View style={{ height: tokens.spaceMd }} />
            {detail.sectors.map((s) => (
              <View key={s.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: tokens.spaceXs }}>
                <Text style={{ color: tokens.text }}>{s.name}</Text>
                <PriceTag amountCents={s.price.amountCents} currency={s.price.currency} />
              </View>
            ))}
            <View style={{ height: tokens.spaceLg }} />
            <PrimaryButton label="Join the queue" onPress={onJoinQueue} />
          </View>
        )}
      </UiStateView>
    </Screen>
  );
}

export function WaitingRoomScreen({ state, onContinue, onRetry }: { state: UiState<QueueToken>; onContinue: () => void; onRetry: () => void }) {
  return (
    <Screen title="Waiting room">
      <UiStateView state={state} onRetry={onRetry}>
        {(token) => (
          <View>
            <QueuePositionCard token={token} />
            {token.status === 'admitted' ? (
              <>
                <View style={{ height: tokens.spaceLg }} />
                <PrimaryButton label="Choose seats" onPress={onContinue} />
              </>
            ) : null}
          </View>
        )}
      </UiStateView>
    </Screen>
  );
}

function SectorPicker({ sector, onReserve }: { sector: Sector; onReserve: (s: Sector, q: number) => void }) {
  const [quantity, setQuantity] = useState(1);
  return (
    <View style={{ marginBottom: tokens.spaceMd }}>
      <SectorRow sector={sector} onSelect={() => onReserve(sector, quantity)} />
      {!isSoldOut(sector) ? (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <SecondaryButton label="-" onPress={() => setQuantity((q) => Math.max(1, q - 1))} />
          <Text style={{ color: tokens.text, marginHorizontal: tokens.spaceMd }}>{quantity}</Text>
          <SecondaryButton label="+" onPress={() => setQuantity((q) => Math.min(8, q + 1))} />
        </View>
      ) : null}
    </View>
  );
}

export function SectorSelectionScreen({ detail, onReserve }: { detail: EventDetail; onReserve: (s: Sector, q: number) => void }) {
  return (
    <Screen title="Choose a sector">
      {detail.sectors.map((s) => <SectorPicker key={s.id} sector={s} onReserve={onReserve} />)}
    </Screen>
  );
}

export function ReservationScreen({
  state,
  remainingMs,
  onCheckout,
  onRetry,
}: {
  state: UiState<Reservation>;
  remainingMs: number;
  onCheckout: () => void;
  onRetry: () => void;
}) {
  return (
    <Screen title="Your hold">
      <UiStateView state={state} onRetry={onRetry}>
        {(reservation) => (
          <View>
            <Text style={{ color: tokens.text }}>{`${reservation.quantity} seat(s) held`}</Text>
            <View style={{ height: tokens.spaceSm }} />
            <MutedText>Complete checkout before the hold expires:</MutedText>
            <View style={{ height: tokens.spaceSm }} />
            <CountdownText remainingMs={remainingMs} />
            <View style={{ height: tokens.spaceLg }} />
            <PrimaryButton label="Checkout" onPress={onCheckout} disabled={!isHeld(reservation) || remainingMs <= 0} />
          </View>
        )}
      </UiStateView>
    </Screen>
  );
}

export function OrderStatusScreen({ state, onDone, onRetry }: { state: UiState<Order>; onDone: () => void; onRetry: () => void }) {
  return (
    <Screen title="Order">
      <UiStateView state={state} onRetry={onRetry}>
        {(order) => <OrderStatusPanel order={order} onDone={onDone} />}
      </UiStateView>
    </Screen>
  );
}
