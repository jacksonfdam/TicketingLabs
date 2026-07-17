// Root component. Hosts the seven-screen flow (against the in-memory demo backend) and the
// component gallery behind a bottom tab bar. Reads go through TanStack Query; the stateful
// flows go through the zustand stores.

import { QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, Text, View } from 'react-native';
import { useStore } from 'zustand';

import { createOrderUseCase, createReservationUseCase } from './src/domain/usecases';
import {
  DemoEventRepository,
  DemoIdempotencyKeyFactory,
  DemoOrderRepository,
  DemoQueueRepository,
  DemoReservationRepository,
} from './src/demo/demo';
import { queryClient, useEventDetailUiState, useEventsUiState } from './src/presentation/queries';
import { createOrderStore, createReservationStore, createWaitingRoomStore } from './src/presentation/stores';
import { GalleryScreen } from './src/ui/gallery';
import {
  EventDetailScreen,
  EventsScreen,
  OrderStatusScreen,
  ReservationScreen,
  SectorSelectionScreen,
  WaitingRoomScreen,
} from './src/ui/screens';
import { tokens } from './src/ui/theme';
import { AppConfig } from './src/config/appConfig';
import { KyReachabilityChecker } from './src/data/reachability';
import { createConnectivityStore } from './src/presentation/connectivityStore';
import { ConnectivityBanner } from './src/ui/ConnectivityBanner';

type FlowScreen = 'events' | 'detail' | 'waiting' | 'sectors' | 'reservation' | 'order';

function Flow() {
  const deps = useMemo(() => {
    const eventRepo = new DemoEventRepository();
    const queueRepo = new DemoQueueRepository();
    const reservationRepo = new DemoReservationRepository();
    const orderRepo = new DemoOrderRepository();
    const keys = new DemoIdempotencyKeyFactory();
    return {
      eventRepo,
      waiting: createWaitingRoomStore(queueRepo, 800),
      reservation: createReservationStore(createReservationUseCase(reservationRepo), keys),
      order: createOrderStore(createOrderUseCase(orderRepo), orderRepo, keys, 600),
    };
  }, []);

  const [screen, setScreen] = useState<FlowScreen>('events');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [remainingMs, setRemainingMs] = useState(120000);

  const events = useEventsUiState(deps.eventRepo);
  const detail = useEventDetailUiState(deps.eventRepo, selectedId);
  const waitingState = useStore(deps.waiting, (s) => s.state);
  const reservationState = useStore(deps.reservation, (s) => s.state);
  const orderState = useStore(deps.order, (s) => s.state);

  const reservationHeld = reservationState.kind === 'success';
  useEffect(() => {
    if (!reservationHeld) return;
    setRemainingMs(120000);
    const timer = setInterval(() => {
      setRemainingMs((ms) => {
        const next = ms - 1000;
        if (next <= 0) clearInterval(timer);
        return next;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [reservationHeld]);

  switch (screen) {
    case 'events':
      return (
        <EventsScreen
          state={events.state}
          onOpen={(e) => {
            setSelectedId(e.id);
            setScreen('detail');
          }}
          onRetry={events.refetch}
        />
      );
    case 'detail':
      return (
        <EventDetailScreen
          state={detail.state}
          onJoinQueue={() => {
            if (selectedId) void deps.waiting.getState().start(selectedId);
            setScreen('waiting');
          }}
          onRetry={detail.refetch}
        />
      );
    case 'waiting':
      return (
        <WaitingRoomScreen
          state={waitingState}
          onContinue={() => setScreen('sectors')}
          onRetry={() => selectedId && void deps.waiting.getState().start(selectedId)}
        />
      );
    case 'sectors': {
      const data = detail.state.kind === 'success' ? detail.state.data : null;
      return data ? (
        <SectorSelectionScreen
          detail={data}
          onReserve={(sector, quantity) => {
            void deps.reservation.getState().reserve(sector.id, quantity);
            // The hold changed availability; drop cached events/detail so they refetch.
            void queryClient.invalidateQueries({ queryKey: ['events'] });
            void queryClient.invalidateQueries({ queryKey: ['event'] });
            setScreen('reservation');
          }}
        />
      ) : (
        <ActivityIndicator color={tokens.accent} />
      );
    }
    case 'reservation':
      return (
        <ReservationScreen
          state={reservationState}
          remainingMs={remainingMs}
          onCheckout={() => {
            if (reservationState.kind === 'success') {
              void deps.order.getState().checkout(reservationState.data.id);
              setScreen('order');
            }
          }}
          onRetry={() => {
            const data = detail.state.kind === 'success' ? detail.state.data : null;
            if (data && data.sectors.length > 0) void deps.reservation.getState().reserve(data.sectors[0].id, 1);
          }}
        />
      );
    case 'order':
      return (
        <OrderStatusScreen
          state={orderState}
          onDone={() => setScreen('events')}
          onRetry={() => {
            if (reservationState.kind === 'success') void deps.order.getState().checkout(reservationState.data.id);
          }}
        />
      );
  }
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ flex: 1, alignItems: 'center', paddingVertical: tokens.spaceMd }}>
      <Text style={{ color: active ? tokens.accent : tokens.muted, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

export default function App() {
  const [tab, setTab] = useState(0);
  const connectivity = useMemo(
    () => createConnectivityStore(new KyReachabilityChecker(AppConfig.baseUrl, AppConfig.reachabilityTimeoutMs)),
    [],
  );
  useEffect(() => {
    void connectivity.getState().check();
  }, [connectivity]);
  const connState = useStore(connectivity, (s) => s.state);
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaView style={{ flex: 1, backgroundColor: tokens.bg }}>
        <StatusBar style="light" />
        <ConnectivityBanner state={connState} onRetry={() => void connectivity.getState().check()} />
        <View style={{ flex: 1 }}>{tab === 0 ? <Flow /> : <GalleryScreen />}</View>
        <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: tokens.line }}>
          <TabButton label="Flow" active={tab === 0} onPress={() => setTab(0)} />
          <TabButton label="Gallery" active={tab === 1} onPress={() => setTab(1)} />
        </View>
      </SafeAreaView>
    </QueryClientProvider>
  );
}
