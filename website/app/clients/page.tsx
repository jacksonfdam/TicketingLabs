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
    stack: 'Compose Multiplatform · Ktor · multiplatform ViewModel',
    verified: 'iOS (arm64 + simulator) and Android compile · 35 tests pass on the Android host · Android APK builds',
    points: [
      'laid out to the official CMP template: a shared :sharedUI module, a :androidApp app, an iosApp Xcode project',
      'multiplatform ViewModels drive the seven screens; the payment reconcile lives in the tested use cases',
      'the whole UI, state and previews live in commonMain and are shared verbatim across Android and iOS',
    ],
  },
  {
    name: 'Flutter',
    stack: 'Bloc/Cubit · dio · Material 3',
    verified: 'flutter analyze clean · 23 tests pass · web bundle builds',
    points: [
      'Cubits hold the state machines; the order cubit owns the reconcile-and-poll loop',
      'defensive dio mappers reject malformed payloads as MalformedResponse',
      'a widget test proves the state-driven UI renders loading, success and error',
    ],
  },
  {
    name: 'React Native (Expo)',
    stack: 'zustand · TanStack Query · ky · New Architecture',
    verified: 'typecheck clean · 19 tests pass',
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

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5">
          <h3 className="text-base font-bold">Offline-first, no infinite loading</h3>
          <p className="mt-2 text-sm text-[var(--muted)]">
            All three behave the same way. On start (and on Retry) a bounded reachability probe hits{' '}
            <code>{'{baseUrl}/health'}</code> with a short timeout and resolves to online or offline — it never
            hangs. A banner surfaces server status; the flow renders from local state and stays usable offline.
            Every network call carries a timeout, so each async state resolves into a modelled state — never an
            endless spinner.
          </p>
        </div>
        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5">
          <h3 className="text-base font-bold">One place to set the endpoint</h3>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Each app reads only a base URL (the gateway; <code>https://localhost/api</code>, or{' '}
            <code>https://10.0.2.2/api</code> on an Android emulator):
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-[var(--muted)]">
            <li>KMP — <code>config/AppConfig.kt</code></li>
            <li>Flutter — <code>lib/config/app_config.dart</code> (or <code>--dart-define=BASE_URL</code>)</li>
            <li>React Native — <code>src/config/appConfig.ts</code> (or <code>EXPO_PUBLIC_BASE_URL</code>)</li>
          </ul>
        </div>
      </div>

      <section id="architecture" className="mt-14 scroll-mt-20 border-t border-[var(--line)] pt-8">
        <Markdown>{architecture.body}</Markdown>
      </section>

      <section id="state-machines" className="mt-14 scroll-mt-20 border-t border-[var(--line)] pt-8">
        <Markdown>{machines.body}</Markdown>
      </section>
    </div>
  );
}
