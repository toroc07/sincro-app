import type { Metadata } from 'next';
import { LoginClient } from './LoginClient';

export const metadata: Metadata = {
  title: 'Ingresa · SINCRO',
  description: 'Regístrate para reportar una emergencia.',
};

export default function LoginPage() {
  return <LoginClient />;
}
