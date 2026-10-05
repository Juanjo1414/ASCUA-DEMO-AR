export default function TerminosPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 text-black/80">
      <h1 className="mb-2 text-3xl font-bold text-black">Términos y Condiciones</h1>
      <p className="mb-8 text-sm text-black/50">Versión 1 — última actualización: agosto de 2026.</p>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold text-black">1. Qué es este servicio</h2>
        <p>
          Esta plataforma permite a cualquier restaurante publicar su carta en una página web
          propia, accesible escaneando un código QR en la mesa, con la opción de ver algunos
          platos en 3D y en realidad aumentada (AR) sobre la mesa real. El comensal usa el menú
          público sin crear cuenta, sin iniciar sesión y sin que se le pidan datos personales. El
          restaurante sí crea una cuenta para administrar su menú, sus fotos y su código QR desde
          el panel privado.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold text-black">2. Registro y cuenta del restaurante</h2>
        <p>
          El restaurante se registra con nombre, correo y tipo de cocina, y accede mediante un
          enlace mágico enviado a ese correo (sin contraseña). Es responsable de mantener ese
          correo bajo su control y de toda la actividad realizada desde su cuenta.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold text-black">3. Contenido que sube el restaurante</h2>
        <p>
          El restaurante garantiza que es titular de los derechos sobre los nombres, descripciones,
          precios y fotografías de los platos que carga, o que cuenta con autorización para
          usarlos. Nos concede una licencia no exclusiva para almacenar, procesar y mostrar ese
          contenido —incluyendo generar a partir de las fotos un modelo 3D del plato— únicamente
          para operar el servicio. El restaurante es responsable de que el menú publicado
          corresponda a lo que efectivamente se sirve y de mantener precios y disponibilidad
          actualizados.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold text-black">4. Los modelos 3D son referenciales</h2>
        <p>
          Cada modelo 3D se genera automáticamente a partir de una fotografía y se muestra a
          escala real sobre la mesa, pero es una representación aproximada del plato, no una
          fotografía exacta. Por eso el visor siempre incluye el aviso &quot;Modelo referencial. La
          presentación puede variar.&quot; El restaurante es responsable de aprobar cada modelo antes
          de publicarlo y de que no genere una impresión engañosa sobre el tamaño o contenido real
          del plato servido.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold text-black">5. Propiedad de los archivos generados</h2>
        <p>
          Los archivos 3D (.glb, .usdz) se generan con herramientas de terceros a partir de la
          fotografía del restaurante; su titularidad de derecho de autor puede ser incierta según
          la legislación vigente sobre obras generadas por sistemas automáticos. Mientras la cuenta
          esté activa, el restaurante tiene licencia de uso de esos archivos dentro de esta
          plataforma. Si el restaurante da de baja su cuenta, puede solicitar una copia de sus
          archivos antes de que se eliminen.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold text-black">6. Uso aceptable</h2>
        <p>
          No está permitido usar el servicio para publicar contenido ilegal, engañoso o que
          infrinja derechos de terceros, ni intentar vulnerar la seguridad de la plataforma o
          acceder a cuentas de otros restaurantes.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold text-black">7. Disponibilidad y cambios</h2>
        <p>
          El servicio se ofrece &quot;tal cual&quot;, sin garantía de disponibilidad ininterrumpida.
          Podemos actualizar estos Términos; si el cambio es significativo, se lo notificaremos al
          restaurante y le pediremos aceptarlo de nuevo la próxima vez que inicie sesión.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold text-black">8. Terminación</h2>
        <p>
          El restaurante puede dejar de usar el servicio en cualquier momento y solicitar la
          eliminación de su cuenta y su contenido. Podemos suspender cuentas que incumplan estos
          Términos.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold text-black">9. Ley aplicable</h2>
        <p>Estos Términos se rigen por las leyes de la República de Colombia.</p>
      </section>

      <p className="mt-10 rounded-lg bg-black/5 p-4 text-sm text-black/60">
        Este documento es un borrador de referencia, no asesoría legal. Antes de operar
        comercialmente con restaurantes reales, hay que hacerlo revisar por un abogado.
      </p>
    </main>
  );
}
