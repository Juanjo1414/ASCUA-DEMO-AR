import { NextResponse, type NextRequest } from 'next/server';
import QRCode from 'qrcode';
import sharp from 'sharp';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { createServerSessionClient } from '@/lib/supabase/server-session-client';
import { buildQrTargetUrl } from '@/lib/qr-target-url';
import { isPublicHttpUrl } from '@/lib/ssrf-guard';
import type { Database } from '@menu-ar/db';

type Restaurant = Database['public']['Tables']['restaurants']['Row'];

const QR_SIZE_PX = 1024;
// A6 en puntos (1/72"): 105 x 148 mm.
const A6_WIDTH = 297.6;
const A6_HEIGHT = 419.5;

async function getOwnedRestaurant(): Promise<
  { restaurant: Restaurant } | { errorResponse: NextResponse }
> {
  const supabase = await createServerSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      errorResponse: NextResponse.json(
        { error: 'No autenticado', code: 'API_QR_UNAUTHENTICATED' },
        { status: 401 }
      ),
    };
  }

  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('*')
    .eq('owner_id', user.id)
    .maybeSingle();

  if (!restaurant) {
    return {
      errorResponse: NextResponse.json(
        { error: 'Todavía no creaste tu restaurante', code: 'API_QR_RESTAURANT_NOT_FOUND' },
        { status: 404 }
      ),
    };
  }

  return { restaurant };
}

// Sección 6 del plan: descargable en PNG 1024px, SVG y PDF A6 listo para
// imprimir, apuntando a /r/{short_id} con el logo del restaurante al
// centro. GET /api/qr?format=png|svg|pdf (default png).
export async function GET(request: NextRequest) {
  const result = await getOwnedRestaurant();
  if ('errorResponse' in result) return result.errorResponse;
  const { restaurant } = result;

  const format = request.nextUrl.searchParams.get('format') ?? 'png';
  const targetUrl = buildQrTargetUrl(request.url, restaurant.short_id);

  try {
    if (format === 'svg') {
      const svg = await QRCode.toString(targetUrl, {
        type: 'svg',
        errorCorrectionLevel: 'H',
        margin: 2,
      });
      return new NextResponse(svg, {
        headers: {
          'Content-Type': 'image/svg+xml',
          'Content-Disposition': `attachment; filename="qr-${restaurant.slug}.svg"`,
        },
      });
    }

    const pngBuffer = await buildQrPng(targetUrl, restaurant.logo_url);

    // `as BodyInit` en los dos returns de abajo: con TS 5.9 + @types/node
    // actuales, Buffer/Uint8Array quedan tipados sobre ArrayBufferLike
    // (incluye SharedArrayBuffer) mientras que lib.dom.d.ts espera
    // ArrayBufferView<ArrayBuffer> — un desfase real entre paquetes de
    // tipos, no un problema en runtime (Node acepta Buffer como body sin
    // problema; NextResponse ya envía binarios así en todo el proyecto).
    if (format === 'pdf') {
      const pdfBytes = await buildPrintablePdf(pngBuffer, restaurant.name);
      return new NextResponse(pdfBytes as BodyInit, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="qr-${restaurant.slug}.pdf"`,
        },
      });
    }

    return new NextResponse(pngBuffer as BodyInit, {
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `attachment; filename="qr-${restaurant.slug}.png"`,
      },
    });
  } catch (error) {
    console.error('[API_QR_GENERATION_FAILED]', error);
    return NextResponse.json(
      { error: 'No se pudo generar el QR', code: 'API_QR_GENERATION_FAILED' },
      { status: 500 }
    );
  }
}

async function buildQrPng(targetUrl: string, logoUrl: string | null): Promise<Buffer> {
  const qrBuffer = await QRCode.toBuffer(targetUrl, {
    type: 'png',
    errorCorrectionLevel: 'H', // el logo tapa el centro; H es lo que permite eso sin romper el código
    width: QR_SIZE_PX,
    margin: 2,
  });

  if (!logoUrl) return qrBuffer;

  // CN-005: logo_url ya tiene un CHECK de esquema en DB
  // (restaurants_logo_url_scheme), pero eso no evita que el host resuelva
  // a una dirección interna. No confiar solo en esa capa antes de un
  // fetch server-side.
  if (!(await isPublicHttpUrl(logoUrl))) {
    console.error('[API_QR_LOGO_BLOCKED_URL]', logoUrl);
    return qrBuffer;
  }

  try {
    const logoResponse = await fetch(logoUrl);
    if (!logoResponse.ok) return qrBuffer;
    const logoRaw = Buffer.from(await logoResponse.arrayBuffer());

    const logoSize = Math.round(QR_SIZE_PX * 0.22);
    const padding = Math.round(logoSize * 0.12);

    const logoWithWhitePadding = await sharp({
      create: {
        width: logoSize + padding * 2,
        height: logoSize + padding * 2,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .composite([
        { input: await sharp(logoRaw).resize(logoSize, logoSize, { fit: 'contain' }).toBuffer() },
      ])
      .png()
      .toBuffer();

    return await sharp(qrBuffer)
      .composite([{ input: logoWithWhitePadding, gravity: 'center' }])
      .png()
      .toBuffer();
  } catch (error) {
    // El QR sin logo sigue siendo válido y escaneable — mejor eso que
    // hacer fallar toda la descarga por una foto de logo rota.
    console.error('[API_QR_LOGO_COMPOSITE_FAILED]', error);
    return qrBuffer;
  }
}

async function buildPrintablePdf(qrPngBuffer: Buffer, restaurantName: string): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([A6_WIDTH, A6_HEIGHT]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const qrImage = await pdfDoc.embedPng(qrPngBuffer);
  const qrDisplaySize = 220; // ~7.8 cm de lado — bien arriba del mínimo de 3x3 cm del plan
  const qrX = (A6_WIDTH - qrDisplaySize) / 2;
  const qrY = A6_HEIGHT - qrDisplaySize - 90;

  page.drawText(restaurantName, {
    x: 20,
    y: A6_HEIGHT - 50,
    size: 16,
    font: boldFont,
    color: rgb(0, 0, 0),
  });

  page.drawImage(qrImage, { x: qrX, y: qrY, width: qrDisplaySize, height: qrDisplaySize });

  page.drawText('Escaneá para ver los platos en 3D', {
    x: 20,
    y: qrY - 30,
    size: 12,
    font,
    color: rgb(0, 0, 0),
  });

  const instructionLines = [
    'Instrucciones de impresión:',
    'Tamaño mínimo 3x3 cm.',
    'Dejar margen blanco alrededor del código.',
    'Usar un fondo que contraste (no imprimir sobre una foto).',
  ];
  instructionLines.forEach((line, index) => {
    page.drawText(line, {
      x: 20,
      y: 70 - index * 12,
      size: 8,
      font,
      color: rgb(0.35, 0.35, 0.35),
    });
  });

  return pdfDoc.save();
}
