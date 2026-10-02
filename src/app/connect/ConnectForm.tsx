"use client";

import { useActionState, useState } from "react";
import { addConnection, type ConnectState } from "./actions";

interface ProviderOption {
  id: string;
  name: string;
  keyPrefix: string;
  keyHelp: string;
  keyHelpUrl: string;
}

export function ConnectForm({ options }: { options: ProviderOption[] }) {
  const [state, action, pending] = useActionState<ConnectState, FormData>(addConnection, {});
  const [providerId, setProviderId] = useState(options[0].id);
  const provider = options.find((o) => o.id === providerId)!;

  return (
    <form action={action} className="card connect-form" key={state.ok ? "reset" : "form"}>
      <div className="seg">
        {options.map((o) => (
          <label key={o.id} className={o.id === providerId ? "active" : undefined}>
            <input
              type="radio"
              name="provider"
              value={o.id}
              checked={o.id === providerId}
              onChange={() => setProviderId(o.id)}
            />
            {o.name}
          </label>
        ))}
      </div>
      <input
        name="apiKey"
        type="password"
        autoComplete="off"
        spellCheck={false}
        required
        placeholder={`${provider.keyPrefix}…`}
        className="input"
      />
      <p className="muted small">
        {provider.keyHelp}{" "}
        <a href={provider.keyHelpUrl} target="_blank" rel="noreferrer">
          Get key ↗
        </a>
      </p>
      <button className="btn primary" disabled={pending}>
        {pending ? "Verifying…" : `Connect ${provider.name}`}
      </button>
      {state.error && <p className="error">{state.error}</p>}
      {state.ok && <p className="success">Connected. Check your projected rank on the board.</p>}
    </form>
  );
}
