'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { AlertCircle, Loader2, MailCheck } from 'lucide-react';
import { createBrowserClient } from '@/lib/supabase/browser-client';

type Status = 'idle' | 'sending' | 'sent' | 'verifying' | 'error';

// Supabase manda códigos de 6 dígitos por defecto, pero el largo es
// configurable por proyecto (hasta 10). Se acepta el rango entero para que
// cambiar ese ajuste en el dashboard no rompa el login.
const CODIGO_VALIDO = /^\d{6,10}$/;

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [codigo, setCodigo] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [linkExpired, setLinkExpired] = useState(false);

  // El callback devuelve acá con ?error=link cuando el enlace ya se usó o
  // venció. Sin este aviso, el dueño vuelve a la pantalla de entrada sin
  // entender por qué no pasó nada.
  //
  // Se lee de window y no con useSearchParams a propósito: ese hook obliga
  // a envolver la página en Suspense, y el formulario entero quedaría en
  // blanco hasta que hidrate.
  useEffect(() => {
    setLinkExpired(new URLSearchParams(window.location.search).get('error') === 'link');
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus('sending');
    setErrorMessage(null);

    const supabase = createBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/admin/menu`,
      },
    });

    if (error) {
      // Supabase limita cuántos correos se piden seguidos; decir "revisa el
      // correo" ahí manda a buscar un correo que nunca va a llegar.
      const isRateLimit =
        error.status === 429 || /rate limit|too many|seconds/i.test(error.message);
      setErrorMessage(
        isRateLimit
          ? 'Pediste varios códigos seguidos. Espera un minuto y vuelve a intentar; el último que te llegó sigue sirviendo.'
          : 'No pudimos enviar el correo. Revisa que esté bien escrito e intenta de nuevo.'
      );
      setStatus('error');
      return;
    }

    setStatus('sent');
  };

  // El código existe porque el enlace sólo funciona en el mismo navegador que
  // lo pidió (PKCE). En iPhone la app instalada guarda sus datos aparte de
  // Safari, así que tocar el enlace del correo abre Safari y no encuentra la
  // sesión pendiente: con enlace, entrar a la app instalada era imposible.
  // El código se escribe a mano dentro de la propia app y no depende de qué
  // navegador abra el correo.
  const handleVerify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const token = codigo.replace(/\s/g, '');
    if (!CODIGO_VALIDO.test(token)) {
      setErrorMessage('El código son solo números. Revísalo en el correo.');
      return;
    }

    setStatus('verifying');
    setErrorMessage(null);

    const supabase = createBrowserClient();
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });

    if (error) {
      const isRateLimit =
        error.status === 429 || /rate limit|too many/i.test(error.message);
      setErrorMessage(
        isRateLimit
          ? 'Demasiados intentos. Espera unos minutos antes de probar de nuevo.'
          : 'Ese código no sirve: está mal escrito, ya se usó o venció. Pide uno nuevo si hace falta.'
      );
      setStatus('sent');
      return;
    }

    // Recarga completa y no router.push: el middleware lee la sesión de las
    // cookies en la petición, y una navegación del cliente no las manda de
    // nuevo hasta la siguiente carga.
    window.location.assign('/admin/menu');
  };

  const esperandoCodigo = status === 'sent' || status === 'verifying';

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <p className="font-serif text-xl font-semibold tracking-tight text-cream">
          Ascua
          <span className="ml-2 align-middle text-xs font-normal tracking-normal text-stone">
            panel
          </span>
        </p>

        {esperandoCodigo ? (
          <form onSubmit={handleVerify} className="mt-8 flex flex-col gap-5">
            <div>
              <MailCheck size={28} strokeWidth={1.5} className="text-copper-400" />
              <h1 className="mt-4 font-serif text-xl font-semibold tracking-tight text-cream">
                Revisa tu correo
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-stone">
                Enviamos un código de acceso a <span className="text-cream">{email}</span>.
                Escríbelo aquí para entrar.
              </p>
            </div>

            <div>
              <label htmlFor="codigo" className="label">
                Código
              </label>
              <input
                id="codigo"
                type="text"
                inputMode="numeric"
                // one-time-code hace que iPhone y Android ofrezcan el código
                // en el teclado apenas llega el correo.
                autoComplete="one-time-code"
                autoFocus
                maxLength={12}
                placeholder="123456"
                value={codigo}
                onChange={(event) => setCodigo(event.target.value)}
                className="field text-center font-mono text-lg tracking-[0.4em]"
              />
            </div>

            <button
              type="submit"
              disabled={status === 'verifying' || codigo.replace(/\s/g, '').length < 6}
              className="btn btn-primary w-full"
            >
              {status === 'verifying' ? (
                <>
                  <Loader2 size={15} strokeWidth={2} className="animate-spin" />
                  Entrando
                </>
              ) : (
                'Entrar'
              )}
            </button>

            {errorMessage ? (
              <p className="flex items-start gap-2 text-sm leading-relaxed text-danger">
                <AlertCircle size={15} strokeWidth={2} className="mt-0.5 shrink-0" />
                {errorMessage}
              </p>
            ) : null}

            <p className="text-xs leading-relaxed text-stone">
              Si abres el correo en este mismo teléfono, también puedes tocar el enlace.
            </p>

            <button
              type="button"
              onClick={() => {
                setStatus('idle');
                setCodigo('');
                setErrorMessage(null);
              }}
              className="self-start text-sm text-stone underline-offset-4 transition-colors hover:text-copper-400 hover:underline"
            >
              Usar otro correo
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
            <div>
              <h1 className="font-serif text-xl font-semibold tracking-tight text-cream">
                Entra a tu panel
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-stone">
                Te mandamos un código por correo. Sin contraseñas que recordar.
              </p>
            </div>

            {linkExpired ? (
              <p className="flex items-start gap-2 rounded-xl border border-warn/40 bg-warn-soft px-3 py-2.5 text-sm leading-relaxed text-cream">
                <AlertCircle size={15} strokeWidth={2} className="mt-0.5 shrink-0 text-warn" />
                Ese enlace ya se usó, venció, o se abrió en otro navegador. Pide un código nuevo.
              </p>
            ) : null}

            <div>
              <label htmlFor="email" className="label">
                Correo
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                placeholder="tu@restaurante.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="field"
              />
            </div>

            <button
              type="submit"
              disabled={status === 'sending' || !email.trim()}
              className="btn btn-primary w-full"
            >
              {status === 'sending' ? (
                <>
                  <Loader2 size={15} strokeWidth={2} className="animate-spin" />
                  Enviando
                </>
              ) : (
                'Enviarme el código'
              )}
            </button>

            {status === 'error' && errorMessage ? (
              <p className="flex items-start gap-2 text-sm leading-relaxed text-danger">
                <AlertCircle size={15} strokeWidth={2} className="mt-0.5 shrink-0" />
                {errorMessage}
              </p>
            ) : null}
          </form>
        )}
      </div>
    </main>
  );
}
