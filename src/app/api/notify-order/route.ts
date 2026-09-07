import { NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const SENDER_EMAIL = 'NOM SUSHI VIBES <onboarding@resend.dev>';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { 
      orderId, 
      customerEmail, 
      customerName, 
      newStatus, 
      type, 
      restaurantName, 
      totalAmount,
      pickupTime,
      orderType,
      items, 
      guests 
    } = body;

    if (!customerEmail) {
      return NextResponse.json({ success: true, message: 'Email cliente non presente, invio saltato.' });
    }

    let subject = '';
    let htmlContent = '';

    // --- 1. GESTIONE ORDINE (Asporto / Delivery) ---
    if (type === 'order') {
      const formattedItemsHtml = items && Array.isArray(items) && items.length > 0
        ? items.map((it: any) => {
            const name = it.name || it.product?.name || 'Prodotto';
            const quantity = it.quantity || 1;
            const price = Number(it.price || it.product?.price || 0);
            const note = it.itemNote || it.note || '';

            return `
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #eee;">
                  ${quantity}x ${name} 
                  ${note ? `<br><small style="color: #666;">Note: ${note}</small>` : ''}
                </td>
                <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">
                  €${(price * quantity).toFixed(2)}
                </td>
              </tr>
            `;
          }).join('')
        : '<tr><td colspan="2" style="padding: 8px; color: #666;">Dettagli prodotti non disponibili</td></tr>';

      if (newStatus === 'pending') {
        subject = `Conferma Ricezione Ordine - ${restaurantName || 'NOM SUSHI VIBES'}`;
        htmlContent = `
          <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #d97706; margin-top: 0;">Grazie per il tuo ordine, ${customerName}!</h2>
            <p>Abbiamo ricevuto correttamente il tuo ordine in modalità <strong>${orderType === 'delivery' ? 'Consegna a domicilio' : 'Ritiro in sede'}</strong>.</p>
            <p><strong>Orario previsto:</strong> ${pickupTime}</p>
            
            <h3 style="border-bottom: 2px solid #d97706; padding-bottom: 5px; margin-top: 20px;">Riepilogo Ordine</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              ${formattedItemsHtml}
            </table>
            
            <p style="text-align: right; font-size: 16px; margin-top: 15px;"><strong>Totale: €${Number(totalAmount || 0).toFixed(2)}</strong></p>
            <p style="color: #666; font-size: 12px; margin-top: 30px; text-align: center;">Ti invieremo un'altra email non appena il ristorante confermerà la preparazione.</p>
          </div>
        `;
      } else if (newStatus === 'confirmed') {
        subject = `Ordine Confermato! - ${restaurantName || 'NOM SUSHI VIBES'}`;
        htmlContent = `
          <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #059669; margin-top: 0;">Il tuo ordine è stato confermato!</h2>
            <p>Ciao <strong>${customerName}</strong>, il ristorante ha accettato il tuo ordine e ha iniziato a prepararlo.</p>
            <p><strong>Orario:</strong> ${pickupTime}</p>
            <p style="color: #666; font-size: 12px; margin-top: 30px; text-align: center;">Ti aspettiamo!</p>
          </div>
        `;
      }
    } 
    
    // --- 2. GESTIONE PRENOTAZIONE TAVOLO ---
    else if (type === 'reservation') {
      if (newStatus === 'pending') {
        subject = `Conferma Richiesta Prenotazione Tavolo - ${restaurantName || 'NOM SUSHI VIBES'}`;
        htmlContent = `
          <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #d97706; margin-top: 0;">Richiesta Prenotazione Ricevuta, ${customerName}!</h2>
            <p>Abbiamo registrato la tua richiesta di prenotazione con i seguenti dati:</p>
            <ul style="line-height: 1.6;">
              <li><strong>Data e Ora:</strong> ${pickupTime}</li>
              <li><strong>Numero Coperti:</strong> ${guests || 1} persone</li>
            </ul>
            <p style="color: #666; font-size: 12px; margin-top: 30px; text-align: center;">Il ristorante verificherà la disponibilità e ti contatterà per la conferma definitiva.</p>
          </div>
        `;
      }
    }

    if (!htmlContent) {
      return NextResponse.json({ success: true, message: 'Nessuna azione email richiesta per questo stato.' });
    }

    const data = await resend.emails.send({
      from: SENDER_EMAIL,
      to: [customerEmail],
      subject: subject,
      html: htmlContent,
    });

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('Errore invio email Resend:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}