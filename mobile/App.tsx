import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { AppProviders } from "@/contexts/AppProviders";
import { useAuth } from "@/contexts/AuthContext";
import { RootNavigator } from "@/navigation/RootNavigator";

function Root() {
  const { bootLoading } = useAuth();

  if (bootLoading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#6366f1" />
        <StatusBar style="light" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <RootNavigator />
    </>
  );
}

export default function App() {
  return (
    <AppProviders>
      <Root />
    </AppProviders>
  );
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
  },
});
