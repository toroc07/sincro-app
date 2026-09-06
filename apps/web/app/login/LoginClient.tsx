'use client';

import type { CitizenLoginResponse, CitizenRegisterResponse, StaffLoginResponse } from '@dispatch/contracts';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AlertIcon, AmbulanceIcon, ArrowRightIcon, CheckIcon, BoltIcon, EyeIcon, EyeOffIcon, SosIcon, UserIcon } from '@/src/components/ui/icons';
import { BrandLockup, Button } from '@/src/components/ui';

type UserType = 'citizen' | 'staff';
type CitizenAuthMode = 'login' | 'register';

/** Alterna el tipo del campo de contraseña, para "mostrar/ocultar": sin
 *  cambiar el estilo del input ni la arquitectura de formulario. */
function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const Toggle = visible ? EyeOffIcon : EyeIcon;
  return (
    <Field label={label}>
      <div className="relative mt-1">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          required={required}
          className="w-full rounded-xl border border-edge-strong bg-surface-base px-4 py-3 pr-12 text-[15px] text-content placeholder:text-content-muted focus:border-emergency focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          aria-pressed={visible}
          className="absolute inset-y-0 right-2 flex items-center px-2 text-content-muted hover:text-content transition"
        >
          <Toggle size={20} />
        </button>
      </div>
    </Field>
  );
}

