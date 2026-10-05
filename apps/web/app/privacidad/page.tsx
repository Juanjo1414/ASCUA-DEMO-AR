export default function PrivacidadPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 text-black/80">
      <h1 className="mb-2 text-3xl font-bold text-black">Política de Privacidad</h1>
      <p className="mb-8 text-sm text-black/50">Versión 1 — última actualización: agosto de 2026.</p>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold text-black">1. El comensal no entrega datos</h2>
        <p>
          Ver el menú de un restaurante escaneando el QR no requiere crear cuenta, iniciar sesión
          ni entregar correo, teléfono o ningún otro dato personal. La página del menú no usa
          cookies ni identificadores de seguimiento: solo se registran conteos agregados y
          anónimos de visitas (por ejemplo, cuántas veces se abrió el menú), sin asociarlos a
          ninguna persona identificable.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold text-black">2. Datos del restaurante</h2>
        <p>Al registrar su cuenta, al restaurante le pedimos:</p>
        <ul className="mt-2 list-disc space-y-1 pl-6">
          <li>Nombre del restaurante y tipo de cocina.</li>
          <li>Correo electrónico, usado para el enlace de acceso (login) y comunicaciones del servicio.</li>
          <li>Las fotos, nombres, descripciones y precios de sus platos.</li>
        </ul>
        <p className="mt-2">
          Estos datos se usan únicamente para operar el servicio: autenticar al restaurante,
          generar sus modelos 3D, publicar su menú y su código QR, y contactarlo por temas
          operativos de su cuenta.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold text-black">3. Dónde se almacenan los datos</h2>
        <p>
          Los datos se almacenan y procesan con proveedores externos ubicados fuera de Colombia
          (transferencia internacional de datos), bajo sus propios acuerdos de tratamiento de
          datos. El detalle de cada proveedor está en{' '}
          <a href="/subprocesadores" className="underline">
            /subprocesadores
          </a>
          .
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold text-black">4. Derechos del restaurante (Ley 1581 de 2012)</h2>
        <p>
          Como titular de sus datos personales, el dueño del restaurante puede en cualquier
          momento conocer, actualizar, rectificar o solicitar la eliminación de sus datos, y
          revocar la autorización dada para tratarlos, escribiéndonos al correo de contacto
          indicado en su panel. Atendemos estas solicitudes en un plazo razonable conforme a la
          ley colombiana.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold text-black">5. Seguridad</h2>
        <p>
          El acceso al panel del restaurante requiere autenticación por enlace mágico y está
          protegido por reglas de seguridad a nivel de base de datos (row-level security): un
          restaurante nunca puede ver ni modificar el menú de otro.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold text-black">6. Cambios a esta política</h2>
        <p>
          Si actualizamos esta política de forma significativa, lo notificaremos al restaurante y
          le pediremos aceptarla de nuevo antes de seguir usando el panel.
        </p>
      </section>

      <p className="mt-10 rounded-lg bg-black/5 p-4 text-sm text-black/60">
        Este documento es un borrador de referencia, no asesoría legal. Antes de operar
        comercialmente con restaurantes reales, hay que hacerlo revisar por un abogado.
      </p>
    </main>
  );
}
