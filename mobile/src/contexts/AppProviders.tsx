import React, { type ReactNode } from "react";
import { AuthProvider } from "./AuthContext";
import { ToastProvider } from "./ToastContext";
import { WebSocketProvider } from "./WebSocketContext";
import { OperationalAlertsProvider } from "./OperationalAlertsContext";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <ToastProvider>
        <WebSocketProvider>
          <OperationalAlertsProvider>{children}</OperationalAlertsProvider>
        </WebSocketProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
