"use client";

import { useActionState } from "react";
import { approveDevice, type ConnectState } from "../connect/actions";

export function ApproveForm({ userCode, handle }: { userCode: string; handle: string }) {
  const [state, action, pending] = useActionState<ConnectState, FormData>(approveDevice, {});
  if (state.ok) return <p className="success">Approved. Head back to your terminal.</p>;
  return (
    <form action={action} className="approve-row">
      <input type="hidden" name="userCode" value={userCode} />
      <button className="btn primary" disabled={pending}>
        {pending ? "Approving…" : `Approve as @${handle}`}
      </button>
      {state.error && <p className="error">{state.error}</p>}
    </form>
  );
}
