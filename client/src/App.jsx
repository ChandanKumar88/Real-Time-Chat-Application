import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ChatProvider } from "./context/ChatContext";
import AuthPage from "./pages/AuthPage";
import HomePage from "./pages/HomePage";
import ProfilePage from "./pages/ProfilePage";

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="grid min-h-screen place-items-center">Loading...</div>;
  return user ? children : <Navigate to="/login" replace />;
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" /> : <AuthPage mode="login" />} />
      <Route path="/signup" element={user ? <Navigate to="/" /> : <AuthPage mode="signup" />} />
      <Route
        path="/"
        element={
          <Protected>
            <ChatProvider>
              <HomePage />
            </ChatProvider>
          </Protected>
        }
      />
      <Route
        path="/profile"
        element={
          <Protected>
            <ProfilePage />
          </Protected>
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster
          position="top-center"
          gutter={10}
          containerStyle={{
            top: "max(16px, env(safe-area-inset-top, 16px))",
            left: 12,
            right: 12,
            zIndex: 999999,
          }}
          toastOptions={{
            duration: 4000,
            style: {
              background: "rgba(18, 22, 36, 0.96)",
              color: "#f8fafc",
              border: "1px solid rgba(255, 255, 255, 0.14)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              boxShadow: "0 20px 45px -8px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.08)",
              borderRadius: "16px",
              padding: "12px 18px",
              fontSize: "14px",
              fontWeight: "500",
              maxWidth: "calc(100vw - 24px)",
              width: "max-content",
              lineHeight: "1.45",
              letterSpacing: "-0.01em",
              wordBreak: "break-word",
            },
            error: {
              iconTheme: {
                primary: "#f43f5e",
                secondary: "#181424",
              },
              style: {
                border: "1px solid rgba(244, 63, 94, 0.35)",
                background: "rgba(28, 14, 28, 0.98)",
                boxShadow: "0 20px 45px -8px rgba(244, 63, 94, 0.3), 0 0 0 1px rgba(244, 63, 94, 0.15)",
              },
            },
            success: {
              iconTheme: {
                primary: "#10b981",
                secondary: "#0d1a16",
              },
              style: {
                border: "1px solid rgba(16, 185, 129, 0.35)",
                background: "rgba(13, 28, 24, 0.98)",
                boxShadow: "0 20px 45px -8px rgba(16, 185, 129, 0.25), 0 0 0 1px rgba(16, 185, 129, 0.15)",
              },
            },
            loading: {
              iconTheme: {
                primary: "#a855f7",
                secondary: "#181424",
              },
            },
          }}
        />
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
