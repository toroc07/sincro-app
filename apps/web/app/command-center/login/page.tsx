'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function CommandCenterLoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('admin@sincro.co');
  const [password, setPassword] = useState('admin123');
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

  return (
    <div className="min-h-screen bg-[#070b14] text-[#f5f8ff] flex flex-col justify-center items-center px-4 sm:px-6 lg:px-8 relative overflow-hidden font-sans">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-sky-600/10 blur-[130px] rounded-full pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[400px] h-[400px] bg-red-600/10 blur-[140px] rounded-full pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Header institucional */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-sky-500/30 bg-sky-500/10 text-sky-400 text-xs font-semibold uppercase tracking-wider mb-4">
            <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
            Acceso Gubernamental B2G · CRUED / DADIS
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white flex items-center justify-center gap-2">
            <span>SINCRO</span>
            <span className="text-sky-400 text-xl font-medium tracking-normal border-l border-white/20 pl-2">
              Centro de Mando
            </span>
          </h1>
          <p className="mt-2 text-sm text-[#aebbd4]">
            Plataforma de monitoreo y regulación de la red de ambulancias, urgencias y capacidad hospitalaria distrital.
          </p>
        </div>

        {/* Card de acceso */}
        <div className="bg-[#0f1626]/90 backdrop-blur-md border border-[#16203a] rounded-2xl p-6 sm:p-8 shadow-2xl shadow-black/50">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-500/40 text-red-300 text-xs flex items-start gap-2.5">
                <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#aebbd4] mb-1.5">
                Usuario Institucional / Correo
              </label>
              <input
                type="text"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="admin@sincro.co"
                className="w-full px-4 py-3 rounded-xl bg-[#16203a]/70 border border-white/10 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-sky-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#aebbd4] mb-1.5">
                Contraseña de Acceso
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl bg-[#16203a]/70 border border-white/10 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-sky-500 transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-4 rounded-xl font-semibold text-sm bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white shadow-lg shadow-sky-500/25 transition-all transform active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
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
          <div className="mt-6 pt-5 border-t border-white/10 text-xs text-slate-400">
            <div className="flex items-center justify-between text-[11px] mb-2 font-mono text-slate-400">
              <span>Credenciales de demostración B2G:</span>
              <button
                type="button"
                onClick={() => {
                  setIdentifier('admin@sincro.co');
                  setPassword('admin123');
                }}
                className="text-sky-400 hover:underline cursor-pointer"
              >
                Autocompletar
              </button>
            </div>
            <div className="bg-[#16203a]/50 p-2.5 rounded-lg font-mono text-[11px] text-slate-300 space-y-0.5 border border-white/5">
              <div>Usuario: <span className="text-white font-semibold">admin@sincro.co</span></div>
              <div>Clave: <span className="text-white font-semibold">admin123</span></div>
            </div>
          </div>
        </div>

        {/* Footer institucional */}
        <div className="mt-8 text-center text-xs text-slate-500">
          <p>Alcaldía Mayor de Cartagena de Indias · DADIS · CRUED</p>
          <p className="mt-1">Tecnología de Despacho y Regulación Asistida SINCRO</p>
        </div>
      </div>
    </div>
  );
}
