import React, { type ReactNode } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { MD3DarkTheme, PaperProvider } from "react-native-paper";
import { AuthProvider } from "./AuthContext";
import { ToastProvider } from "./ToastContext";
import { WebSocketProvider } from "./WebSocketContext";
import { OperationalAlertsProvider } from "./OperationalAlertsContext";

const appTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: "#6366f1",
    secondary: "#22d3ee",
    background: "#0f172a",
    surface: "#1e293b",
  },
};

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SafeAreaProvider>
      <PaperProvider theme={appTheme}>
        <AuthProvider>
          <ToastProvider>
            <WebSocketProvider>
              <OperationalAlertsProvider>{children}</OperationalAlertsProvider>
            </WebSocketProvider>
          </ToastProvider>
        </AuthProvider>
      </PaperProvider>
    </SafeAreaProvider>
  );
}
