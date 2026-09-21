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

  async init() {
    await this.powersync.init();
    await this.powersync.connect(this.supabaseConnector);
  }
}

export const system = new System();

const SystemContext = createContext(system);
export const useSystem = () => useContext(SystemContext);

/** Initializes PowerSync once and exposes it via both our own context (for
 * `system.supabaseConnector`) and `@powersync/react`'s PowerSyncContext (for `useQuery`). */
export function SystemProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    system.init().then(() => setReady(true));
  }, []);

  if (!ready) return null;

  return (
    <SystemContext.Provider value={system}>
      <PowerSyncContext.Provider value={system.powersync}>{children}</PowerSyncContext.Provider>
    </SystemContext.Provider>
  );
}
