import type { Metadata } from 'next';
import { CommandCenterNav } from '@/src/components/command-center/CommandCenterNav';

export const metadata: Metadata = {
  title: 'Centro de Mando Distrital · SINCRO B2G',
  description: 'Consola de regulación médica y monitoreo de emergencias para CRUED y DADIS Cartagena.',
};

export default function CommandCenterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#070b14] text-[#f5f8ff] flex flex-col font-sans selection:bg-sky-500/30">
      <CommandCenterNav />
      <main className="flex-1 flex flex-col overflow-hidden">{children}</main>
    </div>
  );
}
