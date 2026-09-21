import { Pressable, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import { useSystem } from '@/lib/powersync/system';
import { useAuthState } from '@/lib/supabase/useAuthState';

export default function AccountScreen() {
  const system = useSystem();
  const auth = useAuthState();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Account</Text>
      <Text style={styles.email}>{auth.loading ? '' : auth.session?.user.email}</Text>
      <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />
      <Pressable style={styles.button} onPress={() => system.supabaseConnector.signOut()}>
        <Text style={styles.buttonText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: 'bold' },
  email: { marginTop: 8, opacity: 0.7 },
  separator: { marginVertical: 30, height: 1, width: '80%' },
  button: { backgroundColor: '#d33', borderRadius: 8, paddingVertical: 12, paddingHorizontal: 24 },
  buttonText: { color: '#fff', fontWeight: '600' },
});
