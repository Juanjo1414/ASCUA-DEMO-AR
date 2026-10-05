'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { CUISINE_TYPES, MENU_TEMPLATES, type CuisineType } from '@/lib/menu-templates';
import { logError } from '@/lib/errors';

type Status = 'idle' | 'submitting' | 'done' | 'error';

export function RegistroForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [cuisine, setCuisine] = useState<CuisineType>(CUISINE_TYPES[0]);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus('submitting');
    setErrorMessage(null);

    const response = await fetch('/api/registro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, cuisine, termsAccepted }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      logError('REGISTRO_SUBMIT_FAILED', body ?? `HTTP ${response.status}`);
      setErrorMessage(
        response.status === 409
          ? 'Ya existe una cuenta con ese correo. Iniciá sesión desde /admin/login.'
          : 'No se pudo completar el registro. Probá de nuevo.'
      );
      setStatus('error');
      return;
    }

    setStatus('done');
  };

  if (status === 'done') {
    return (
      <div className="flex max-w-md flex-col gap-3">
        <h1 className="text-xl font-bold">Revisá tu correo</h1>
        <p className="text-sm text-black/70">
          Te mandamos un link para entrar a <strong>{email}</strong>. Desde ahí armás tu menú y
          publicás tu restaurante.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-md flex-col gap-4">
      <h1 className="text-xl font-bold">Registrá tu restaurante</h1>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Nombre del restaurante
        <input
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="rounded-lg border border-black/20 px-4 py-2 font-normal"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Correo
        <input
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="rounded-lg border border-black/20 px-4 py-2 font-normal"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Tipo de cocina
        <select
          value={cuisine}
          onChange={(event) => setCuisine(event.target.value as CuisineType)}
          className="rounded-lg border border-black/20 px-4 py-2 font-normal"
        >
          {CUISINE_TYPES.map((type) => (
            <option key={type} value={type}>
              {MENU_TEMPLATES[type].label}
            </option>
          ))}
        </select>
        <span className="text-xs font-normal text-black/50">
          Arrancás con categorías y platos de ejemplo para esa cocina — los editás todos después.
        </span>
      </label>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          required
          checked={termsAccepted}
          onChange={(event) => setTermsAccepted(event.target.checked)}
          className="mt-1"
        />
        Acepto los{' '}
        <Link href="/terminos" className="underline">
          Términos y Condiciones
        </Link>{' '}
        y la{' '}
        <Link href="/privacidad" className="underline">
          Política de Privacidad
        </Link>
        .
      </label>

      <button
        type="submit"
        disabled={status === 'submitting'}
        className="rounded-lg bg-black px-4 py-3 text-white disabled:opacity-50"
      >
        {status === 'submitting' ? 'Registrando...' : 'Crear mi restaurante'}
      </button>

      {status === 'error' && errorMessage ? (
        <p className="text-sm text-red-600">{errorMessage}</p>
      ) : null}
    </form>
  );
}
