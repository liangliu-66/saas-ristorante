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
  const [orderType, setOrderType] = useState<'takeaway' | 'delivery'>('takeaway');
  
  // Gestione note individuali per piatto nel carrello (apertura input)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);

  // Date e orari correnti per validazione e filtri
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  const [orderDate, setOrderDate] = useState(todayStr);
  const [pickupTime, setPickupTime] = useState('19:30');

  // Stato Prenotazione Tavolo
  const [resEmail, setResEmail] = useState('');
  const [resDate, setResDate] = useState(todayStr);
  const [resTime, setResTime] = useState('20:00');
  const [resGuests, setResGuests] = useState(2);
  const [resNotes, setResNotes] = useState('');
  const [generalNotes, setGeneralNotes] = useState('');

  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);
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
          const sortedRules = discRes.value.data.sort((a: any, b: any) => Number(b.min_amount) - Number(a.min_amount));
          setDiscountRules(sortedRules);
        }
      } catch (err) {
        console.error('Errore durante il caricamento dati:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, []);

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

  const handleSendOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (Object.keys(cart).length === 0) { alert('Il carrello è vuoto!'); return; }

    setIsSubmitting(true);

    const formattedItems = Object.values(cart).map((c) => ({
      name: c.product.name,
      quantity: c.quantity,
      price: c.product.price,
      itemNote: c.note,
    }));

    const { error } = await supabase.from('orders').insert({
      restaurant_id: restaurant?.id,
      customer_name: customerName,
      customer_phone: customerPhone,
      order_type: orderType,
      pickup_time: `${orderDate} ${pickupTime}`,
      items: formattedItems,
      notes: generalNotes ? `${generalNotes}${discountPercent > 0 ? ` [Sconto ${discountPercent}% applicato]` : ''}` : (discountPercent > 0 ? `[Sconto ${discountPercent}% applicato]` : ''),
      total_amount: finalTotal,
      status: 'pending',
    });

    setIsSubmitting(false);
    if (!error) {
      setOrderSuccess(true);
      setCart({});
    } else {
      alert(`Errore invio ordine: ${error.message}`);
    }
  };

  const handleSendReservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerPhone && !resEmail) {
      alert('Inserisci almeno un recapito tra numero di telefono ed email!');
      return;
    }

    setIsSubmitting(true);

    const rwgToken = searchParams.get('rwg_token');

    const { error } = await supabase.from('reservations').insert({
      restaurant_id: restaurant?.id,
      customer_name: customerName,
      customer_phone: customerPhone || null,
      customer_email: resEmail || null,
      party_size: resGuests,
      reservation_date: resDate,
      reservation_time: resTime,
      notes: `${resNotes || ''}${rwgToken ? ` (Ref: rwg_token)` : ''}`,
      status: 'pending',
    });

    setIsSubmitting(false);
    if (!error) {
      setOrderSuccess(true);
    } else {
      alert(`Errore invio prenotazione: ${error.message}`);
    }
  };

  // Generatore di slot orari dinamici (esclude gli orari passati se la data è oggi)
  const generateTimeSlots = (selectedDate: string) => {
    const slots = [];
    for (let h = 11; h <= 23; h++) {
      for (let m = 0; m < 60; m += 30) {
        const hourStr = h.toString().padStart(2, '0');
        const minStr = m.toString().padStart(2, '0');
        const timeVal = `${hourStr}:${minStr}`;

        // Se siamo a oggi, filtra gli orari già passati
        if (selectedDate === todayStr) {
          if (h < currentHour || (h === currentHour && m <= currentMinute)) {
            continue;
          }
        }
        slots.push(timeVal);
      }
    }
    // Assicura che ci sia almeno uno slot valido selezionabile
    if (slots.length === 0) {
      slots.push("23:30");
    }
    return slots;
  };

  const timeSlots = generateTimeSlots(activeTab === 'order' ? orderDate : resDate);

  const allowTakeaway = restaurant?.allow_takeaway ?? true;
  const allowDelivery = restaurant?.allow_delivery ?? true;
  const allowReservations = restaurant?.allow_reservations ?? true;

  if (loading) return <div className="bg-slate-900 min-h-screen text-slate-400 p-8 text-xs">Caricamento...</div>;

  return (
    <div className="min-h-screen bg-slate-900 text-white pb-24">
      <div className="max-w-xl mx-auto p-4 space-y-6">
        
        <header className="text-center space-y-2 pt-4">
          <h1 className="text-2xl font-black text-amber-500 tracking-wider uppercase">{restaurant?.name || 'NOM SUSHI VIBES'}</h1>
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
            {promotions.length > 1 && (
              <div className="flex justify-center gap-1.5 mt-3">
                {promotions.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentSlide(idx)}
                    className={`h-1.5 rounded-full transition-all ${idx === currentSlide ? 'w-5 bg-amber-500' : 'w-1.5 bg-slate-700'}`}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Mostra la tab Prenota Tavolo solo se allowReservations è true */}
        <div className={`flex bg-slate-800 p-1 rounded-xl border border-slate-700 text-xs ${!allowReservations ? 'grid grid-cols-1' : 'grid grid-cols-2 gap-1'}`}>
          <button
            onClick={() => { setActiveTab('order'); setOrderSuccess(false); }}
            className={`py-2.5 rounded-lg font-bold transition-all ${activeTab === 'order' ? 'bg-amber-500 text-slate-900 shadow' : 'text-slate-400 hover:text-white'}`}
          >
            Ordina Online
          </button>
          {allowReservations && (
            <button
              onClick={() => { setActiveTab('reserve'); setOrderSuccess(false); }}
              className={`py-2.5 rounded-lg font-bold transition-all ${activeTab === 'reserve' ? 'bg-amber-500 text-slate-900 shadow' : 'text-slate-400 hover:text-white'}`}
            >
              Prenota Tavolo
            </button>
          )}
        </div>

        {orderSuccess ? (
          <div className="bg-emerald-500/10 border border-emerald-500/30 p-6 rounded-xl text-center space-y-3">
            <h2 className="text-base font-bold text-emerald-400">Richiesta inviata con successo!</h2>
            <p className="text-xs text-slate-300">Abbiamo preso in carico la tua richiesta. Riceverai una conferma a breve.</p>
            <button onClick={() => setOrderSuccess(false)} className="bg-slate-800 text-xs text-white font-semibold px-4 py-2 rounded-lg border border-slate-700">
              Nuovo Ordine / Prenotazione
            </button>
          </div>
        ) : activeTab === 'order' ? (
          <div className="space-y-6">
            
            {/* Selezione del tipo di ordine PRIMA del menu */}
            <div className="bg-slate-800 p-3 rounded-xl border border-slate-700 flex items-center justify-between text-xs">
              <span className="font-bold text-amber-500 uppercase tracking-wide">Modalità di Ordine:</span>
              <select
                value={orderType}
                onChange={(e) => setOrderType(e.target.value as any)}
                className="bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-semibold focus:outline-none focus:border-amber-500"
              >
                <option value="takeaway" disabled={!allowTakeaway}>
                  Ritiro d'asporto {!allowTakeaway ? '(Non disponibile)' : ''}
                </option>
                <option value="delivery" disabled={!allowDelivery}>
                  Consegna a domicilio {!allowDelivery ? '(Non disponibile)' : ''}
                </option>
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
                <h3 className="font-bold text-sm text-white border-b border-slate-700 pb-2">Riepilogo Ordine ({orderType === 'takeaway' ? 'Ritiro' : 'Consegna'})</h3>
                <div className="space-y-2 divide-y divide-slate-700/50">
                  {Object.values(cart).map(({ product, quantity, note }) => (
                    <div key={product.id} className="pt-2 space-y-2 text-xs">
                      <div className="flex justify-between items-center">
                        <div>
                          <span className="font-bold text-white">{quantity}x {product.name}</span>
                          <span className="text-slate-400 block font-mono">€{(product.price * quantity).toFixed(2)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {/* Pulsante Nota per singolo piatto */}
                          <button
                            type="button"
                            title="Aggiungi nota al piatto"
                            onClick={() => setEditingNoteId(editingNoteId === product.id ? null : product.id)}
                            className={`p-1.5 rounded-lg border transition ${note ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' : 'bg-slate-700 text-slate-300 border-slate-600 hover:text-white'}`}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button type="button" onClick={() => updateQuantity(product.id, -1)} className="bg-slate-700 text-white w-6 h-6 rounded flex items-center justify-center font-bold">-</button>
                          <span className="font-bold text-xs">{quantity}</span>
                          <button type="button" onClick={() => updateQuantity(product.id, 1)} className="bg-slate-700 text-white w-6 h-6 rounded flex items-center justify-center font-bold">+</button>
                        </div>
                      </div>

                      {/* Input nota per singolo piatto */}
                      {(editingNoteId === product.id || note) && (
                        <div className="pt-1">
                          <input
                            type="text"
                            placeholder="Es. Senza cipolla, ben cotto..."
                            value={note}
                            onChange={(e) => updateItemNote(product.id, e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-[11px] text-amber-300 focus:outline-none focus:border-amber-500"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-700 text-xs space-y-1 font-mono">
                  <div className="flex justify-between text-slate-400">
                    <span>Subtotale:</span>
                    <span>€{rawTotal.toFixed(2)}</span>
                  </div>
                  {discountPercent > 0 && (
                    <div className="flex justify-between text-emerald-400 font-bold">
                      <span>Sconto Applicato ({discountPercent}%):</span>
                      <span>-€{discountAmount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-amber-400 font-bold text-sm pt-1 border-t border-slate-800">
                    <span>Totale Finale:</span>
                    <span>€{finalTotal.toFixed(2)}</span>
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <input
                    type="text"
                    placeholder="Il tuo nome *"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-amber-500"
                    required
                  />
                  <input
                    type="tel"
                    placeholder="Numero di telefono *"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-amber-500"
                    required
                  />

                  {/* Selezione Data e Ora con slot oscurati se passati */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <input
                      type="date"
                      min={todayStr}
                      value={orderDate}
                      onChange={(e) => setOrderDate(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-amber-500"
                      required
                    />

                    <select
                      value={pickupTime}
                      onChange={(e) => setPickupTime(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-amber-500"
                      required
                    >
                      {timeSlots.map((slot) => (
                        <option key={slot} value={slot}>{slot}</option>
                      ))}
                    </select>
                  </div>

                  <textarea
                    placeholder="Note generali o allergie (opzionale)"
                    value={generalNotes}
                    onChange={(e) => setGeneralNotes(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-amber-500"
                    rows={2}
                  />
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold py-3 rounded-lg transition-colors text-xs uppercase tracking-wider"
                  >
                    {isSubmitting ? 'Invio in corso...' : 'Conferma ed Invia Ordine'}
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
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-amber-500"
              required
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="tel"
                placeholder="Numero di telefono"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-amber-500"
              />
              <input
                type="email"
                placeholder="Indirizzo Email"
                value={resEmail}
                onChange={(e) => setResEmail(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-amber-500"
              />
            </div>
            <p className="text-[10px] text-slate-400 italic">Inserisci almeno un recapito tra Telefono ed Email.</p>

            <div className="grid grid-cols-3 gap-2">
              <input
                type="date"
                min={todayStr}
                value={resDate}
                onChange={(e) => setResDate(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-amber-500"
                required
              />
              <select
                value={resTime}
                onChange={(e) => setResTime(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-amber-500"
                required
              >
                {timeSlots.map((slot) => (
                  <option key={slot} value={slot}>{slot}</option>
                ))}
              </select>
              <input
                type="number"
                min="1"
                max="20"
                value={resGuests}
                onChange={(e) => setResGuests(parseInt(e.target.value, 10))}
                className="bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-amber-500"
                required
              />
            </div>
            <textarea
              placeholder="Note o richieste particolari (opzionale)"
              value={resNotes}
              onChange={(e) => setResNotes(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-amber-500"
              rows={2}
            />
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold py-3 rounded-lg transition-colors uppercase tracking-wider"
            >
              {isSubmitting ? 'Invio in corso...' : 'Invia Prenotazione'}
            </button>
          </form>
        )}

      </div>
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