'use client';

import { useEffect, useState, Suspense } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useSearchParams } from 'next/navigation';

function PublicPageContent() {
  const searchParams = useSearchParams();
  const initialAction = searchParams.get('action');

  const [restaurant, setRestaurant] = useState<any>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [promotions, setPromotions] = useState<any[]>([]);
  const [discountRules, setDiscountRules] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'order' | 'reserve'>(
    initialAction === 'reserve' ? 'reserve' : 'order'
  );

  // Stato Carrello & Form
  const [cart, setCart] = useState<Record<string, { item: any; quantity: number; note: string }>>({});
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [orderType, setOrderType] = useState<'takeaway' | 'delivery'>('takeaway');
  const [pickupTime, setPickupTime] = useState('19:30');
  const [generalNotes, setGeneralNotes] = useState('');

  // Stato Prenotazione
  const [resDate, setResDate] = useState(new Date().toISOString().split('T')[0]);
  const [resTime, setResTime] = useState('20:00');
  const [resGuests, setResGuests] = useState(2);
  const [resNotes, setResNotes] = useState('');

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
        // Caricamento parallelo puntando alla tabella corretta "products"
        const [restRes, catRes, itemRes, promoRes, discRes] = await Promise.allSettled([
          supabase.from('restaurants').select('*').limit(1).maybeSingle(),
          supabase.from('categories').select('*'),
          supabase.from('products').select('*'), // <-- Corretto da items a products
          supabase.from('promotions').select('*'),
          supabase.from('discount_rules').select('*')
        ]);

        if (!isMounted) return;

        if (restRes.status === 'fulfilled' && restRes.value.data) {
          setRestaurant(restRes.value.data);
        }

        if (catRes.status === 'fulfilled' && catRes.value.data) {
          setCategories(catRes.value.data);
        }

        if (itemRes.status === 'fulfilled' && itemRes.value.data) {
          setItems(itemRes.value.data);
        }

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

  // Rotazione automatica delle slide promozioni ogni 4 secondi
  useEffect(() => {
    if (promotions.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % promotions.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [promotions.length]);

  // Calcolo Totale e Sconto
  const rawTotal = Object.values(cart).reduce((sum, entry) => sum + (entry.item.price * entry.quantity), 0);
  const activeDiscount = discountRules.find((rule) => rawTotal >= Number(rule.min_amount));
  const discountPercent = activeDiscount ? Number(activeDiscount.discount_percentage) : 0;
  const discountAmount = (rawTotal * discountPercent) / 100;
  const finalTotal = rawTotal - discountAmount;

  const addToCart = (item: any) => {
    setCart((prev) => {
      const existing = prev[item.id];
      const newQty = existing ? existing.quantity + 1 : 1;
      return { ...prev, [item.id]: { item, quantity: newQty, note: existing?.note || '' } };
    });
  };

  const updateQuantity = (itemId: string, delta: number) => {
    setCart((prev) => {
      const existing = prev[itemId];
      if (!existing) return prev;
      const newQty = existing.quantity + delta;
      if (newQty <= 0) {
        const copy = { ...prev };
        delete copy[itemId];
        return copy;
      }
      return { ...prev, [itemId]: { ...existing, quantity: newQty } };
    });
  };

  const handleSendOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (Object.keys(cart).length === 0) { alert('Il carrello è vuoto!'); return; }
    setIsSubmitting(true);

    const formattedItems = Object.values(cart).map((c) => ({
      name: c.item.name,
      quantity: c.quantity,
      price: c.item.price,
      itemNote: c.note,
    }));

    const { error } = await supabase.from('orders').insert({
      restaurant_id: restaurant?.id,
      customer_name: customerName,
      customer_phone: customerPhone,
      order_type: orderType,
      pickup_time: pickupTime,
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
    setIsSubmitting(true);

    const rwgToken = searchParams.get('rwg_token');

    const { error } = await supabase.from('reservations').insert({
      restaurant_id: restaurant?.id,
      customer_name: customerName,
      customer_phone: customerPhone,
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

  if (loading) return <div className="bg-slate-900 min-h-screen text-slate-400 p-8 text-xs">Caricamento...</div>;

  return (
    <div className="min-h-screen bg-slate-900 text-white pb-24">
      <div className="max-w-xl mx-auto p-4 space-y-6">
        
        {/* Intestazione e Nome Ristorante */}
        <header className="text-center space-y-2 pt-4">
          <h1 className="text-2xl font-black text-amber-500 tracking-wider uppercase">{restaurant?.name || 'NOM SUSHI VIBES'}</h1>
          {restaurant?.description && <p className="text-xs text-slate-400 max-w-sm mx-auto">{restaurant.description}</p>}
        </header>

        {/* BACHECA SLIDE PROMOZIONI */}
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

        {/* Pulsanti Switch: Ordina Online / Prenota Tavolo */}
        <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700 text-xs">
          <button
            onClick={() => { setActiveTab('order'); setOrderSuccess(false); }}
            className={`flex-1 py-2.5 rounded-lg font-bold transition-all ${activeTab === 'order' ? 'bg-amber-500 text-slate-900 shadow' : 'text-slate-400 hover:text-white'}`}
          >
            Ordina Online
          </button>
          <button
            onClick={() => { setActiveTab('reserve'); setOrderSuccess(false); }}
            className={`flex-1 py-2.5 rounded-lg font-bold transition-all ${activeTab === 'reserve' ? 'bg-amber-500 text-slate-900 shadow' : 'text-slate-400 hover:text-white'}`}
          >
            Prenota Tavolo
          </button>
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
          /* TAB MENU & CARRELLO */
          <div className="space-y-6">
            {/* Se non ci sono categorie O se nessun piatto ha una category_id valida */}
            {categories.length === 0 || !items.some((item) => categories.some((c) => c.id === item.category_id)) ? (
              <div className="space-y-2">
                {items.length === 0 ? (
                  <p className="text-center text-xs text-slate-500 py-4">Nessun piatto trovato nel menu.</p>
                ) : (
                  items.map((item) => (
                    <div key={item.id} className="flex justify-between items-center bg-slate-800/80 p-3 rounded-xl border border-slate-700/60">
                      <div className="space-y-0.5">
                        <h3 className="font-bold text-xs text-white">{item.name}</h3>
                        {item.description && <p className="text-[11px] text-slate-400">{item.description}</p>}
                        <span className="font-mono text-amber-400 font-bold text-xs">€{Number(item.price).toFixed(2)}</span>
                      </div>
                      <button
                        onClick={() => addToCart(item)}
                        className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold text-xs px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Aggiungi
                      </button>
                    </div>
                  ))
                )}
              </div>
            ) : (
              /* Rendering normale diviso per Categorie */
              categories.map((cat) => {
                const catItems = items.filter((i) => i.category_id === cat.id);
                if (catItems.length === 0) return null;

                return (
                  <div key={cat.id} className="space-y-3">
                    <h2 className="text-xs font-bold text-amber-500 uppercase tracking-wider border-b border-slate-800 pb-1">{cat.name}</h2>
                    <div className="space-y-2">
                      {catItems.map((item) => (
                        <div key={item.id} className="flex justify-between items-center bg-slate-800/80 p-3 rounded-xl border border-slate-700/60">
                          <div className="space-y-0.5">
                            <h3 className="font-bold text-xs text-white">{item.name}</h3>
                            {item.description && <p className="text-[11px] text-slate-400">{item.description}</p>}
                            <span className="font-mono text-amber-400 font-bold text-xs">€{Number(item.price).toFixed(2)}</span>
                          </div>
                          <button
                            onClick={() => addToCart(item)}
                            className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold text-xs px-3 py-1.5 rounded-lg transition-colors"
                          >
                            Aggiungi
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}

            {/* RIEPILOGO CARRELLO & SCONTI CHECKOUT */}
            {Object.keys(cart).length > 0 && (
              <form onSubmit={handleSendOrder} className="bg-slate-800 p-4 rounded-xl border border-slate-700 space-y-4">
                <h3 className="font-bold text-sm text-white border-b border-slate-700 pb-2">Riepilogo Ordine</h3>
                <div className="space-y-2 divide-y divide-slate-700/50">
                  {Object.values(cart).map(({ item, quantity }) => (
                    <div key={item.id} className="pt-2 flex justify-between items-center text-xs">
                      <div>
                        <span className="font-bold text-white">{quantity}x {item.name}</span>
                        <span className="text-slate-400 block font-mono">€{(item.price * quantity).toFixed(2)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => updateQuantity(item.id, -1)} className="bg-slate-700 text-white w-6 h-6 rounded flex items-center justify-center font-bold">-</button>
                        <span className="font-bold text-xs">{quantity}</span>
                        <button type="button" onClick={() => updateQuantity(item.id, 1)} className="bg-slate-700 text-white w-6 h-6 rounded flex items-center justify-center font-bold">+</button>
                      </div>
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
                  <div className="flex gap-2 text-xs">
                    <select
                      value={orderType}
                      onChange={(e) => setOrderType(e.target.value as any)}
                      className="bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white flex-1 focus:outline-none focus:border-amber-500"
                    >
                      <option value="takeaway">Ritiro d'asporto</option>
                      <option value="delivery">Consegna a domicilio</option>
                    </select>
                    <input
                      type="time"
                      value={pickupTime}
                      onChange={(e) => setPickupTime(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-amber-500"
                      required
                    />
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
        ) : (
          /* TAB PRENOTAZIONE TAVOLO */
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
            <input
              type="tel"
              placeholder="Numero di telefono *"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-amber-500"
              required
            />
            <div className="grid grid-cols-3 gap-2">
              <input
                type="date"
                value={resDate}
                onChange={(e) => setResDate(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-amber-500"
                required
              />
              <input
                type="time"
                value={resTime}
                onChange={(e) => setResTime(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-amber-500"
                required
              />
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