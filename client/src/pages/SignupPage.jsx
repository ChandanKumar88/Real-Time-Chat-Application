import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import AuthForm from "../components/AuthForm";
import { useAuth } from "../context/AuthContext";

export default function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="grid min-h-screen place-items-center p-4">
      <div className="w-full max-w-md">
        <AuthForm
          type="signup"
          onSubmit={async (payload) => {
            try {
              await signup(payload);
              toast.success("Account created");
              navigate("/");
            } catch (e) {
              toast.error(e.response?.data?.message || "Signup failed");
            }
          }}
        />
        <p className="mt-3 text-center text-sm">
          Already have account? <Link className="text-blue-600" to="/login">Login</Link>
        </p>
      </div>
    </div>
  );
}
