import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { orderId, customerPhone, customerEmail, customerName, newStatus, orderType, pickupTime } = body;

    // Logico di invio notifica al cliente al cambio di stato
    console.log(`[NOTIFICA] Ordine #${orderId} per ${customerName} cambiato in stato: ${newStatus}`);

    // Qui si collegherà l'API Twilio (WhatsApp) o Resend (Email)
    // Esempio: invio WhatsApp via Twilio o Email via Resend

    return NextResponse.json({ success: true, message: 'Notifica presa in carico' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}