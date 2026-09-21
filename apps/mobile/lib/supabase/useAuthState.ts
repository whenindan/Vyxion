import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { useSystem } from "../powersync/system";

export type AuthState = { loading: true; session: null } | { loading: false; session: Session | null };

/** Reactive Supabase auth session state, for gating navigation between login and the app. */
export function useAuthState(): AuthState {
  const system = useSystem();
  const [state, setState] = useState<AuthState>({ loading: true, session: null });

  useEffect(() => {
    system.supabaseConnector.client.auth.getSession().then(({ data }) => {
      setState({ loading: false, session: data.session });
    });

    const { data: subscription } = system.supabaseConnector.client.auth.onAuthStateChange((_event, session) => {
      setState({ loading: false, session });
    });

    return () => subscription.subscription.unsubscribe();
  }, [system]);

  return state;
}
