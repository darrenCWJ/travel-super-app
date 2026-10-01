import { StyleSheet, Text, View } from "react-native";
import { manifests } from "@tsa/features/_registry/manifests";

// The skeleton's only job: prove the app builds, and that the generated registry
// reaches Metro through the workspace (spec §0 "Registry"). The launcher that
// lists apps arrives with the shell in phase 3.
export default function Home() {
  return (
    <View style={styles.screen}>
      <Text accessibilityRole="header" style={styles.title}>
        Travel super app
      </Text>
      <Text style={styles.body}>{`${manifests.length} apps registered`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "#f3f6fa" },
  title: { fontSize: 24, fontWeight: "700", color: "#17263b" },
  body: { marginTop: 8, fontSize: 16, color: "#4a5b72" },
});