export function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [userType, setUserType] = useState<UserType>(
    searchParams.get('type') === 'staff' ? 'staff' : 'citizen',
  );
  const [citizenMode, setCitizenMode] = useState<CitizenAuthMode>('login');

  // Campos de Ciudadano
  const [citizenIdentifier, setCitizenIdentifier] = useState('');
  const [citizenPassword, setCitizenPassword] = useState('');
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');

  // Campos de Personal Médico/Operativo
  const [staffIdentifier, setStaffIdentifier] = useState('');
  const [staffPassword, setStaffPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Comprueba si ya existe una sesión abierta (persistencia estilo red social)
  useEffect(() => {
    // Si viene buscando staff o ya tiene sesión de staff
    fetch('/api/staff/me')
      .then((res) => {
        if (res.ok) {
          return res.json().then((data: { user?: { role?: string } }) => {
            if (data?.user?.role === 'RESPONDER') {
              router.replace('/responder/profile');
            }
          });
        }
        // Si no es staff, probar si es ciudadano
        return fetch('/api/citizens/me')
          .then((r) => r.json())
          .then((cData: { citizen?: unknown }) => {
            if (cData?.citizen && userType === 'citizen') {
              router.replace('/profile');
            }
          });
      })
      .catch(() => {});
  }, [router, userType]);

  const handleCitizenLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const response = await fetch('/api/citizens/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: citizenIdentifier,
          password: citizenPassword,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(payload?.error?.message ?? 'Credenciales inválidas');
      }

      const result = await (response.json() as Promise<CitizenLoginResponse>);
      try {
        localStorage.setItem('sincro_citizen_session', JSON.stringify(result.citizen));
      } catch {}
      setSuccessMsg('¡Inicio de sesión exitoso!');
      router.push('/profile');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Error al iniciar sesión');
      setLoading(false);
    }
  };

  const handleCitizenRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const response = await fetch('/api/citizens/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: regName,
          email: regEmail,
          phone: regPhone,
          password: regPassword.trim() ? regPassword : undefined,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(payload?.error?.message ?? 'No pudimos registrarte. Revisa los datos.');
      }

      const result = await (response.json() as Promise<CitizenRegisterResponse>);
      try {
        localStorage.setItem('sincro_citizen_session', JSON.stringify(result.citizen));
      } catch {}
      setSuccessMsg('¡Cuenta registrada exitosamente!');
      router.push('/profile');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos registrar tu cuenta');
      setLoading(false);
    }
  };

  const handleStaffLogin = async (e?: React.FormEvent, overrideIdent?: string, overridePass?: string) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const iden = overrideIdent ?? staffIdentifier;
      const pass = overridePass ?? staffPassword;

      const response = await fetch('/api/staff/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: iden,
          password: pass,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(payload?.error?.message ?? 'Credenciales de personal operativo inválidas');
      }

      const result = await (response.json() as Promise<StaffLoginResponse>);
      try {
        localStorage.setItem('sincro_staff_session', JSON.stringify(result.staff));
      } catch {}
      setSuccessMsg(`¡Bienvenido, ${result.staff.name}!`);

      if (result.staff.role === 'RESPONDER') {
        router.push('/responder/profile');
      } else {
        router.push('/');
      }
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Error al autenticar personal operativo');
      setLoading(false);
    }
  };

  return (
    <main className="app-light mobile-app-shell safe-x flex flex-col justify-center py-6 min-h-screen screen-enter">
      <header className="pb-4">
        <BrandLockup height={46} />
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-content">
          {userType === 'staff'
            ? 'Acceso Personal Operativo'
            : citizenMode === 'login'
              ? 'Iniciar Sesión'
              : 'Crea tu Cuenta'}
        </h1>
        <p className="mt-1 text-sm text-content-secondary leading-relaxed">
          {userType === 'staff'
            ? 'Consola de acceso para paramédicos, tripulaciones de ambulancia y despachadores.'
            : citizenMode === 'login'
              ? 'Accede para ver el historial de tus reportes de emergencia y tu perfil ciudadano.'
              : 'Registra tu número para que las ambulancias y el equipo médico puedan contactarte.'}
        </p>
      </header>

      {/* Selector Principal: Ciudadano vs Personal Operativo */}
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-raised p-1 mb-4 border border-edge-subtle">
        <button
          type="button"
          onClick={() => {
            setUserType('citizen');
            setError(null);
          }}
          className={`py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
            userType === 'citizen'
              ? 'bg-surface-base text-content shadow-sm border border-edge-subtle'
              : 'text-content-secondary hover:text-content'
          }`}
        >
          <UserIcon size={15} className="inline-block" />
          Ciudadano
        </button>
        <button
          type="button"
          onClick={() => {
            setUserType('staff');
            setError(null);
          }}
          className={`py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
            userType === 'staff'
              ? 'bg-emergency text-on-emergency shadow-sm font-extrabold'
              : 'text-content-secondary hover:text-content'
          }`}
        >
          <AmbulanceIcon size={15} className="inline-block" />
          Personal Médico
        </button>
      </div>

      {/* SUB-MODO CIUDADANO: Iniciar Sesión / Registro */}
      {userType === 'citizen' && (
        <>
          <div className="flex rounded-xl bg-surface-overlay p-1 mb-4 border border-edge-subtle">
            <button
              type="button"
              onClick={() => {
                setCitizenMode('login');
                setError(null);
              }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                citizenMode === 'login'
                  ? 'bg-surface-base text-content shadow-sm'
                  : 'text-content-secondary hover:text-content'
              }`}
            >
              Iniciar sesión
            </button>
            <button
              type="button"
              onClick={() => {
                setCitizenMode('register');
                setError(null);
              }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                citizenMode === 'register'
                  ? 'bg-surface-base text-content shadow-sm'
                  : 'text-content-secondary hover:text-content'
              }`}
            >
              Registrarse
            </button>
          </div>

          {citizenMode === 'login' ? (
            <form onSubmit={(e) => void handleCitizenLogin(e)} className="flex flex-col gap-3.5 animate-fade-up">
              <Field label="Correo o Teléfono">
                <input
                  required
                  type="text"
                  value={citizenIdentifier}
                  onChange={(e) => setCitizenIdentifier(e.target.value)}
                  autoComplete="username"
                  className="mt-1 w-full rounded-xl border border-edge-strong bg-surface-base px-4 py-3 text-[15px] text-content placeholder:text-content-muted focus:border-emergency focus:outline-none"
                  placeholder="tu@correo.com o +57 300 000 0000"
                />
              </Field>

              <PasswordField
                label="Contraseña"
                value={citizenPassword}
                onChange={setCitizenPassword}
                autoComplete="current-password"
                placeholder="Contraseña"
              />

              {error && (
                <p role="alert" className="flex items-start gap-2 text-emergency text-sm rounded-lg bg-emergency-soft p-3">
                  <AlertIcon size={18} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </p>
              )}

              {successMsg && (
                <p className="flex items-center gap-2 text-ok text-sm rounded-lg bg-ok-soft p-3">
                  <CheckIcon size={18} className="shrink-0" />
                  <span>{successMsg}</span>
                </p>
              )}

              <Button
                type="submit"
                disabled={loading}
                aria-busy={loading}
                className="mt-2 min-h-touch-lg w-full text-[16px] font-semibold"
              >
                {loading ? 'Ingresando…' : 'Entrar a mi cuenta'}
              </Button>
            </form>
          ) : (
            <form onSubmit={(e) => void handleCitizenRegister(e)} className="flex flex-col gap-3.5 animate-fade-up">
              <Field label="Nombre completo">
                <input
                  required
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  autoComplete="name"
                  className="mt-1 w-full rounded-xl border border-edge-strong bg-surface-base px-4 py-3 text-[15px] text-content placeholder:text-content-muted focus:border-emergency focus:outline-none"
                  placeholder="Ej. María Torres"
                />
              </Field>

              <Field label="Teléfono de contacto (para emergencias)">
                <input
                  required
                  type="tel"
                  value={regPhone}
                  onChange={(e) => setRegPhone(e.target.value)}
                  autoComplete="tel"
                  className="mt-1 w-full rounded-xl border border-edge-strong bg-surface-base px-4 py-3 text-[15px] text-content placeholder:text-content-muted focus:border-emergency focus:outline-none"
                  placeholder="+57 300 000 0000"
                />
              </Field>

              <Field label="Correo electrónico">
                <input
                  required
                  type="email"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  autoComplete="email"
                  className="mt-1 w-full rounded-xl border border-edge-strong bg-surface-base px-4 py-3 text-[15px] text-content placeholder:text-content-muted focus:border-emergency focus:outline-none"
                  placeholder="tu@correo.com"
                />
              </Field>

              <PasswordField
                label="Contraseña (opcional para proteger tu cuenta)"
                value={regPassword}
                onChange={setRegPassword}
                autoComplete="new-password"
                placeholder="Mínimo 4 caracteres (opcional)"
              />

              {error && (
                <p role="alert" className="flex items-start gap-2 text-emergency text-sm rounded-lg bg-emergency-soft p-3">
                  <AlertIcon size={18} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </p>
              )}

              {successMsg && (
                <p className="flex items-center gap-2 text-ok text-sm rounded-lg bg-ok-soft p-3">
                  <CheckIcon size={18} className="shrink-0" />
                  <span>{successMsg}</span>
                </p>
              )}

              <Button
                type="submit"
                disabled={loading}
                aria-busy={loading}
                className="mt-2 min-h-touch-lg w-full text-[16px] font-semibold"
              >
                {loading ? 'Registrando…' : 'Crear mi cuenta'}
              </Button>
            </form>
          )}

          {/* Banner de Salto Rápido a Emergencia Anónima */}
          <div className="mt-6 rounded-2xl border border-emergency/20 bg-emergency-soft/50 p-4 text-center">
            <p className="text-xs font-bold uppercase tracking-wider text-emergency">
              ¿En medio de una urgencia?
            </p>
            <p className="mt-1 text-xs text-content-secondary">
              No necesitas registrarte ni iniciar sesión para pedir una ambulancia de inmediato.
            </p>
            <Link
              href="/"
              className="mt-3 inline-flex items-center justify-center gap-2 rounded-xl bg-emergency px-4 py-2.5 text-sm font-bold text-on-emergency shadow-sm hover:bg-emergency-hover active:scale-[0.98] transition w-full"
            >
              <SosIcon size={15} className="inline-block" /> Reportar emergencia ahora (Sin registro)
            </Link>
          </div>
        </>
      )}

      {/* MODO PERSONAL OPERATIVO (STAFF / RESPONDER) */}
      {userType === 'staff' && (
        <div className="animate-fade-up">
          <form onSubmit={(e) => void handleStaffLogin(e)} className="flex flex-col gap-3.5">
            <Field label="Identificador, Correo o Teléfono">
              <input
                required
                type="text"
                value={staffIdentifier}
                onChange={(e) => setStaffIdentifier(e.target.value)}
                autoComplete="username"
                className="mt-1 w-full rounded-xl border border-edge-strong bg-surface-base px-4 py-3 text-[15px] text-content placeholder:text-content-muted focus:border-emergency focus:outline-none"
                placeholder="user-responder o responder@sincro.co"
              />
            </Field>

            <PasswordField
                label="Contraseña Operativa"
                value={staffPassword}
                onChange={setStaffPassword}
                autoComplete="current-password"
                placeholder="Contraseña"
                required
              />

            {error && (
              <p role="alert" className="flex items-start gap-2 text-emergency text-sm rounded-lg bg-emergency-soft p-3">
                <AlertIcon size={18} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </p>
            )}

            {successMsg && (
              <p className="flex items-center gap-2 text-ok text-sm rounded-lg bg-ok-soft p-3">
                <CheckIcon size={18} className="shrink-0" />
                <span>{successMsg}</span>
              </p>
            )}

            <Button
              type="submit"
              disabled={loading}
              aria-busy={loading}
              className="mt-2 min-h-touch-lg w-full text-[16px] font-semibold bg-emergency hover:bg-emergency-hover text-on-emergency"
            >
              {loading ? 'Autenticando…' : 'Acceder a Panel Operativo'}
            </Button>
          </form>

          {/* Accesos Rápidos para Demostración */}
          <div className="mt-6 rounded-2xl border border-edge-strong bg-surface-raised p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-content-secondary text-center">
              <BoltIcon size={13} className="inline-block" /> Accesos Rápidos para Demo del Hackathon
            </p>
            <div className="mt-3 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  setStaffIdentifier('user-responder');
                  setStaffPassword('responder123');
                  void handleStaffLogin(undefined, 'user-responder', 'responder123');
                }}
                className="flex items-center justify-between rounded-xl bg-surface-base px-3.5 py-2.5 text-xs font-bold text-content border border-edge-subtle hover:border-emergency hover:bg-surface-overlay transition"
              >
                <span className="flex items-center gap-2">
                  <AmbulanceIcon size={14} />
                  Tripulación Demo
                </span>
                <span className="text-[11px] font-semibold text-emergency flex items-center gap-1">Acceder <ArrowRightIcon size={12} /></span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setStaffIdentifier('user-dispatcher');
                  setStaffPassword('dispatcher123');
                  void handleStaffLogin(undefined, 'user-dispatcher', 'dispatcher123');
                }}
                className="flex items-center justify-between rounded-xl bg-surface-base px-3.5 py-2.5 text-xs font-bold text-content border border-edge-subtle hover:border-info hover:bg-surface-overlay transition"
              >
                <span className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-full bg-info/20 flex items-center justify-center"><span className="w-1.5 h-1.5 rounded-full bg-info" /></span>
                  <span>Operador de Despacho (Centro Mando)</span>
                </span>
                <span className="text-[11px] font-semibold text-info flex items-center gap-1">Acceder <ArrowRightIcon size={12} /></span>
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-bold uppercase tracking-wider text-content-secondary">
      {label}
      {children}
    </label>
  );
}
