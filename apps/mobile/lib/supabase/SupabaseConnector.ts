import {
  AbstractPowerSyncDatabase,
  CrudEntry,
  PowerSyncBackendConnector,
  UpdateType,
  type PowerSyncCredentials,
} from "@powersync/react-native";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { SupportedStorage } from "@supabase/auth-js";
import { AppConfig } from "../config/AppConfig";

/** Postgres error codes that indicate a bug (bad data, RLS violation), not a transient
 * failure — these get discarded rather than retried forever. */
const FATAL_RESPONSE_CODES = [
  /^22.../, // Data Exception (e.g. type mismatch)
  /^23.../, // Integrity Constraint Violation (NOT NULL, FK, UNIQUE)
  /^42501$/, // Insufficient privilege — typically an RLS violation
];

export class SupabaseConnector implements PowerSyncBackendConnector {
  client: SupabaseClient;

  constructor(kvStorage: SupportedStorage) {
    this.client = createClient(AppConfig.supabaseUrl, AppConfig.supabaseAnonKey, {
      auth: {
        persistSession: true,
        storage: kvStorage,
      },
    });
  }

  async signIn(email: string, password: string) {
    const { error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async signUp(email: string, password: string) {
    const { error } = await this.client.auth.signUp({ email, password });
    if (error) throw error;
  }

  async signOut() {
    await this.client.auth.signOut();
  }

  async fetchCredentials(): Promise<PowerSyncCredentials> {
    const {
      data: { session },
      error,
    } = await this.client.auth.getSession();

    if (!session || error) {
      throw new Error(`Could not fetch Supabase session: ${error?.message}`);
    }

    return {
      endpoint: AppConfig.powersyncUrl,
      token: session.access_token,
    };
  }

  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction();
    if (!transaction) return;

    let lastOp: CrudEntry | null = null;
    try {
      for (const op of transaction.crud) {
        lastOp = op;
        const table = this.client.from(op.table);
        let result;
        switch (op.op) {
          case UpdateType.PUT:
            result = await table.upsert({ ...op.opData, id: op.id });
            break;
          case UpdateType.PATCH:
            result = await table.update(op.opData ?? {}).eq("id", op.id);
            break;
          case UpdateType.DELETE:
            result = await table.delete().eq("id", op.id);
            break;
        }

        if (result?.error) {
          throw result.error;
        }
      }
      await transaction.complete();
    } catch (ex: any) {
      if (typeof ex.code === "string" && FATAL_RESPONSE_CODES.some((re) => re.test(ex.code))) {
        // A bug in the app produced this row, not a transient failure — discard it
        // rather than retrying forever and blocking the upload queue.
        console.error("Data upload error - discarding:", lastOp, ex);
        await transaction.complete();
      } else {
        throw ex; // retryable (network, temporary server error)
      }
    }
  }
}
