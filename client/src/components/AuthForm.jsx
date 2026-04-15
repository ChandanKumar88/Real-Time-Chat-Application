import { useState } from "react";

export default function AuthForm({ type, onSubmit }) {
  const [form, setForm] = useState({ fullName: "", email: "", password: "", bio: "" });
  const isSignup = type === "signup";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
      className="space-y-3 rounded-xl bg-white p-6 shadow"
    >
      <h1 className="text-xl font-semibold">{isSignup ? "Create account" : "Welcome back"}</h1>
      {isSignup && (
        <>
          <input className="w-full rounded border p-2" placeholder="Full name" onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          <textarea className="w-full rounded border p-2" placeholder="Bio" onChange={(e) => setForm({ ...form, bio: e.target.value })} />
        </>
      )}
      <input className="w-full rounded border p-2" type="email" placeholder="Email" onChange={(e) => setForm({ ...form, email: e.target.value })} />
      <input className="w-full rounded border p-2" type="password" placeholder="Password" onChange={(e) => setForm({ ...form, password: e.target.value })} />
      <button className="w-full rounded bg-blue-600 p-2 font-medium text-white" type="submit">
        {isSignup ? "Sign up" : "Login"}
      </button>
    </form>
  );
}
