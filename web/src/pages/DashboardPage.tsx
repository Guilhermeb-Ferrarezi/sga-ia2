import { Suspense, useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import LoadingScreen from "@/components/ui/loading-screen";
import { OperationalAlertsProvider } from "@/contexts/OperationalAlertsContext";
import { useNotifications } from "@/hooks/useNotifications";

export default function DashboardPage() {
  // Initialize browser notification listener
  useNotifications();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  return (
    <div className="flex h-screen overflow-hidden w-full bg-background">
      <OperationalAlertsProvider>
        <Sidebar
          mobileOpen={mobileMenuOpen}
          onCloseMobile={() => setMobileMenuOpen(false)}
        />
        <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
          <Header
            mobileMenuOpen={mobileMenuOpen}
            onToggleMobileMenu={() => setMobileMenuOpen((prev) => !prev)}
          />
          <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-7">
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
