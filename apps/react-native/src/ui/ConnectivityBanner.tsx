// A slim server-reachability banner. Renders nothing when online, a muted line while
// checking, and an error line with Retry when offline. It informs; it never blocks.

import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { Connectivity } from '../presentation/connectivityStore';
import { tokens } from './theme';

export function ConnectivityBanner({ state, onRetry }: { state: Connectivity; onRetry: () => void }) {
  if (state === 'online') return null;
  const offline = state === 'offline';
  return (
    <View
      style={{
        backgroundColor: offline ? tokens.err : tokens.surfaceAlt,
        paddingHorizontal: tokens.spaceLg,
        paddingVertical: tokens.spaceSm,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <Text style={{ color: offline ? '#FFFFFF' : tokens.muted, flexShrink: 1 }}>
        {offline ? 'Server unreachable — working offline' : 'Checking connection…'}
      </Text>
      {offline && (
        <Pressable onPress={onRetry} accessibilityRole="button">
          <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>Retry</Text>
        </Pressable>
      )}
    </View>
  );
}
