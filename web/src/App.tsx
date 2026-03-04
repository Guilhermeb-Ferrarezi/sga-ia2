import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { WebSocketProvider } from "@/contexts/WebSocketContext";
import { ToastProvider } from "@/contexts/ToastContext";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import OverviewTab from "@/components/dashboard/OverviewTab";
import ConversationsTab from "@/components/dashboard/ConversationsTab";
import PipelineBoard from "@/components/dashboard/PipelineBoard";
import FaqsPage from "@/pages/FaqsPage";
import HandoffQueuePage from "@/pages/HandoffQueuePage";
import TemplatesPage from "@/pages/TemplatesPage";
import TagsPage from "@/pages/TagsPage";
import TasksPage from "@/pages/TasksPage";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function AuthGate() {
  const { token, user, bootLoading } = useAuth();

  if (bootLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-sm animate-fade-up">
          <CardHeader>
            <CardTitle>Carregando sessao</CardTitle>
            <CardDescription>
              Validando acesso ao painel SG Esports IA.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  if (!user || !token) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <WebSocketProvider>
      <Routes>
        <Route path="/dashboard" element={<DashboardPage />}>
          <Route index element={<OverviewTab />} />
          <Route path="conversations" element={<ConversationsTab />} />
          <Route path="pipeline" element={<PipelineBoard />} />
          <Route path="handoffs" element={<HandoffQueuePage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="faqs" element={<FaqsPage />} />
          <Route path="templates" element={<TemplatesPage />} />
          <Route path="tags" element={<TagsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </WebSocketProvider>
  );
}

export default function App(): JSX.Element {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <AuthGate />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
