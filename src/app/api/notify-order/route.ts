import { NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { 
      orderId, 
      customerPhone, 
      customerEmail, 
      customerName, 
      newStatus, 
      orderType, 
      pickupTime, 
      type, 
      restaurantName, 
      totalAmount 
    } = body;

    const restName = restaurantName || 'Il Ristorante';

    // 1. GESTIONE PRENOTAZIONI: Richiede solo l'email
    if (type === 'reservation') {
      if (newStatus === 'confirmed' && customerEmail) {
        try {
          await resend.emails.send({
            from: `${restName} <onboarding@resend.dev>`,
            to: customerEmail,
            subject: `Conferma Prenotazione - ${restName}`,
            html: `
              <div style="font-family: Arial, sans-serif; color: #333; padding: 20px;">
                <h2 style="color: #d97706;">Prenotazione Confermata!</h2>
                <p>Gentile <strong>${customerName}</strong>,</p>
                <p>Siamo lieti di confermare la tua prenotazione presso <strong>${restName}</strong>.</p>
                <p>Ti aspettiamo!</p>
              </div>
            `,
          });
          console.log(`[RESEND EMAIL] Conferma prenotazione inviata a: ${customerEmail}`);
        } catch (emailError) {
          console.error('Errore invio email prenotazione:', emailError);
        }
      }
      return NextResponse.json({ success: true, message: 'Notifica prenotazione elaborata.' });
    }

    // 2. GESTIONE ASPORTO / DELIVERY: Richiede sia telefono che email obbligatori
    if (type === 'order' && newStatus === 'confirmed') {
      if (!customerEmail || !customerPhone) {
        return NextResponse.json({ 
          success: false, 
          message: 'Impossibile inviare l\'email: mancano il numero di telefono o l\'indirizzo email del cliente.' 
        }, { status: 400 });
      }

      try {
        await resend.emails.send({
          from: `${restName} <onboarding@resend.dev>`,
          to: customerEmail,
          subject: `Conferma Ordine (${orderType === 'delivery' ? 'Consegna' : 'Ritiro'}) - ${restName}`,
          html: `
            <div style="font-family: Arial, sans-serif; color: #333; padding: 20px;">
              <h2 style="color: #d97706;">Ordine Confermato!</h2>
              <p>Ciao <strong>${customerName}</strong>, il tuo ordine è stato confermato dal ristorante.</p>
              <p><strong>Dettagli dell'ordine:</strong></p>
              <ul>
                <li>Tipologia: ${orderType === 'delivery' ? 'Consegna a domicilio' : 'Ritiro in sede'}</li>
                <li>Orario previsto: ${pickupTime || 'N/D'}</li>
                <li>Telefono di riferimento: ${customerPhone}</li>
                <li>Totale: EUR ${totalAmount || '0.00'}</li>
              </ul>
              <p>Grazie per aver scelto ${restName}!</p>
            </div>
          `,
        });
        console.log(`[RESEND EMAIL] Riepilogo asporto inviato a: ${customerEmail}`);
      } catch (emailError) {
        console.error('Errore invio email asporto:', emailError);
      }
    }

    return NextResponse.json({ success: true, message: 'Notifica ordine elaborata con successo.' });
  } catch (error: any) {
    console.error('Errore generale API notifiche:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}