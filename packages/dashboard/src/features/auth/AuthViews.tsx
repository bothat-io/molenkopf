import { FormEvent, useState } from "react";
import type { ReactNode } from "react";
import { postJson } from "../../app/api";
import type { UserView } from "../../app/types";
import "./AuthViews.css";

const authLogoSrc = `${import.meta.env.BASE_URL}molenkopf-logo.png`;

export function LoginView({ onDone }: { onDone: (user: UserView) => void }) {
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const data = await postJson<{ ok: true; user: UserView }>("/__molenkopf/login", { username: form.get("username"), password: form.get("password") });
      onDone(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "invalid_login");
    }
  }
  return <AuthCard subtitle="Use an admin or team account.">
    <form onSubmit={submit} className="auth-form">
      <label>Username<input name="username" autoComplete="username" /></label>
      <label>Password<input name="password" type="password" autoComplete="current-password" /></label>
      <button className="primary">Sign in</button>
      <ErrorLine value={error} />
    </form>
  </AuthCard>;
}

export function SetupView({ onDone }: { onDone: (user: UserView) => void }) {
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const data = await postJson<{ ok: true; user: UserView }>("/__molenkopf/setup-admin", {
        username: form.get("username"), displayName: form.get("displayName"), password: form.get("password")
      });
      onDone(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "setup_failed");
    }
  }
  return <AuthCard title="Create the first admin" subtitle="After this, every dashboard visit requires a signed-in user.">
    <form onSubmit={submit} className="auth-form">
      <label>Admin username<input name="username" autoComplete="username" /></label>
      <label>Display name<input name="displayName" /></label>
      <label>Password<input name="password" type="password" autoComplete="new-password" /></label>
      <button className="primary">Create admin</button>
      <ErrorLine value={error} />
    </form>
  </AuthCard>;
}

export function AuthLoadingView() {
  return <div className="auth-screen auth-loading" role="status" aria-label="Loading session"><img src={authLogoSrc} alt="" aria-hidden="true" /></div>;
}

function AuthCard(props: { title?: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="auth-screen">
      <section className="auth-card">
        <div className="auth-brand">
          <img src={authLogoSrc} alt="" aria-hidden="true" />
          <span className="brand-kicker">Molenkopf</span>
        </div>
        {props.title ? <h1>{props.title}</h1> : null}
        <p>{props.subtitle}</p>
        {props.children}
      </section>
    </div>
  );
}

function ErrorLine({ value }: { value: string }) {
  return value ? <div className="msg">Error: {value}</div> : null;
}
