# 1. Record architecture decisions

Date: 2026-07-15

## Status

Accepted

## Context

Decisions on a polyglot project get made once and questioned forever. Six months
from now, someone will ask why the contract is a single YAML file and not one per
backend, and "it felt right at the time" is not an answer that survives a code review.

## Decision

We record architecturally significant decisions as ADRs, in the style described by
Michael Nygard. Each ADR is a short markdown file, numbered sequentially, immutable
once accepted. A decision that changes gets a new ADR that supersedes the old one;
we do not edit history to make ourselves look prescient.

## Consequences

- The reasoning behind a decision outlives the person who made it.
- New contributors read `docs/adr/` and understand the shape of the project without
  a meeting.
- There is a small tax on making decisions: you have to write them down. This is a
  feature.
