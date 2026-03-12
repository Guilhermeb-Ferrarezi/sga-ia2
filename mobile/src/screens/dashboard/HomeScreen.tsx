import React from "react";
import { StyleSheet, Text, View } from "react-native";

export function HomeScreen() {
  return (
    <View style={styles.root}>
      <Text style={styles.text}>Dashboard</Text>
      <Text style={styles.sub}>Em construção…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    color: "#f1f5f9",
    fontSize: 22,
    fontWeight: "700",
  },
  sub: {
    color: "#64748b",
    fontSize: 14,
    marginTop: 8,
  },
});
