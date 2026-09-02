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
          gutter={12}
          containerStyle={{
            top: 20,
            left: 16,
            right: 16,
          }}
          toastOptions={{
            duration: 4000,
            style: {
              background: "rgba(14, 16, 28, 0.94)",
              color: "#f8fafc",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              boxShadow: "0 20px 45px -8px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.08)",
              borderRadius: "18px",
              padding: "11px 18px",
              fontSize: "13.5px",
              fontWeight: "500",
              maxWidth: "460px",
              lineHeight: "1.45",
              letterSpacing: "-0.01em",
            },
            error: {
              iconTheme: {
                primary: "#f43f5e",
                secondary: "#181424",
              },
              style: {
                border: "1px solid rgba(244, 63, 94, 0.28)",
                background: "rgba(24, 14, 26, 0.96)",
                boxShadow: "0 20px 45px -8px rgba(244, 63, 94, 0.25), 0 0 0 1px rgba(244, 63, 94, 0.15)",
              },
            },
            success: {
              iconTheme: {
                primary: "#10b981",
                secondary: "#0d1a16",
              },
              style: {
                border: "1px solid rgba(16, 185, 129, 0.28)",
                background: "rgba(13, 26, 22, 0.96)",
                boxShadow: "0 20px 45px -8px rgba(16, 185, 129, 0.2), 0 0 0 1px rgba(16, 185, 129, 0.15)",
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
