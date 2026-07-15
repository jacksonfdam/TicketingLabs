package usecase_test

import (
	"context"
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/ticketing-labs/backend-go/internal/adapter/memory"
	"github.com/ticketing-labs/backend-go/internal/domain"
	"github.com/ticketing-labs/backend-go/internal/usecase"
)

// --- test doubles ---

type testClock struct{ t time.Time }

func (c *testClock) Now() time.Time { return c.t }

type seqIDs struct{ n int64 }

func (g *seqIDs) NewID() string { return fmt.Sprintf("id-%d", atomic.AddInt64(&g.n, 1)) }

type alwaysAdmit struct{}

func (alwaysAdmit) IsAdmitted(context.Context, string, string) bool { return true }

type neverAdmit struct{}

func (neverAdmit) IsAdmitted(context.Context, string, string) bool { return false }

func newFixture(available int) (*memory.Store, *usecase.ReservationService) {
	store := memory.NewStore()
	store.PutEvent(&domain.Event{ID: "evt", Status: domain.EventOnSale})
	store.PutSector(&domain.Sector{
		ID: "sec", EventID: "evt", Name: "Pista", PriceCents: 100, Currency: "BRL",
		TotalInventory: available, AvailableInventory: available,
	})
	svc := usecase.NewReservationService(
		memory.Reservations{S: store}, memory.Sectors{S: store},
		memory.NewLocker(), alwaysAdmit{},
		&testClock{t: time.Unix(1_700_000_000, 0)}, &seqIDs{}, time.Minute,
	)
	return store, svc
}

// The headline invariant: under a stampede, stock never goes negative and never
// oversells. We fire far more concurrent buyers than there is inventory and assert
// exactly `available` succeed.
func TestNoOversellingUnderConcurrency(t *testing.T) {
	const available = 100
	const buyers = 500
	store, svc := newFixture(available)

	var success, exhausted int64
	var wg sync.WaitGroup
	start := make(chan struct{})
	for i := 0; i < buyers; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-start // release everyone at once, maximise contention
			user := fmt.Sprintf("user-%d", i)
			key := fmt.Sprintf("key-%d", i)
			_, err := svc.Create(context.Background(), user, "sec", 1, key)
			switch err {
			case nil:
				atomic.AddInt64(&success, 1)
			case domain.ErrInventoryExhausted:
				atomic.AddInt64(&exhausted, 1)
			default:
				t.Errorf("unexpected error: %v", err)
			}
		}(i)
	}
	close(start)
	wg.Wait()

	if success != available {
		t.Fatalf("expected exactly %d successful reservations, got %d", available, success)
	}
	if exhausted != buyers-available {
		t.Fatalf("expected %d exhausted, got %d", buyers-available, exhausted)
	}
	sec, _ := memory.Sectors{S: store}.FindByID(context.Background(), "sec")
	if sec.AvailableInventory != 0 {
		t.Fatalf("expected 0 inventory left, got %d (overselling or leak)", sec.AvailableInventory)
	}
}

// Same idempotency key, hammered concurrently, must create exactly one hold.
func TestIdempotentReservationReplay(t *testing.T) {
	store, svc := newFixture(50)

	const attempts = 40
	ids := make([]string, attempts)
	var wg sync.WaitGroup
	start := make(chan struct{})
	for i := 0; i < attempts; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-start
			res, err := svc.Create(context.Background(), "same-user", "sec", 2, "same-key")
			if err != nil {
				t.Errorf("attempt %d errored: %v", i, err)
				return
			}
			ids[i] = res.Reservation.ID
		}(i)
	}
	close(start)
	wg.Wait()

	for i, id := range ids {
		if id != ids[0] {
			t.Fatalf("attempt %d got reservation %q, expected %q; idempotency broke", i, id, ids[0])
		}
	}
	sec, _ := memory.Sectors{S: store}.FindByID(context.Background(), "sec")
	if sec.AvailableInventory != 48 {
		t.Fatalf("expected inventory decremented exactly once (48 left), got %d", sec.AvailableInventory)
	}
}

func TestReservationRequiresAdmission(t *testing.T) {
	store := memory.NewStore()
	store.PutSector(&domain.Sector{ID: "sec", EventID: "evt", TotalInventory: 10, AvailableInventory: 10})
	svc := usecase.NewReservationService(
		memory.Reservations{S: store}, memory.Sectors{S: store},
		memory.NewLocker(), neverAdmit{},
		&testClock{t: time.Now()}, &seqIDs{}, time.Minute,
	)
	_, err := svc.Create(context.Background(), "user", "sec", 1, "k")
	if err != domain.ErrNotAdmitted {
		t.Fatalf("expected ErrNotAdmitted without an admitted queue token, got %v", err)
	}
}

func TestReleaseReturnsStockAndIsIdempotent(t *testing.T) {
	store, svc := newFixture(10)
	res, err := svc.Create(context.Background(), "user", "sec", 3, "k")
	if err != nil {
		t.Fatal(err)
	}
	if err := svc.Release(context.Background(), "user", res.Reservation.ID); err != nil {
		t.Fatal(err)
	}
	// Releasing again must still succeed (idempotent) and must not double-refund.
	if err := svc.Release(context.Background(), "user", res.Reservation.ID); err != nil {
		t.Fatal(err)
	}
	sec, _ := memory.Sectors{S: store}.FindByID(context.Background(), "sec")
	if sec.AvailableInventory != 10 {
		t.Fatalf("expected stock fully returned (10), got %d", sec.AvailableInventory)
	}
}

func TestSweeperExpiresHeldReservations(t *testing.T) {
	clock := &testClock{t: time.Unix(1_700_000_000, 0)}
	store := memory.NewStore()
	store.PutSector(&domain.Sector{ID: "sec", EventID: "evt", TotalInventory: 10, AvailableInventory: 10})
	svc := usecase.NewReservationService(
		memory.Reservations{S: store}, memory.Sectors{S: store},
		memory.NewLocker(), alwaysAdmit{}, clock, &seqIDs{}, time.Minute,
	)
	if _, err := svc.Create(context.Background(), "user", "sec", 4, "k"); err != nil {
		t.Fatal(err)
	}
	// Jump past the TTL, then sweep.
	clock.t = clock.t.Add(2 * time.Minute)
	n, err := svc.SweepExpired(context.Background(), 100)
	if err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatalf("expected 1 reservation swept, got %d", n)
	}
	sec, _ := memory.Sectors{S: store}.FindByID(context.Background(), "sec")
	if sec.AvailableInventory != 10 {
		t.Fatalf("expected stock returned by sweeper (10), got %d", sec.AvailableInventory)
	}
}
