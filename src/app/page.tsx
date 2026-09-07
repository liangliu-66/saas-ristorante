'use client';

import { useEffect, useState, Suspense } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useSearchParams } from 'next/navigation';

function PublicPageContent() {
  const searchParams = useSearchParams();
  const initialAction = searchParams.get('action');

  const [restaurant, setRestaurant] = useState<any>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [promotions, setPromotions] = useState<any[]>([]);
  const [discountRules, setDiscountRules] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'order' | 'reserve'>(
    initialAction === 'reserve' ? 'reserve' : 'order'
  );

  // Stato Carrello & Form Ordine
  const [cart, setCart] = useState<Record<string, { product: any; quantity: number; note: string }>>({});
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [orderType, setOrderType] = useState<'takeaway' | 'delivery'>('takeaway');
  
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  const [orderDate, setOrderDate] = useState(todayStr);
  const [pickupTime, setPickupTime] = useState('');
  const [generalNotes, setGeneralNotes] = useState('');

  // Stato Prenotazione Tavolo
  const [resEmail, setResEmail] = useState('');
  const [resDate, setResDate] = useState(todayStr);
  const [resTime, setResTime] = useState('');
  const [resGuests, setResGuests] = useState(2);
  const [resNotes, setResNotes] = useState('');

  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedReceipt, setSubmittedReceipt] = useState<any>(null);
  const [currentSlide, setCurrentSlide] = useState(0);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      try {
        const [restRes, prodRes, promoRes, discRes] = await Promise.allSettled([
          supabase.from('restaurants').select('*').limit(1).maybeSingle(),
          supabase.from('products').select('*'),
          supabase.from('promotions').select('*'),
          supabase.from('discount_rules').select('*')
        ]);

        if (!isMounted) return;

        let restData = null;
        if (restRes.status === 'fulfilled' && restRes.value.data) {
          restData = restRes.value.data;
          setRestaurant(restData);
          
          if (restData.allow_takeaway === false && restData.allow_delivery === true) {
            setOrderType('delivery');
          }

          // Imposta i default iniziali se esistono slot
          const defaultOrderSlots = restData.order_time_slots;
          if (defaultOrderSlots && Array.isArray(defaultOrderSlots) && defaultOrderSlots.length > 0) {
            setPickupTime(defaultOrderSlots[0]);
          } else {
            setPickupTime('19:30');
          }

          const defaultResSlots = restData.reservation_time_slots;
          if (defaultResSlots && Array.isArray(defaultResSlots) && defaultResSlots.length > 0) {
            setResTime(defaultResSlots[0]);
          } else {
            setResTime('19:00');
          }
        }

        if (prodRes.status === 'fulfilled' && prodRes.value.data) {
          setProducts(prodRes.value.data);
        }

        const catList = restData?.custom_categories || ["Antipasti", "Primi", "Secondi", "Pizza", "Dolci", "Bevande"];
        setCategories(catList);

        if (promoRes.status === 'fulfilled' && promoRes.value.data) {
          setPromotions(promoRes.value.data);
        }

        if (discRes.status === 'fulfilled' && discRes.value.data) {
          const sortedRules = discRes.value.data.sort((a: any, b: any) => Number(b.min_amount) - Number(b.min_amount));
          setDiscountRules(sortedRules);
        }
      } catch (err) {
        console.error('Errore caricamento:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [supabase]);

  useEffect(() => {
    if (promotions.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % promotions.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [promotions.length]);

  const rawTotal = Object.values(cart).reduce((sum, entry) => sum + (entry.product.price * entry.quantity), 0);
  const activeDiscount = discountRules.find((rule) => rawTotal >= Number(rule.min_amount));
  const discountPercent = activeDiscount ? Number(activeDiscount.discount_percentage) : 0;
  const discountAmount = (rawTotal * discountPercent) / 100;
  const finalTotal = rawTotal - discountAmount;

  const addToCart = (product: any) => {
    setCart((prev) => {
      const existing = prev[product.id];
      const newQty = existing ? existing.quantity + 1 : 1;
      return { ...prev, [product.id]: { product, quantity: newQty, note: existing?.note || '' } };
    });
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart((prev) => {
      const existing = prev[productId];
      if (!existing) return prev;
      const newQty = existing.quantity + delta;
      if (newQty <= 0) {
        const copy = { ...prev };
        delete copy[productId];
        return copy;
      }
      return { ...prev, [productId]: { ...existing, quantity: newQty } };
    });
  };

  const updateItemNote = (productId: string, noteText: string) => {
    setCart((prev) => {
      const existing = prev[productId];
      if (!existing) return prev;
      return { ...prev, [productId]: { ...existing, note: noteText } };
    });
  };

  const isValidPhone = (phone: string) => {
    const cleanPhone = phone.replace(/[\s\-\(\)\+]/g, '');
    return /^\d{8,15}$/.test(cleanPhone);
  };

  const handleSendOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (Object.keys(cart).length === 0) { alert('Il carrello è vuoto!'); return; }

    if (!isValidPhone(customerPhone)) return;
    if (!customerEmail) { alert('Inserisci un indirizzo email valido!'); return; }
    if (!pickupTime) { alert('Seleziona un orario valido.'); return; }

    setIsSubmitting(true);

    const formattedItems = Object.values(cart).map((c) => ({
      name: c.product.name,
      quantity: c.quantity,
      price: c.product.price,
      itemNote: c.note ? `Nota: ${c.note}` : undefined,
    }));

    const fullPickupTime = `${orderDate} ${pickupTime}`;
    const orderNotesPayload = generalNotes 
      ? `${generalNotes}${discountPercent > 0 ? ` [Sconto ${discountPercent}% applicato]` : ''}` 
      : (discountPercent > 0 ? `[Sconto ${discountPercent}% applicato]` : '');

    const { data: insertedOrder, error } = await supabase.from('orders').insert({
      restaurant_id: restaurant?.id,
      customer_name: customerName,
      customer_phone: customerPhone,
      customer_email: customerEmail,
      order_type: orderType,
      pickup_time: fullPickupTime,
      items: formattedItems,
      notes: orderNotesPayload,
      total_amount: finalTotal,
      status: 'pending',
    }).select().single();

    setIsSubmitting(false);

    if (!error && insertedOrder) {
      try {
        await fetch('/api/notify-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: insertedOrder.id,
            customerPhone: customerPhone,
            customerEmail: customerEmail,
            customerName: customerName,
            newStatus: 'pending',
            orderType: orderType,
            pickupTime: fullPickupTime,
            type: 'order',
            restaurantName: restaurant?.name,
            totalAmount: finalTotal,
          }),
        });
      } catch (err) {
        console.error('Errore invio email automatica:', err);
      }

      setSubmittedReceipt({
        type: 'order',
        customerName,
        customerPhone,
        customerEmail,
        orderType: orderType === 'takeaway' ? 'Ritiro d\'asporto' : 'Consegna a domicilio',
        pickupTime: fullPickupTime,
        items: formattedItems,
        notes: orderNotesPayload,
        total: finalTotal
      });
      setCart({});
      setGeneralNotes('');
    } else {
      alert(`Errore invio ordine: ${error?.message}`);
    }
  };

  const handleSendReservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerPhone && !resEmail) {
      alert('Inserisci almeno un recapito tra telefono ed email!');
      return;
    }

    if (!resTime) {
      alert('Seleziona un orario valido per la prenotazione.');
      return;
    }

    if (customerPhone && !isValidPhone(customerPhone)) return;

    setIsSubmitting(true);

    const rwgToken = searchParams.get('rwg_token');
    const reservationNotesPayload = `${resNotes || ''}${rwgToken ? ` (Ref: rwg_token)` : ''}`;

    const { data: insertedRes, error } = await supabase.from('reservations').insert({
      restaurant_id: restaurant?.id,
      customer_name: customerName,
      customer_phone: customerPhone || null,
      customer_email: resEmail || null,
      party_size: resGuests,
      reservation_date: resDate,
      reservation_time: resTime,
      notes: reservationNotesPayload,
      status: 'pending',
    }).select().single();

    setIsSubmitting(false);

    if (!error) {
      if (resEmail) {
        try {
          await fetch('/api/notify-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              orderId: insertedRes?.id,
              customerEmail: resEmail,
              customerName: customerName,
              newStatus: 'pending',
              type: 'reservation',
              restaurantName: restaurant?.name,
              pickupTime: `${resDate} alle ${resTime}`,
              guests: resGuests,
            }),
          });
        } catch (err) {
          console.error('Errore invio email prenotazione:', err);
        }
      }

      setSubmittedReceipt({
        type: 'reservation',
        customerName,
        customerPhone,
        customerEmail: resEmail,
        date: resDate,
        time: resTime,
        guests: resGuests,
        notes: resNotes
      });
    } else {
      alert(`Errore invio prenotazione: ${error.message}`);
    }
  };

  const getAvailableTimeSlots = (selectedDate: string) => {
    const customSlots = restaurant?.order_time_slots;
    const slots = (customSlots && Array.isArray(customSlots) && customSlots.length > 0)
      ? customSlots.sort()
      : ["12:00", "12:30", "13:00", "19:30", "20:00", "20:30"];

    if (selectedDate === todayStr) {
      return slots.filter((slot: string) => {
        const [h, m] = slot.split(':').map(Number);
        if (h > currentHour) return true;
        if (h === currentHour && m > currentMinute) return true;
        return false;
      });
    }
    return slots;
  };

  const getAvailableReservationTimeSlots = (selectedDate: string) => {
    const customSlots = restaurant?.reservation_time_slots;
    const slots = (customSlots && Array.isArray(customSlots) && customSlots.length > 0)
      ? customSlots.sort()
      : ["19:00", "19:30", "20:00", "20:30", "21:00"];

    if (selectedDate === todayStr) {
      return slots.filter((slot: string) => {
        const [h, m] = slot.split(':').map(Number);
        if (h > currentHour) return true;
        if (h === currentHour && m > currentMinute) return true;
        return false;
      });
    }
    return slots;
  };

  const timeSlots = getAvailableTimeSlots(orderDate);
  const reservationTimeSlots = getAvailableReservationTimeSlots(resDate);

  // Sincronizza il valore selezionato se lo slot corrente non è più disponibile nel giorno scelto
  useEffect(() => {
    if (timeSlots.length > 0 && !timeSlots.includes(pickupTime)) {
      setPickupTime(timeSlots[0]);
    }
  }, [orderDate, timeSlots, pickupTime]);

  useEffect(() => {
    if (reservationTimeSlots.length > 0 && !reservationTimeSlots.includes(resTime)) {
      setResTime(reservationTimeSlots[0]);
    }
  }, [resDate, reservationTimeSlots, resTime]);

  const allowTakeaway = restaurant?.allow_takeaway ?? true;
  const allowDelivery = restaurant?.allow_delivery ?? true;
  const allowReservations = restaurant?.allow_reservations ?? true;

  if (loading) return <div className="bg-slate-900 min-h-screen text-slate-400 p-8 text-xs">Caricamento...</div>;

  return (
    <div className="min-h-screen bg-slate-900 text-white pb-28">
      <div className="max-w-xl mx-auto p-4 space-y-6">
        
        <header className="text-center space-y-3 pt-4">
          <h1 className="text-2xl font-black text-amber-500 tracking-wider uppercase">
            {restaurant?.name || 'NOM SUSHI VIBES'}
          </h1>

          <div className="flex justify-center">
            <img 
              src={restaurant?.logo_url || '/logo.png'} 
              alt={restaurant?.name || 'Logo'} 
              className="w-40 h-40 object-contain rounded-2xl bg-slate-800 p-2 border border-slate-700 shadow-md"
            />
          </div>

          {restaurant?.description && (
            <p className="text-xs text-slate-400 max-w-sm mx-auto whitespace-pre-line leading-relaxed">
              {restaurant.description}
            </p>
          )}
        </header>

        {promotions.length > 0 && (
          <div className="relative overflow-hidden bg-gradient-to-r from-amber-500/20 to-amber-600/10 border border-amber-500/30 p-4 rounded-xl shadow-lg transition-all">
            <div className="space-y-1">
              <span className="bg-amber-500 text-slate-900 font-black text-[9px] uppercase px-2 py-0.5 rounded tracking-widest">
                Promozione #{currentSlide + 1}
              </span>
              <h3 className="font-bold text-sm text-amber-400">{promotions[currentSlide].title}</h3>
              {promotions[currentSlide].description && (
                <p className="text-xs text-slate-300">{promotions[currentSlide].description}</p>
              )}
            </div>
          </div>
        )}

        <div className={`flex bg-slate-800 p-1 rounded-xl border border-slate-700 text-xs ${!allowReservations ? 'grid grid-cols-1' : 'grid grid-cols-2 gap-1'}`}>
          <button
            onClick={() => { setActiveTab('order'); }}
            className={`py-2.5 rounded-lg font-bold transition-all ${activeTab === 'order' ? 'bg-amber-500 text-slate-900 shadow' : 'text-slate-400 hover:text-white'}`}
          >
            Ordina Online
          </button>
          {allowReservations && (
            <button
              onClick={() => { setActiveTab('reserve'); }}
              className={`py-2.5 rounded-lg font-bold transition-all ${activeTab === 'reserve' ? 'bg-amber-500 text-slate-900 shadow' : 'text-slate-400 hover:text-white'}`}
            >
              Prenota Tavolo
            </button>
          )}
        </div>

        {submittedReceipt ? (
          <div className="bg-slate-800 border border-amber-500/40 p-6 rounded-xl space-y-4 text-xs">
            <div className="text-center space-y-1 border-b border-slate-700 pb-4">
              <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">
                Inviato Correttamente
              </span>
              <h2 className="text-base font-bold text-white pt-1">
                {submittedReceipt.type === 'order' ? 'Riepilogo Ordine' : 'Riepilogo Prenotazione'}
              </h2>
            </div>

            {submittedReceipt.type === 'order' ? (
              <div className="space-y-3 font-mono">
                <div className="flex justify-between text-slate-300">
                  <span>Cliente:</span>
                  <span className="font-bold text-white">{submittedReceipt.customerName}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Modalità:</span>
                  <span className="font-bold text-amber-400">{submittedReceipt.orderType}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Orario:</span>
                  <span className="font-bold text-white">{submittedReceipt.pickupTime}</span>
                </div>
                <div className="border-t border-slate-700 pt-2 space-y-1">
                  {submittedReceipt.items.map((it: any, idx: number) => (
                    <div key={idx} className="flex justify-between text-slate-300 py-1">
                      <div>
                        <span>{it.quantity}x {it.name}</span>
                        {it.itemNote && <span className="block text-[10px] text-amber-300">{it.itemNote}</span>}
                      </div>
                      <span>€{(it.price * it.quantity).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-amber-400 font-bold text-sm pt-2 border-t border-slate-700 font-sans">
                  <span>Totale:</span>
                  <span>€{submittedReceipt.total.toFixed(2)}</span>
                </div>

                <div className="bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-lg text-emerald-400 text-center font-sans text-xs mt-4">
                  Abbiamo inviato un'email di conferma all'indirizzo <strong>{submittedReceipt.customerEmail}</strong>.
                </div>
              </div>
            ) : (
              <div className="space-y-3 font-mono">
                <div className="flex justify-between text-slate-300">
                  <span>Nome:</span>
                  <span className="font-bold text-white">{submittedReceipt.customerName}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Data/Ora:</span>
                  <span className="font-bold text-amber-400">{submittedReceipt.date} alle {submittedReceipt.time}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Coperti:</span>
                  <span className="font-bold text-white">{submittedReceipt.guests} persone</span>
                </div>

                {submittedReceipt.customerEmail ? (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-lg text-emerald-400 text-center font-sans text-xs mt-4">
                    Abbiamo registrato la tua prenotazione e inviato i dettagli a <strong>{submittedReceipt.customerEmail}</strong>.
                  </div>
                ) : (
                  <div className="bg-slate-900 border border-slate-700 p-4 rounded-lg space-y-3 font-sans mt-4">
                    <p className="text-xs text-slate-300">Vuoi ricevere una copia del riepilogo via email?</p>
                    <div className="flex gap-2">
                      <input
                        type="email"
                        placeholder="Inserisci la tua email..."
                        id="extra-email-input"
                        className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-xs text-white"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          const emailInput = (document.getElementById('extra-email-input') as HTMLInputElement)?.value;
                          if (!emailInput || !emailInput.includes('@')) {
                            alert('Inserisci un indirizzo email valido');
                            return;
                          }
                          try {
                            const res = await fetch('/api/notify-order', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                customerEmail: emailInput,
                                customerName: submittedReceipt.customerName,
                                newStatus: 'pending',
                                pickupTime: `${submittedReceipt.date} alle ${submittedReceipt.time}`,
                                type: 'reservation',
                                restaurantName: restaurant?.name,
                                guests: submittedReceipt.guests,
                              }),
                            });
                            if (res.ok) {
                              alert('Email inviata con successo!');
                              setSubmittedReceipt({ ...submittedReceipt, customerEmail: emailInput });
                            } else {
                              alert("Errore nell'invio dell'email.");
                            }
                          } catch (err) {
                            console.error(err);
                          }
                        }}
                        className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold px-4 py-2 rounded text-xs shrink-0"
                      >
                        Invia
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={() => setSubmittedReceipt(null)}
              className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-2.5 rounded-lg transition-colors font-sans uppercase tracking-wider"
            >
              Nuovo Ordine / Prenotazione
            </button>
          </div>
        ) : activeTab === 'order' ? (
          <div className="space-y-6">
            
            <div className="bg-slate-800 p-3 rounded-xl border border-slate-700 flex items-center justify-between text-xs">
              <span className="font-bold text-amber-500 uppercase tracking-wide">Modalità di Ordine:</span>
              <select
                value={orderType}
                onChange={(e) => setOrderType(e.target.value as any)}
                className="bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-semibold focus:outline-none focus:border-amber-500"
              >
                <option value="takeaway" disabled={!allowTakeaway}>Ritiro d'asporto</option>
                <option value="delivery" disabled={!allowDelivery}>Consegna a domicilio</option>
              </select>
            </div>

            {categories.map((catName) => {
              const catProducts = products.filter((p) => 
                p.category && p.category.trim().toLowerCase() === catName.trim().toLowerCase()
              );
              
              if (catProducts.length === 0) return null;

              return (
                <div key={catName} className="space-y-3">
                  <h2 className="text-xs font-bold text-amber-500 uppercase tracking-wider border-b border-slate-800 pb-1">{catName}</h2>
                  <div className="space-y-2">
                    {catProducts.map((product) => (
                      <div key={product.id} className="flex justify-between items-center bg-slate-800/80 p-3 rounded-xl border border-slate-700/60 gap-3">
                        <div className="w-16 h-16 bg-slate-900 rounded-lg shrink-0 border border-slate-700/80 overflow-hidden flex items-center justify-center">
                          {product.image_url ? (
                            <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-[10px] text-slate-500 font-mono uppercase">Foto</span>
                          )}
                        </div>
                        <div className="space-y-0.5 flex-1">
                          <h3 className="font-bold text-xs text-white">{product.name}</h3>
                          {product.description && <p className="text-[11px] text-slate-400">{product.description}</p>}
                          <span className="font-mono text-amber-400 font-bold text-xs">€{Number(product.price).toFixed(2)}</span>
                        </div>
                        <button
                          onClick={() => addToCart(product)}
                          className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold text-xs px-3 py-1.5 rounded-lg transition-colors shrink-0"
                        >
                          Aggiungi
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {Object.keys(cart).length > 0 && (
              <form onSubmit={handleSendOrder} className="bg-slate-800 p-4 rounded-xl border border-slate-700 space-y-4">
                <h3 className="font-bold text-sm text-white border-b border-slate-700 pb-2">Riepilogo Ordine</h3>
                <div className="space-y-2 divide-y divide-slate-700/50">
                  {Object.values(cart).map(({ product, quantity, note }) => (
                    <div key={product.id} className="pt-2 space-y-2 text-xs">
                      <div className="flex justify-between items-center">
                        <div>
                          <span className="font-bold text-white">{quantity}x {product.name}</span>
                          <span className="text-slate-400 block font-mono">€{(product.price * quantity).toFixed(2)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingNoteId(editingNoteId === product.id ? null : product.id)}
                            className={`p-1.5 rounded-lg border transition ${note ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' : 'bg-slate-700 text-slate-300 border-slate-600'}`}
                          >
                            📝
                          </button>
                          <button type="button" onClick={() => updateQuantity(product.id, -1)} className="bg-slate-700 text-white w-6 h-6 rounded font-bold">-</button>
                          <span className="font-bold text-xs">{quantity}</span>
                          <button type="button" onClick={() => updateQuantity(product.id, 1)} className="bg-slate-700 text-white w-6 h-6 rounded font-bold">+</button>
                        </div>
                      </div>

                      {(editingNoteId === product.id || note) && (
                        <div className="pt-1">
                          <input
                            type="text"
                            placeholder="Nota piatto (es. senza cipolla)"
                            value={note}
                            onChange={(e) => updateItemNote(product.id, e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-[11px] text-amber-300"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-700 text-xs space-y-1 font-mono">
                  <div className="flex justify-between text-slate-400">
                    <span>Totale:</span>
                    <span>€{finalTotal.toFixed(2)}</span>
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <input
                    type="text"
                    placeholder="Il tuo nome *"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white"
                    required
                  />
                  <input
                    type="tel"
                    placeholder="Numero di telefono *"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className={`w-full bg-slate-900 border rounded-lg p-2.5 text-xs text-white transition ${
                      customerPhone && !isValidPhone(customerPhone) ? 'border-rose-500' : 'border-slate-700 focus:border-amber-500'
                    }`}
                    required
                  />
                  <input
                    type="email"
                    placeholder="Indirizzo email per conferma *"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white border-slate-700 focus:border-amber-500"
                    required
                  />

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <input
                      type="date"
                      min={todayStr}
                      value={orderDate}
                      onChange={(e) => setOrderDate(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white"
                      required
                    />
                    <select
                      value={pickupTime}
                      onChange={(e) => setPickupTime(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white"
                      required
                    >
                      {timeSlots.map((slot) => (
                        <option key={slot} value={slot}>{slot}</option>
                      ))}
                    </select>
                  </div>

                  <textarea
                    placeholder="Note generali (opzionale)"
                    value={generalNotes}
                    onChange={(e) => setGeneralNotes(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white"
                    rows={2}
                  />

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold py-3 rounded-lg text-xs uppercase"
                  >
                    Conferma ed Invia Ordine
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : allowReservations && (
          <form onSubmit={handleSendReservation} className="bg-slate-800 p-5 rounded-xl border border-slate-700 space-y-4 text-xs">
            <h3 className="font-bold text-sm text-white border-b border-slate-700 pb-2">Prenota un Tavolo</h3>
            <input
              type="text"
              placeholder="Il tuo nome *"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white"
              required
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="tel"
                placeholder="Telefono"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className={`w-full bg-slate-900 border rounded-lg p-2.5 text-white ${
                  customerPhone && !isValidPhone(customerPhone) ? 'border-rose-500' : 'border-slate-700'
                }`}
              />
              <input
                type="email"
                placeholder="Email (opzionale)"
                value={resEmail}
                onChange={(e) => setResEmail(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <input
                type="date"
                min={todayStr}
                value={resDate}
                onChange={(e) => setResDate(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white"
                required
              />
              <select
                value={resTime}
                onChange={(e) => setResTime(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white"
                required
              >
                {reservationTimeSlots.map((slot) => (
                  <option key={slot} value={slot}>{slot}</option>
                ))}
              </select>
              <input
                type="number"
                min="1"
                max="20"
                value={resGuests}
                onChange={(e) => setResGuests(parseInt(e.target.value, 10))}
                className="bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white"
                required
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold py-3 rounded-lg uppercase"
            >
              Invia Prenotazione
            </button>
          </form>
        )}

      </div>

      {/* Barra Sticky in basso per il carrello */}
      {Object.keys(cart).length > 0 && activeTab === 'order' && !submittedReceipt && (
        <div className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur border-t border-slate-800 p-4 shadow-2xl z-50 animate-slide-up">
          <div className="max-w-xl mx-auto flex items-center justify-between gap-4">
            <div>
              <span className="text-[10px] text-slate-400 block uppercase font-mono">
                Carrello ({Object.values(cart).reduce((acc, item) => acc + item.quantity, 0)} prodotti)
              </span>
              <span className="text-sm font-bold text-amber-400 font-mono">€{finalTotal.toFixed(2)}</span>
            </div>
            <button
              onClick={() => {
                window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
              }}
              className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold px-6 py-2.5 rounded-xl text-xs uppercase tracking-wider shadow-lg transition-transform active:scale-95"
            >
              Visualizza Carrello & Procedi
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PublicPage() {
  return (
    <Suspense fallback={<div className="bg-slate-900 min-h-screen text-slate-400 p-8 text-xs">Caricamento...</div>}>
      <PublicPageContent />
    </Suspense>
  );
}