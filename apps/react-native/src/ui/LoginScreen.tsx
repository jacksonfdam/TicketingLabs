// Sign-in screen, shown only when the app runs against the real backend and has no token.

import React, { useState } from 'react';
import { ScrollView, Text, TextInput } from 'react-native';

import { UiState } from '../core/core';
import { tokens } from './theme';
import { ErrorBanner, MutedText, PrimaryButton } from './widgets';

const inputStyle = {
  backgroundColor: tokens.surface,
  color: tokens.text,
  borderColor: tokens.line,
  borderWidth: 1,
  borderRadius: tokens.radiusSm,
  padding: tokens.spaceMd,
  marginVertical: tokens.spaceSm,
} as const;

export function LoginScreen({ state, onSubmit }: { state: UiState<void>; onSubmit: (email: string, password: string) => void }) {
  const [email, setEmail] = useState('buyer@ticketing.local');
  const [password, setPassword] = useState('password123');
  const loading = state.kind === 'loading';
  return (
    <ScrollView style={{ flex: 1, backgroundColor: tokens.bg }} contentContainerStyle={{ padding: tokens.spaceXl }}>
      <Text style={{ color: tokens.text, fontSize: 22, fontWeight: '700', marginBottom: tokens.spaceLg }}>Sign in</Text>
      <MutedText>Use the seeded demo credentials, or your own.</MutedText>
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        placeholderTextColor={tokens.muted}
        style={inputStyle}
      />
      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        secureTextEntry
        placeholderTextColor={tokens.muted}
        style={inputStyle}
      />
      {(state.kind === 'error' || state.kind === 'timedOut') && <ErrorBanner error={state.error} />}
      <PrimaryButton
        label={loading ? 'Signing in…' : 'Sign in'}
        onPress={loading ? undefined : () => onSubmit(email.trim(), password)}
        disabled={loading}
      />
    </ScrollView>
  );
}
