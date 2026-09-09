import { FormEvent, useState } from "react";
import { useAuth } from "../context/AuthContext";

const API_HINT = (import.meta.env.VITE_API_URL ?? "http://localhost:8000/api/v1").replace(
  /\/api\/v1\/?$/,
  "",
);

export default function LoginForm() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al iniciar sesión");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="card auth-card">
      <p className="section-kicker">Acceso WMS</p>
      <h2>Iniciar sesión</h2>
      <p className="muted">Gestión de activos RFID · depósitos · inventarios MC33</p>
      <form className="form" onSubmit={handleSubmit} autoComplete="on">
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            maxLength={254}
            autoComplete="username"
            inputMode="email"
            placeholder="usuario@donnicolas.com"
          />
        </label>
        <label className="field">
          <span>Contraseña</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            maxLength={128}
            autoComplete="current-password"
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn primary btn-block" disabled={submitting}>
          {submitting ? "Ingresando…" : "Ingresar"}
        </button>
      </form>
      <p className="login-meta muted">API · {API_HINT}</p>
    </section>
  );
}
