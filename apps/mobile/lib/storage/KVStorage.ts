import { deleteItemAsync, getItemAsync, setItemAsync } from "expo-secure-store";

/** Supabase auth session storage backed by the device keychain/keystore, not AsyncStorage. */
export class KVStorage {
  async getItem(key: string): Promise<string | null> {
    try {
      return (await getItemAsync(key)) ?? null;
    } catch {
      return null;
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    await setItemAsync(key, value);
  }

  async removeItem(key: string): Promise<void> {
    await deleteItemAsync(key);
  }
}
