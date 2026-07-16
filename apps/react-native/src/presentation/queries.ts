// TanStack Query hooks for server-state reads (events list, event detail). Reads use the
// query cache; the stateful flows (waiting room, reservation, order) use the zustand stores.
// This mirrors the reference web frontend, which drives reads and polling through TanStack
// Query.

import { QueryClient, useQuery } from '@tanstack/react-query';

import { AppError, errorToUiState, UiState } from '../core/core';
import { Event, EventDetail } from '../domain/models';
import { EventRepository } from '../domain/repositories';

export const queryClient = new QueryClient();

/** Fetches and caches the events list, exposing the result as a [UiState]. */
export function useEventsUiState(repo: EventRepository): { state: UiState<Event[]>; refetch: () => void } {
  const query = useQuery({
    queryKey: ['events'],
    queryFn: async () => {
      const result = await repo.listEvents();
      if (!result.ok) throw result.error;
      return [...result.value.events];
    },
    staleTime: 30000, // matches the events Cache-Control: max-age=30
    retry: false,
  });
  const state: UiState<Event[]> = query.isPending
    ? { kind: 'loading' }
    : query.isError
      ? errorToUiState(query.error as unknown as AppError)
      : query.data.length > 0
        ? { kind: 'success', data: query.data }
        : { kind: 'empty' };
  return { state, refetch: () => void query.refetch() };
}

/** Fetches and caches one event's detail. */
export function useEventDetailUiState(repo: EventRepository, id: string | null): { state: UiState<EventDetail>; refetch: () => void } {
  const query = useQuery({
    queryKey: ['event', id],
    enabled: id !== null,
    queryFn: async () => {
      const result = await repo.getEvent(id as string);
      if (!result.ok) throw result.error;
      return result.value;
    },
    retry: false,
  });
  const state: UiState<EventDetail> = query.isPending
    ? { kind: 'loading' }
    : query.isError
      ? errorToUiState(query.error as unknown as AppError)
      : { kind: 'success', data: query.data };
  return { state, refetch: () => void query.refetch() };
}
