'use client';

import { useEffect, useRef, useState } from 'react';

let loader: Promise<typeof import('mermaid')> | null = null;
let counter = 0;

// Renders a Mermaid diagram on the client. mermaid is heavy, so it is lazy-imported the
// first time a diagram appears. The architecture and domain-model docs use these for the
// state machines and the system diagram.
export function Mermaid({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await (loader ??= import('mermaid'))).default;
        mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'strict' });
        const { svg } = await mermaid.render(`mmd-${counter++}`, chart);
        if (!cancelled && ref.current) ref.current.innerHTML = svg;
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chart]);

  if (error) {
    return <pre className="code-block">{chart}</pre>;
  }
  return <div ref={ref} className="my-6 flex justify-center overflow-x-auto" />;
}
