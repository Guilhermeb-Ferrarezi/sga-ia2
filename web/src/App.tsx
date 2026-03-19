import { lazy, Suspense } from "react";
import { BrowserRouter, HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { WebSocketProvider } from "@/contexts/WebSocketContext";
import { ToastProvider } from "@/contexts/ToastContext";
import LoadingScreen from "@/components/ui/loading-screen";
import AccessDenied from "@/components/auth/AccessDenied";
import { PERMISSIONS, hasPermission, type Permission } from "@/lib/rbac";

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
const UsersPage = lazy(() => import("@/pages/UsersPage"));
const CreateUserPage = lazy(() => import("@/pages/CreateUserPage"));
const TemplatesPage = lazy(() => import("@/pages/TemplatesPage"));
const TagsPage = lazy(() => import("@/pages/TagsPage"));
const TasksPage = lazy(() => import("@/pages/TasksPage"));
const AudiosPage = lazy(() => import("@/pages/AudiosPage"));
const WhatsAppProfilePage = lazy(() => import("@/pages/WhatsAppProfilePage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));

function PermissionRoute({
  permission,
  children,
}: {
  permission: Permission;
  children: JSX.Element;
}) {
  const { user } = useAuth();

  if (!hasPermission(user, permission)) {
    return <AccessDenied />;
  }

  return children;
}

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
          <Route
            path="/dashboard"
            element={
              <PermissionRoute permission={PERMISSIONS.DASHBOARD_VIEW}>
                <DashboardPage />
              </PermissionRoute>
            }
          >
            <Route
              index
              element={
                <PermissionRoute permission={PERMISSIONS.DASHBOARD_VIEW}>
                  <OverviewTab />
                </PermissionRoute>
              }
            />
            <Route
              path="conversations"
              element={
                <PermissionRoute permission={PERMISSIONS.CONVERSATIONS_VIEW}>
                  <ConversationsTab />
                </PermissionRoute>
              }
            />
            <Route
              path="contacts"
              element={
                <PermissionRoute permission={PERMISSIONS.CONTACTS_VIEW}>
                  <ContactsPage />
                </PermissionRoute>
              }
            />
            <Route
              path="users"
              element={
                <PermissionRoute permission={PERMISSIONS.USERS_MANAGE}>
                  <UsersPage />
                </PermissionRoute>
              }
            />
            <Route
              path="users/new"
              element={
                <PermissionRoute permission={PERMISSIONS.USERS_MANAGE}>
                  <CreateUserPage />
                </PermissionRoute>
              }
            />
            <Route
              path="pipeline"
              element={
                <PermissionRoute permission={PERMISSIONS.PIPELINE_VIEW}>
                  <PipelineBoard />
                </PermissionRoute>
              }
            />
            <Route
              path="handoffs"
              element={
                <PermissionRoute permission={PERMISSIONS.HANDOFF_VIEW}>
                  <HandoffQueuePage />
                </PermissionRoute>
              }
            />
            <Route
              path="tasks"
              element={
                <PermissionRoute permission={PERMISSIONS.TASKS_VIEW}>
                  <TasksPage />
                </PermissionRoute>
              }
            />
            <Route
              path="faqs"
              element={
                <PermissionRoute permission={PERMISSIONS.FAQS_VIEW}>
                  <FaqsPage />
                </PermissionRoute>
              }
            />
            <Route
              path="templates"
              element={
                <PermissionRoute permission={PERMISSIONS.TEMPLATES_VIEW}>
                  <TemplatesPage />
                </PermissionRoute>
              }
            />
            <Route
              path="tags"
              element={
                <PermissionRoute permission={PERMISSIONS.TAGS_VIEW}>
                  <TagsPage />
                </PermissionRoute>
              }
            />
            <Route
              path="audios"
              element={
                <PermissionRoute permission={PERMISSIONS.AUDIOS_VIEW}>
                  <AudiosPage />
                </PermissionRoute>
              }
            />
            <Route
              path="whatsapp-profile"
              element={
                <PermissionRoute permission={PERMISSIONS.WHATSAPP_PROFILE_VIEW}>
                  <WhatsAppProfilePage />
                </PermissionRoute>
              }
            />
            <Route path="settings" element={<SettingsPage />} />
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
