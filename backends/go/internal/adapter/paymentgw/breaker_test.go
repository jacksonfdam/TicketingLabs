package paymentgw

import (
	"testing"
	"time"
)

// Exercises the breaker's three-state machine directly: it opens after the failure
// threshold, fast-fails while open, admits a single trial after the cooldown, and closes
// again on a successful trial (or re-opens on a failed one).
func TestBreakerStateMachine(t *testing.T) {
	b := newBreaker(3, 50*time.Millisecond)

	// Closed: calls allowed; failures below the threshold do not trip it.
	for i := 0; i < 2; i++ {
		if !b.allow() {
			t.Fatalf("expected closed breaker to allow (failure %d)", i)
		}
		b.failure()
	}
	if !b.allow() {
		t.Fatal("still under threshold, should allow")
	}

	// Third failure trips it OPEN.
	b.failure()
	if b.allow() {
		t.Fatal("breaker should be open after reaching the threshold")
	}

	// Still open before the cooldown elapses.
	time.Sleep(20 * time.Millisecond)
	if b.allow() {
		t.Fatal("breaker should stay open during cooldown")
	}

	// After the cooldown: HALF-OPEN admits exactly one trial.
	time.Sleep(40 * time.Millisecond)
	if !b.allow() {
		t.Fatal("breaker should allow one trial after cooldown (half-open)")
	}
	if b.allow() {
		t.Fatal("half-open must not admit a second concurrent trial")
	}

	// A failing trial re-opens it.
	b.failure()
	if b.allow() {
		t.Fatal("failed trial should re-open the breaker")
	}

	// Cooldown again, then a successful trial closes it and resets the count.
	time.Sleep(60 * time.Millisecond)
	if !b.allow() {
		t.Fatal("should allow a trial after the second cooldown")
	}
	b.success()
	if !b.allow() {
		t.Fatal("successful trial should close the breaker")
	}
}
