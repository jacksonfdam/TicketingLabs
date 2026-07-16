import Link from 'next/link';
import type { Metadata } from 'next';
import { Markdown } from '@/components/Markdown';
import { doc } from '@/lib/content';

export const metadata: Metadata = {
  title: 'Clients · Ticketing Labs',
  description:
    'The same ticketing client, built three times — Kotlin Multiplatform, Flutter and React Native — against one contract, blind to the backend.',
};

type App = {
  name: string;
  stack: string;
  verified: string;
  points: string[];
};

const APPS: App[] = [
  {
    name: 'Kotlin Multiplatform',
    stack: 'Compose Multiplatform · Ktor · kotlinx.serialization',
    verified: 'shared core compiles and tests green on JVM, Android and iOS; Compose UI compiles on Desktop',
    points: [
      'core + domain + data live in a UI-free :shared module, unit-tested in milliseconds',
      'ViewModels drive the seven screens; the payment reconcile lives in the tested use cases',
      'Compose UI (design system + gallery + flow) runs on the Desktop target for headless checks',
    ],
  },
  {
    name: 'Flutter',
    stack: 'Bloc/Cubit · dio · Material 3',
    verified: 'flutter analyze clean · 21 tests pass · web bundle builds',
    points: [
      'Cubits hold the state machines; the order cubit owns the reconcile-and-poll loop',
      'defensive dio mappers reject malformed payloads as MalformedResponse',
      'a widget test proves the state-driven UI renders loading, success and error',
    ],
  },
  {
    name: 'React Native (Expo)',
    stack: 'zustand · TanStack Query · ky · New Architecture',
    verified: 'typecheck clean · 17 tests pass · Metro bundles 643 modules',
    points: [
      'reads cached through TanStack Query; stateful flows held in vanilla zustand stores',
      'the ky executor collapses every failure into one typed AppError',
      'the same seven screens and error copy as the other two, expressed in TSX',
    ],
  },
];

export default function ClientsPage() {
  const architecture = doc('docs/client-architecture.md', 'Client architecture');
  const machines = doc('docs/client-state-machines.md', 'Client state machines');

  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-widest text-[var(--accent)]">Clients</p>
      <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">The same app, built three times</h1>
      <p className="mt-4 max-w-2xl text-[var(--muted)]">
        The mobile companion to the seven backends: one ticketing flash-sale client implemented in Kotlin
        Multiplatform, Flutter and React Native. Same contract, same seven-screen flow, same modelled states.
        Each app receives only a base URL and is blind to which backend answers. Everything client-side lives in{' '}
        <code>/apps</code>; the single-sourced contract, tokens, scenarios and copy live in <code>/shared</code>.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {APPS.map((app) => (
          <div key={app.name} className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5">
            <h2 className="text-lg font-bold">{app.name}</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">{app.stack}</p>
            <p className="mt-3 text-xs font-semibold text-[var(--accent-2)]">{app.verified}</p>
            <ul className="mt-3 list-disc space-y-1 pl-4 text-sm text-[var(--muted)]">
              {app.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="mt-6 text-sm text-[var(--muted)]">
        Why it is shaped this way is recorded in{' '}
        <Link href="/decisions">ADR 0007 and 0008</Link>: three clients one contract, and sharing artefacts not source.
      </p>

      <section id="architecture" className="mt-14 scroll-mt-20 border-t border-[var(--line)] pt-8">
        <Markdown>{architecture.body}</Markdown>
      </section>

      <section id="state-machines" className="mt-14 scroll-mt-20 border-t border-[var(--line)] pt-8">
        <Markdown>{machines.body}</Markdown>
      </section>
    </div>
  );
}
