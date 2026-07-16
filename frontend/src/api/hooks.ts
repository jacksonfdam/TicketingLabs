// TanStack Query hooks over the typed client. Query keys and staleTime give coherent
// client-side caching; polling drives the two async surfaces (queue admission, order
// settlement). Every hook is fully typed from the generated schema.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from './client';

const newIdemKey = () => crypto.randomUUID();

export function useEvents() {
  return useQuery({
    queryKey: ['events'],
    queryFn: async () => unwrap(await api.GET('/events', { params: { query: {} } })),
    staleTime: 30_000, // matches the events Cache-Control: max-age=30
  });
}

export function useEvent(id: string) {
  return useQuery({
    queryKey: ['event', id],
    queryFn: async () => unwrap(await api.GET('/events/{id}', { params: { path: { id } } })),
    staleTime: 5_000,
  });
}

export function useJoinQueue() {
  return useMutation({
    mutationFn: async (eventId: string) =>
      unwrap(await api.POST('/events/{id}/queue', { params: { path: { id: eventId } } })),
  });
}

// Polls the waiting-room position until the token is admitted, then stops.
export function useQueueStatus(eventId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['queue', eventId],
    queryFn: async () =>
      unwrap(await api.GET('/events/{id}/queue/status', { params: { path: { id: eventId } } })),
    enabled,
    refetchInterval: (q) => (q.state.data?.status === 'admitted' ? false : 1500),
  });
}

export function useCreateReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { sectorId: string; quantity: number }) =>
      unwrap(
        await api.POST('/reservations', {
          params: { header: { 'Idempotency-Key': newIdemKey() } },
          body: { sector_id: vars.sectorId, quantity: vars.quantity },
        }),
      ),
    onSuccess: (r) => {
      // The event's available inventory changed; let it refetch.
      qc.invalidateQueries({ queryKey: ['event'] });
      return r;
    },
  });
}

export function useCreateOrder() {
  return useMutation({
    mutationFn: async (reservationId: string) =>
      unwrap(
        await api.POST('/orders', {
          params: { header: { 'Idempotency-Key': newIdemKey() } },
          body: { reservation_id: reservationId },
        }),
      ),
  });
}

// Polls order status until it leaves the pending state.
export function useOrder(id: string | null) {
  return useQuery({
    queryKey: ['order', id],
    queryFn: async () => unwrap(await api.GET('/orders/{id}', { params: { path: { id: id! } } })),
    enabled: id !== null,
    refetchInterval: (q) => (q.state.data && q.state.data.status !== 'pending' ? false : 1000),
  });
}
