import { useQuery } from '@powersync/react';
import { StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import type { PilotProfileRecord } from '@/lib/powersync/AppSchema';

export default function DatasetsScreen() {
  // Tier-1 mutable data (pilot_profiles) syncs through PowerSync and is queryable
  // locally even offline. Tier-2 reference bundles (datasets, airports, ...) aren't
  // wired up yet — services/ingest/nasr lands that; this screen will list installed
  // bundles once it exists.
  const { data: pilotProfiles } = useQuery<PilotProfileRecord>('SELECT * FROM pilot_profiles');

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Datasets</Text>
      <Text style={styles.subtitle}>No reference bundles installed yet.</Text>
      <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />
      <Text style={styles.sectionHeader}>Pilot profile (synced via PowerSync)</Text>
      <Text>{pilotProfiles.length > 0 ? JSON.stringify(pilotProfiles[0]) : 'No pilot profile yet.'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 24, fontWeight: 'bold' },
  subtitle: { marginTop: 8, opacity: 0.6 },
  separator: { marginVertical: 24, height: 1, width: '80%' },
  sectionHeader: { fontWeight: '600', marginBottom: 8 },
});
