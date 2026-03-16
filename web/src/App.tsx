import { lazy, Suspense } from "react";
import { BrowserRouter, HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { WebSocketProvider } from "@/contexts/WebSocketContext";
import { ToastProvider } from "@/contexts/ToastContext";
import LoadingScreen from "@/components/ui/loading-screen";

const isElectronDesktop = (): boolean => {
  if (typeof navigator === "undefined") return false;
  return /electron/i.test(navigator.userAgent);
};

const Router = isElectronDesktop() ? HashRouter : BrowserRouter;

const LoginPage = lazy(() => import("@/pages/LoginPage"));
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const OverviewTab = lazy(() => import("@/components/dashboard/OverviewTab"));
const ConversationsTab = lazy(() => import("@/components/dashboard/ConversationsTab"));
const PipelineBoard = lazy(() => import("@/components/dashboard/PipelineBoard"));
const FaqsPage = lazy(() => import("@/pages/FaqsPage"));
const HandoffQueuePage = lazy(() => import("@/pages/HandoffQueuePage"));
const ContactsPage = lazy(() => import("@/pages/ContactsPage"));
const CreateUserPage = lazy(() => import("@/pages/CreateUserPage"));
const TemplatesPage = lazy(() => import("@/pages/TemplatesPage"));
const TagsPage = lazy(() => import("@/pages/TagsPage"));
const TasksPage = lazy(() => import("@/pages/TasksPage"));
const AudiosPage = lazy(() => import("@/pages/AudiosPage"));
const WhatsAppProfilePage = lazy(() => import("@/pages/WhatsAppProfilePage"));

function AuthGate() {
  const { token, user, bootLoading } = useAuth();

  if (bootLoading) {
    return (
      <LoadingScreen
        title="Carregando sessao"
        description="Validando acesso ao painel SG Esports IA."
      />
    );
  }

  if (!user || !token) {
    return (
      <Suspense
        fallback={
          <LoadingScreen
            title="Abrindo login"
            description="Preparando formulario de autenticacao."
          />
        }
      >
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <WebSocketProvider>
      <Suspense
        fallback={
          <LoadingScreen
            title="Carregando painel"
            description="Sincronizando modulos e conexoes do dashboard."
          />
        }
      >
        <Routes>
          <Route path="/dashboard" element={<DashboardPage />}>
            <Route index element={<OverviewTab />} />
            <Route path="conversations" element={<ConversationsTab />} />
            <Route path="contacts" element={<ContactsPage />} />
            <Route path="users/new" element={<CreateUserPage />} />
            <Route path="pipeline" element={<PipelineBoard />} />
            <Route path="handoffs" element={<HandoffQueuePage />} />
            <Route path="tasks" element={<TasksPage />} />
            <Route path="faqs" element={<FaqsPage />} />
            <Route path="templates" element={<TemplatesPage />} />
            <Route path="tags" element={<TagsPage />} />
            <Route path="audios" element={<AudiosPage />} />
            <Route path="whatsapp-profile" element={<WhatsAppProfilePage />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </WebSocketProvider>
  );
}

export default function App(): JSX.Element {
  return (
    <Router>
      <ToastProvider>
        <AuthProvider>
          <AuthGate />
        </AuthProvider>
      </ToastProvider>
    </Router>
  );
}
