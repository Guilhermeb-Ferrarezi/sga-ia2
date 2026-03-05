import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import LoadingScreen from "@/components/ui/loading-screen";
import { OperationalAlertsProvider } from "@/contexts/OperationalAlertsContext";
import { useNotifications } from "@/hooks/useNotifications";

export default function DashboardPage() {
  // Initialize browser notification listener
  useNotifications();

  return (
    <div className="flex min-h-screen flex-col">
      <OperationalAlertsProvider>
        <Header />
        <div className="flex flex-1">
          <Sidebar />
          <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-7">
            <Suspense
              fallback={
                <LoadingScreen
                  variant="content"
                  title="Carregando modulo"
                  description="Preparando a pagina selecionada."
                />
              }
            >
              <Outlet />
            </Suspense>
          </main>
        </div>
      </OperationalAlertsProvider>
    </div>
  );
}
