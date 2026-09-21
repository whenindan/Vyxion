import "@azure/core-asynciterator-polyfill";

import { PowerSyncDatabase } from "@powersync/react-native";
import { PowerSyncContext } from "@powersync/react";
import React, { createContext, useContext, useEffect, useState } from "react";
import { KVStorage } from "../storage/KVStorage";
import { SupabaseConnector } from "../supabase/SupabaseConnector";
import { AppSchema } from "./AppSchema";

export class System {
  supabaseConnector: SupabaseConnector;
  powersync: PowerSyncDatabase;

  constructor() {
    this.supabaseConnector = new SupabaseConnector(new KVStorage());
    this.powersync = new PowerSyncDatabase({
      schema: AppSchema,
      database: { dbFilename: "vyxion.db" },
    });
  }

  /** Opens the local SQLite store. Safe to call before sign-in — queries just return
   * no rows until data syncs down. Does not start the sync connection. */
  async init() {
    await this.powersync.init();
  }
}

export const system = new System();

const SystemContext = createContext(system);
export const useSystem = () => useContext(SystemContext);

/**
 * Initializes the local PowerSync store once, and starts/stops the sync connection in
 * lockstep with Supabase auth state. Connecting before a session exists would just make
 * PowerSync fail `fetchCredentials` and log a (harmless but noisy) sync error on every
 * retry, so we wait for a real session instead.
 */
export function SystemProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    system.init().then(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!ready) return;

    const { data: subscription } = system.supabaseConnector.client.auth.onAuthStateChange((_event, session) => {
      if (session) {
        system.powersync.connect(system.supabaseConnector);
      } else {
        system.powersync.disconnect();
      }
    });

    return () => subscription.subscription.unsubscribe();
  }, [ready]);

  if (!ready) return null;

  return (
    <SystemContext.Provider value={system}>
      <PowerSyncContext.Provider value={system.powersync}>{children}</PowerSyncContext.Provider>
    </SystemContext.Provider>
  );
}
