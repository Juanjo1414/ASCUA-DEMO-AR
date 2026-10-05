const SUBPROCESSORS = [
  {
    name: 'Supabase',
    purpose: 'Base de datos, autenticación (enlace mágico) y almacenamiento de fotos y modelos 3D.',
    location: 'AWS, región configurable — datos de este proyecto fuera de Colombia.',
  },
  {
    name: 'Vercel',
    purpose: 'Hosting y entrega de la página web pública y del panel del restaurante.',
    location: 'Estados Unidos / red global (CDN).',
  },
  {
    name: 'Hugging Face',
    purpose:
      'Generación del modelo 3D a partir de la foto del plato (Space público de TripoSR). La foto se envía a este servicio solo durante la generación; no queda almacenada allí de forma permanente.',
    location: 'Estados Unidos / Unión Europea, según el Space.',
  },
];

export default function SubprocesadoresPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 text-black/80">
      <h1 className="mb-2 text-3xl font-bold text-black">Subprocesadores</h1>
      <p className="mb-8 text-sm text-black/50">Versión 1 — última actualización: agosto de 2026.</p>

      <p className="mb-6">
        Para operar el servicio usamos los siguientes proveedores externos, que procesan datos por
        nuestra cuenta y bajo nuestras instrucciones:
      </p>

      <div className="flex flex-col gap-4">
        {SUBPROCESSORS.map((item) => (
          <div key={item.name} className="rounded-lg border border-black/10 p-4">
            <h2 className="font-semibold text-black">{item.name}</h2>
            <p className="mt-1 text-sm">{item.purpose}</p>
            <p className="mt-1 text-xs text-black/50">Ubicación: {item.location}</p>
          </div>
        ))}
      </div>

      <p className="mt-8">
        Ninguno de estos proveedores recibe datos del comensal que escanea el QR: el menú público
        no pide ni recolecta datos personales. Ver{' '}
        <a href="/privacidad" className="underline">
          Política de Privacidad
        </a>
        .
      </p>
    </main>
  );
}
