'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { EyeIcon, EyeOffIcon } from '@/src/components/ui/icons';

export default function CommandCenterLoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('admin@sincro.co');
  const [password, setPassword] = useState('admin123');
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Si ya hay sesión válida, saltar directo al centro de mando
    fetch('/api/command-center/auth/me')
      .then((res) => {
        if (res.ok) router.replace('/command-center');
      })
      .catch(() => {});
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/command-center/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || 'Error al autenticar credenciales institucionales');
      }

      router.push('/command-center');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  const Toggle = visible ? EyeOffIcon : EyeIcon;

  return (
    <div className="forced-dark min-h-screen bg-surface-base text-content flex flex-col justify-center items-center px-4 sm:px-6 lg:px-8 relative overflow-hidden font-sans screen-enter">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-info/10 blur-[130px] rounded-full pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[400px] h-[400px] bg-emergency/10 blur-[140px] rounded-full pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Header institucional */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-info/30 bg-info/10 text-info text-xs font-semibold uppercase tracking-wider mb-4">
            <span className="w-2 h-2 rounded-full bg-info animate-pulse" />
            Acceso Gubernamental B2G · CRUED / DADIS
          </div>
          <h1 className="text-3xl font-black tracking-tight text-content flex items-center justify-center gap-2">
            <span>SINCRO</span>
            <span className="text-info text-xl font-medium tracking-normal border-l border-edge-strong pl-2">
              Centro de Mando
            </span>
          </h1>
          <p className="mt-2 text-sm text-content-secondary">
            Plataforma de monitoreo y regulación de la red de ambulancias, urgencias y capacidad hospitalaria distrital.
          </p>
        </div>

        {/* Card de acceso */}
        <div className="bg-surface-raised/90 backdrop-blur-md border border-surface-overlay rounded-2xl p-6 sm:p-8 shadow-2xl shadow-black/50">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div role="alert" className="p-3.5 rounded-xl bg-emergency-soft border border-emergency/40 text-emergency text-xs flex items-start gap-2.5 animate-slide-in-down">
                <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-content-secondary mb-1.5">
                Usuario Institucional / Correo
              </label>
              <input
                type="text"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="admin@sincro.co"
                className="w-full px-4 py-3 rounded-xl bg-surface-overlay/70 border border-edge-subtle text-content placeholder:text-content-muted text-sm focus:outline-none focus:border-info transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-content-secondary mb-1.5">
                Contraseña de Acceso
              </label>
              <div className="relative">
                <input
                  type={visible ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 pr-12 rounded-xl bg-surface-overlay/70 border border-edge-subtle text-content placeholder:text-content-muted text-sm focus:outline-none focus:border-info transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setVisible((v) => !v)}
                  aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  aria-pressed={visible}
                  className="absolute inset-y-0 right-2 flex items-center px-2 text-content-muted hover:text-content transition"
                >
                  <Toggle size={18} />
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-4 rounded-xl font-semibold text-sm bg-gradient-to-r from-info to-[#2563eb] hover:brightness-110 text-white shadow-lg shadow-black/30 transition-all transform active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <span>Validando credenciales...</span>
                </>
              ) : (
                <>
                  <span>Ingresar a la Consola de Mando</span>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </>
              )}
            </button>
          </form>

          {/* Demo hint for instant testing */}
          <div className="mt-6 pt-5 border-t border-edge-subtle text-xs text-content-muted">
            <div className="flex items-center justify-between text-[11px] mb-2 font-mono text-content-muted">
              <span>Credenciales de demostración B2G:</span>
              <button
                type="button"
                onClick={() => {
                  setIdentifier('admin@sincro.co');
                  setPassword('admin123');
                }}
                className="text-info hover:underline cursor-pointer"
              >
                Autocompletar
              </button>
            </div>
            <div className="bg-surface-overlay/50 p-2.5 rounded-lg font-mono text-[11px] text-content-secondary space-y-0.5 border border-edge-subtle">
              <div>Usuario: <span className="text-content font-semibold">admin@sincro.co</span></div>
              <div>Clave: <span className="text-content font-semibold">admin123</span></div>
            </div>
          </div>
        </div>

        {/* Footer institucional */}
        <div className="mt-8 text-center text-xs text-content-muted">
          <p>Alcaldía Mayor de Cartagena de Indias · DADIS · CRUED</p>
          <p className="mt-1">Tecnología de Despacho y Regulación Asistida SINCRO</p>
        </div>
      </div>
    </div>
  );
}
