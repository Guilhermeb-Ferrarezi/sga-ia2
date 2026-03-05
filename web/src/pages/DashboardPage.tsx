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
    <div className="flex min-h-screen flex-col">
      <OperationalAlertsProvider>
        <Header
          mobileMenuOpen={mobileMenuOpen}
          onToggleMobileMenu={() => setMobileMenuOpen((prev) => !prev)}
        />
        <div className="flex flex-1">
          <Sidebar
            mobileOpen={mobileMenuOpen}
            onCloseMobile={() => setMobileMenuOpen(false)}
          />
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
