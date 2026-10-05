export default function LicenciasPage() {
  return (
    <main className="max-w-3xl mx-auto py-12 px-4">
      <h1 className="text-3xl font-bold mb-6">Licencias y Créditos</h1>
      <p className="text-gray-600 mb-4">
        Esta aplicación utiliza componentes y software de código abierto.
      </p>
      <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700">
        <li>Next.js - Licencia MIT</li>
        <li>React - Licencia MIT</li>
        <li>Tailwind CSS - Licencia MIT</li>
        <li>@google/model-viewer - Licencia Apache 2.0</li>
        <li>Supabase JS Client - Licencia MIT</li>
      </ul>
    </main>
  );
}
