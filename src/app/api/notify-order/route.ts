import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';

const resend = new Resend(process.env.RESEND_API_KEY);
const SENDER_EMAIL = 'NOM SUSHI VIBES <ordini@nomsushi.shop>';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    let { 
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
      guests,
      party_size
    } = body;

    let numGuests = party_size || guests || 1;

    if (!customerEmail || !customerEmail.trim()) {
      return NextResponse.json({ success: true, message: 'Email cliente non presente, invio saltato.' });
    }

    // Controllo preventivo corretto per evitare loop o invii ripetuti dello stesso identico stato
    if (orderId) {
      const tableName = type === 'order' ? 'orders' : 'reservations';
      const { data: currentRecord } = await supabase
        .from(tableName)
        .select('*')
        .eq('id', orderId)
        .maybeSingle();

      if (currentRecord) {
        // Blocca l'invio solo se stiamo notificando lo stesso stato già registrato E l'email risulta già inviata
        if (currentRecord.status === newStatus && currentRecord.email_sent) {
          return NextResponse.json({ success: true, message: 'Email per questo stato già inviata in precedenza.' });
        }

        if (type === 'order') {
          items = currentRecord.items || items || [];
          totalAmount = currentRecord.total_amount ?? totalAmount;
          pickupTime = currentRecord.pickup_time || pickupTime;
          orderType = currentRecord.order_type || orderType;
          customerName = currentRecord.customer_name || customerName;
          customerEmail = currentRecord.customer_email || customerEmail;
        } else if (type === 'reservation') {
          numGuests = currentRecord.party_size || currentRecord.guests || numGuests;
          pickupTime = currentRecord.reservation_time || pickupTime;
          customerName = currentRecord.customer_name || customerName;
          customerEmail = currentRecord.customer_email || customerEmail;
        }
      }
    }

    let subject = '';
    let htmlContent = '';

    if (type === 'order') {
      const formattedItemsHtml = Array.isArray(items) && items.length > 0
        ? items.map((it: any) => {
            const name = it.name || it.product_name || it.product?.name || 'Prodotto';
            const quantity = Number(it.quantity || it.qty || 1);
            const price = Number(it.price || it.product?.price || 0);
            const note = it.itemNote || it.note || '';

            return `
              <tr>
                <td style="padding: 10px 8px; border-bottom: 1px solid #eee; color: #333;">
                  <strong>${quantity}x</strong> ${name}
                  ${note ? `<br><small style="color: #666; font-style: italic;">Note: ${note}</small>` : ''}
                </td>
                <td style="padding: 10px 8px; border-bottom: 1px solid #eee; text-align: right; color: #333; font-family: monospace;">
                  €${(price * quantity).toFixed(2)}
                </td>
              </tr>
            `;
          }).join('')
        : '<tr><td colspan="2" style="padding: 12px; color: #666; text-align: center;">Nessun dettaglio prodotto disponibile</td></tr>';

      if (newStatus === 'pending') {
        subject = `Conferma Ricezione Ordine - ${restaurantName || 'NOM SUSHI VIBES'}`;
        htmlContent = `
          <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
            <h2 style="color: #d97706; margin-top: 0;">Grazie per il tuo ordine, ${customerName}!</h2>
            <p>Abbiamo ricevuto correttamente il tuo ordine in modalità <strong>${orderType === 'delivery' ? 'Consegna a domicilio' : 'Ritiro in sede'}</strong>.</p>
            <p><strong>Orario previsto:</strong> ${pickupTime}</p>
            
            <h3 style="border-bottom: 2px solid #d97706; padding-bottom: 5px; margin-top: 25px; font-size: 16px;">Riepilogo Ordine</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <thead>
                <tr style="background-color: #f8fafc; text-align: left;">
                  <th style="padding: 8px; border-bottom: 2px solid #e2e8f0;">Prodotto</th>
                  <th style="padding: 8px; border-bottom: 2px solid #e2e8f0; text-align: right;">Totale</th>
                </tr>
              </thead>
              <tbody>
                ${formattedItemsHtml}
              </tbody>
            </table>
            
            <p style="text-align: right; font-size: 16px; margin-top: 20px;"><strong>Totale Complessivo: €${Number(totalAmount || 0).toFixed(2)}</strong></p>
            <p style="color: #666; font-size: 12px; margin-top: 30px; text-align: center; border-top: 1px solid #eee;">Ti invieremo un'altra email non appena il ristorante confermerà la preparazione.</p>
          </div>
        `;
      } else if (newStatus === 'confirmed') {
        subject = `Ordine Confermato! - ${restaurantName || 'NOM SUSHI VIBES'}`;
        htmlContent = `
          <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
            <h2 style="color: #059669; margin-top: 0;">Il tuo ordine è stato confermato!</h2>
            <p>Ciao <strong>${customerName}</strong>, il ristorante ha accettato il tuo ordine e ha iniziato a prepararlo.</p>
            <p><strong>Orario di ritiro/consegna:</strong> ${pickupTime}</p>
            <p style="color: #666; font-size: 12px; margin-top: 30px; text-align: center;">Ti aspettiamo!</p>
          </div>
        `;
      }
    } 
    else if (type === 'reservation') {
      if (newStatus === 'pending') {
        subject = `Conferma Richiesta Prenotazione Tavolo - ${restaurantName || 'NOM SUSHI VIBES'}`;
        htmlContent = `
          <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
            <h2 style="color: #d97706; margin-top: 0;">Richiesta Prenotazione Ricevuta, ${customerName}!</h2>
            <p>Abbiamo registrato la tua richiesta di prenotazione con i seguenti dati:</p>
            <ul style="line-height: 1.6;">
              <li><strong>Data e Ora:</strong> ${pickupTime}</li>
              <li><strong>Numero Coperti:</strong> ${numGuests} persone</li>
            </ul>
            <p style="color: #666; font-size: 12px; margin-top: 30px; text-align: center;">Il ristorante verificherà la disponibilità e ti invierà una conferma definitiva.</p>
          </div>
        `;
      } else if (newStatus === 'confirmed') {
        subject = `Prenotazione Tavolo Confermata! - ${restaurantName || 'NOM SUSHI VIBES'}`;
        htmlContent = `
          <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
            <h2 style="color: #059669; margin-top: 0;">La tua prenotazione è confermata!</h2>
            <p>Ciao <strong>${customerName}</strong>, il ristorante ha accettato la tua prenotazione per <strong>${numGuests} persone</strong>.</p>
            <p><strong>Data e Ora:</strong> ${pickupTime}</p>
            <p style="color: #666; font-size: 12px; margin-top: 30px; text-align: center;">Ti aspettiamo!</p>
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

    // Impostiamo il flag email_sent su true una volta spedita con successo la notifica
    if (orderId) {
      const tableName = type === 'order' ? 'orders' : 'reservations';
      await supabase
        .from(tableName)
        .update({ email_sent: true })
        .eq('id', orderId);
    }

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('Errore invio email Resend:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
