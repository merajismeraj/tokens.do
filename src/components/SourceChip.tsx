import type { Provider } from "@prisma/client";
import { METHOD_BADGE, SOURCES, type SourceMethod } from "@/lib/sources";

export function MethodBadge({ method }: { method: SourceMethod }) {
  const b = METHOD_BADGE[method];
  return (
    <span className={`badge ${method}`} title={b.title}>
      {b.label}
    </span>
  );
}

/** Provider name plus the badge for how its usage was collected. */
export function SourceChip({ provider }: { provider: Provider }) {
  const s = SOURCES[provider];
  return (
    <span className={`chip ${provider}`} title={METHOD_BADGE[s.method].title}>
      {s.name}
      <MethodBadge method={s.method} />
    </span>
  );
}

export function BadgeLegend() {
  return (
    <p className="legend">
      <span>
        <MethodBadge method="key" /> verified admin key
      </span>
      <span>
        <MethodBadge method="openrouter" /> verified OpenRouter
      </span>
      <span>
        <MethodBadge method="cli" /> self-reported local logs
      </span>
    </p>
  );
}
