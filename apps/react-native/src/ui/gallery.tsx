// The preview catalog: every atom, molecule and organism across its states on one screen.
// The deliverable preview surface — it runs wherever the app runs.

import React, { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { appError } from '../core/core';
import { money } from '../domain/models';
import { tokens } from './theme';
import { CountdownText, ErrorBanner, PrimaryButton, SectorRow, StatusBadge } from './widgets';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ marginBottom: tokens.spaceXl }}>
      <Text style={{ color: tokens.muted, fontWeight: '700', marginBottom: tokens.spaceSm }}>{title}</Text>
      {children}
      <View style={{ height: 1, backgroundColor: tokens.line, marginTop: tokens.spaceSm }} />
    </View>
  );
}

export function GalleryScreen() {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: tokens.bg }} contentContainerStyle={{ padding: tokens.spaceXl }}>
      <Text style={{ color: tokens.text, fontSize: 22, fontWeight: '700', marginBottom: tokens.spaceLg }}>Gallery</Text>

      <Section title="Buttons">
        <PrimaryButton label="Enabled" onPress={() => {}} />
        <View style={{ height: tokens.spaceSm }} />
        <PrimaryButton label="Disabled" disabled />
      </Section>

      <Section title="Badges">
        <StatusBadge label="On sale" color={tokens.ok} />
        <View style={{ height: tokens.spaceSm }} />
        <StatusBadge label="Sold out" color={tokens.err} />
        <View style={{ height: tokens.spaceSm }} />
        <StatusBadge label="You're in" color={tokens.accent} />
      </Section>

      <Section title="Countdown">
        <CountdownText remainingMs={90000} />
        <CountdownText remainingMs={15000} />
        <CountdownText remainingMs={0} />
      </Section>

      <Section title="SectorRow">
        <SectorRow sector={{ id: 's1', eventId: 'e1', name: 'Front stage', price: money(9500, 'GBP'), totalInventory: 100, availableInventory: 12 }} onSelect={() => {}} />
        <SectorRow sector={{ id: 's2', eventId: 'e1', name: 'Restricted', price: money(2500, 'GBP'), totalInventory: 50, availableInventory: 0 }} onSelect={() => {}} />
      </Section>

      <Section title="Error states (taxonomy)">
        <ErrorBanner error={appError('NetworkUnavailable', { requestId: 'req-1' })} onAction={() => {}} />
        <View style={{ height: tokens.spaceSm }} />
        <ErrorBanner error={appError('Conflict', { backendCode: 'inventory_exhausted', requestId: 'req-2' })} onAction={() => {}} />
        <View style={{ height: tokens.spaceSm }} />
        <ErrorBanner error={appError('PaymentUnknown', { requestId: 'req-3' })} onAction={() => {}} />
      </Section>
    </ScrollView>
  );
}
