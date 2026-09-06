'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';

export function CommandCenterNav() {
  const router = useRouter();
  const pathname = usePathname();
  const [time, setTime] = useState<string>('');
  const [user, setUser] = useState<{ name: string; role: string } | null>(null);

  useEffect(() => {
    // Reloj en tiempo real
    const updateTime = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString('es-CO', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }),
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetch('/api/command-center/auth/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) {
          setUser(data.user);
        }
      })
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    await fetch('/api/command-center/auth/logout', { method: 'POST' });
    router.push('/command-center/login');
  };

  if (pathname === '/command-center/login') {
    return null;
  }

  return (
    <header className="h-16 bg-[#0c1220] border-b border-[#1b263b] px-4 sm:px-6 flex items-center justify-between shrink-0 z-30">
      {/* Izquierda: Logotipo y Entidad */}
      <div className="flex items-center gap-3">
        <Link href="/command-center" className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-sky-600 to-blue-500 flex items-center justify-center font-black text-white text-base tracking-tighter shadow-md shadow-sky-500/20">
            S
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-white tracking-tight text-lg leading-none">
                SINCRO
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/20 border border-sky-400/30 text-sky-300 font-semibold tracking-wide">
                B2G
              </span>
            </div>
            <p className="text-[11px] text-[#7286a5] font-medium leading-tight">
              Centro de Mando Distrital · CRUED / DADIS
            </p>
          </div>
        </Link>
      </div>

      {/* Centro: Indicador de Operación y Reloj */}
      <div className="hidden md:flex items-center gap-6">
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#16203a]/60 border border-white/5 text-xs text-[#aebbd4]">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="font-medium text-emerald-400">TELEMETRÍA ACTIVA</span>
          <span className="text-slate-600">|</span>
          <span>Red Distrital Cartagena</span>
        </div>

        <div className="font-mono text-sm tracking-wider text-slate-300 bg-[#070b14] px-3 py-1 rounded border border-white/5">
          {time || '--:--:--'} <span className="text-[10px] text-slate-500">COT</span>
        </div>
      </div>

      {/* Derecha: Datos del funcionario y Cerrar sesión */}
      <div className="flex items-center gap-3">
        {user ? (
          <div className="text-right hidden sm:block">
            <div className="text-xs font-semibold text-white leading-tight">{user.name}</div>
            <div className="text-[10px] text-sky-400 font-medium">{user.role === 'ADMIN' ? 'Regulador Principal' : 'Despachador CRUED'}</div>
          </div>
        ) : null}

        <button
          onClick={handleLogout}
          title="Cerrar sesión institucional"
          className="p-2 rounded-lg bg-[#16203a] hover:bg-red-500/20 text-[#aebbd4] hover:text-red-300 border border-white/5 transition-all text-xs flex items-center gap-1.5"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          <span className="hidden sm:inline">Salir</span>
        </button>
      </div>
    </header>
  );
}
