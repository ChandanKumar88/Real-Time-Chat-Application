import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import AuthForm from "../components/AuthForm";
import { useAuth } from "../context/AuthContext";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="grid min-h-screen place-items-center p-4">
      <div className="w-full max-w-md">
        <AuthForm
          type="login"
          onSubmit={async (payload) => {
            try {
              await login(payload);
              toast.success("Logged in");
              navigate("/");
            } catch (e) {
              toast.error(e.response?.data?.message || "Login failed");
            }
          }}
        />
        <p className="mt-3 text-center text-sm">
          No account? <Link className="text-blue-600" to="/signup">Sign up</Link>
        </p>
      </div>
    </div>
  );
}
