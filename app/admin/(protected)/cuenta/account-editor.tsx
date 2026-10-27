"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Feedback, ui } from "../../admin-ui";
import { useAdminUser } from "../admin-shell";

function PasswordInput({ label, value, onChange, autoComplete, hint }: {
  label: string; value: string; onChange: (value: string) => void; autoComplete: string; hint?: string;
}) {
  const [visible, setVisible] = useState(false);
  return <label className={ui.label}>{label}
    <span className="flex">
      <input autoComplete={autoComplete} className={`${ui.input} border-r-0`} maxLength={1024} onChange={(event) => onChange(event.target.value)}
        required type={visible ? "text" : "password"} value={value} />
      <button aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"} className="h-11 shrink-0 border border-line px-3 text-xs font-medium hover:border-ink"
        onClick={() => setVisible(!visible)} type="button">{visible ? "Ocultar" : "Mostrar"}</button>
    </span>
    {hint && <span className={ui.hint}>{hint}</span>}
  </label>;
}

export default function AccountEditor() {
  const user = useAdminUser();
  const router = useRouter();
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [username, setUsername] = useState(user?.username || "");
  const [profilePassword, setProfilePassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState<"profile" | "password" | null>(null);
  const [profileFeedback, setProfileFeedback] = useState({ error: "", notice: "" });
  const [passwordFeedback, setPasswordFeedback] = useState({ error: "", notice: "" });

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy("profile"); setProfileFeedback({ error: "", notice: "" });
    try {
      const response = await fetch("/api/admin/account", { method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, username: username.trim().toLowerCase(), currentPassword: profilePassword }) });
      if (!response.ok) throw new Error((await response.text()).trim() || "No se pudieron guardar los datos.");
      const saved = (await response.json()) as { username: string; displayName: string };
      setDisplayName(saved.displayName); setUsername(saved.username); setProfilePassword("");
      setProfileFeedback({ error: "", notice: `Datos guardados. Desde ahora inicias sesión como «${saved.username}».` });
      router.refresh();
    } catch (failure) {
      setProfileFeedback({ error: failure instanceof Error ? failure.message : "No se pudieron guardar los datos.", notice: "" });
    } finally { setBusy(null); }
  }

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (newPassword !== confirmPassword) {
      setPasswordFeedback({ error: "La confirmación no coincide con la nueva contraseña.", notice: "" }); return;
    }
    if (newPassword === currentPassword) {
      setPasswordFeedback({ error: "La nueva contraseña debe ser distinta de la actual.", notice: "" }); return;
    }
    setBusy("password"); setPasswordFeedback({ error: "", notice: "" });
    try {
      const response = await fetch("/api/admin/account/password", { method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }) });
      if (!response.ok) throw new Error((await response.text()).trim() || "No se pudo cambiar la contraseña.");
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      setPasswordFeedback({ error: "", notice: "Contraseña actualizada. Se cerraron las sesiones abiertas en otros dispositivos." });
    } catch (failure) {
      setPasswordFeedback({ error: failure instanceof Error ? failure.message : "No se pudo cambiar la contraseña.", notice: "" });
    } finally { setBusy(null); }
  }

  const usernameValid = /^[a-z][a-z0-9_-]{2,31}$/.test(username.trim().toLowerCase());
  const strength = newPassword.length === 0 ? "" : newPassword.length < 7 ? "Demasiado corta" : newPassword.length < 12 ? "Aceptable" : "Recomendada";

  return <div className="grid items-start gap-4 xl:grid-cols-2">
    <form className={`${ui.card} ${ui.cardPad} flex flex-col gap-4`} onSubmit={(event) => void saveProfile(event)}>
      <div>
        <h2 className={ui.cardTitle}>Datos de la cuenta</h2>
        <p className={`${ui.hint} mt-1`}>El nombre visible aparece en el panel y en el historial. El nombre de usuario es el que usas para iniciar sesión.</p>
      </div>
      <fieldset className="m-0 flex flex-col gap-4 border-0 p-0" disabled={busy !== null}>
        <label className={ui.label}>Nombre visible *
          <input autoComplete="name" className={ui.input} maxLength={120} onChange={(event) => setDisplayName(event.target.value)} required value={displayName} />
        </label>
        <label className={ui.label}>Nombre de usuario *
          <input autoCapitalize="none" autoComplete="username" className={`${ui.input} font-mono`} maxLength={32}
            onChange={(event) => setUsername(event.target.value.toLowerCase())} required spellCheck={false} value={username} />
          <span className={`${ui.hint} ${username && !usernameValid ? "text-red-700" : ""}`}>De 3 a 32 caracteres: empieza con una letra y usa minúsculas, números, «_» o «-».</span>
        </label>
        <PasswordInput autoComplete="current-password" hint="Necesaria para confirmar el cambio." label="Contraseña actual *" onChange={setProfilePassword} value={profilePassword} />
      </fieldset>
      <Feedback error={profileFeedback.error} notice={profileFeedback.notice} />
      <button className={`${ui.primary} self-start`} disabled={busy !== null || !usernameValid} type="submit">{busy === "profile" ? "Guardando…" : "Guardar datos"}</button>
    </form>

    <form className={`${ui.card} ${ui.cardPad} flex flex-col gap-4`} onSubmit={(event) => void savePassword(event)}>
      <div>
        <h2 className={ui.cardTitle}>Cambiar contraseña</h2>
        <p className={`${ui.hint} mt-1`}>Al cambiarla se cierran las sesiones abiertas en otros dispositivos; esta sesión sigue activa.</p>
      </div>
      <fieldset className="m-0 flex flex-col gap-4 border-0 p-0" disabled={busy !== null}>
        <PasswordInput autoComplete="current-password" label="Contraseña actual *" onChange={setCurrentPassword} value={currentPassword} />
        <PasswordInput autoComplete="new-password" hint={strength ? `Más de 6 caracteres · ${strength}` : "Más de 6 caracteres. Se recomienda una frase larga y única."}
          label="Nueva contraseña *" onChange={setNewPassword} value={newPassword} />
        <PasswordInput autoComplete="new-password" hint={confirmPassword && confirmPassword !== newPassword ? "No coincide con la nueva contraseña." : undefined}
          label="Repite la nueva contraseña *" onChange={setConfirmPassword} value={confirmPassword} />
      </fieldset>
      <Feedback error={passwordFeedback.error} notice={passwordFeedback.notice} />
      <button className={`${ui.primary} self-start`} disabled={busy !== null || newPassword.length < 7 || newPassword !== confirmPassword} type="submit">
        {busy === "password" ? "Guardando…" : "Cambiar contraseña"}</button>
    </form>
  </div>;
}
