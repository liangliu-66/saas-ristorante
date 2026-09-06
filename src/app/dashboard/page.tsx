'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, Suspense } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useSearchParams } from 'next/navigation';

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  image_url: string | null;
  is_available: boolean;
}

interface CartItem extends Product {
  quantity: number;
  itemNote?: string;
}

function MainRestaurantContent() {
  const searchParams = useSearchParams();
  const rwgToken = searchParams?.get('rwg_token');

  const [restaurant, setRestaurant] = useState<any>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'menu' | 'reservation'>('menu');

  // Carrello & Checkout
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);

  // Form Ordine
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [orderType, setOrderType] = useState<'takeaway' | 'delivery'>('takeaway');
  const [pickupTime, setPickupTime] = useState('');
  const [generalNotes, setGeneralNotes] = useState('');
  const [sendingOrder, setSendingOrder] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);

  // Form Prenotazione
  const [resName, setResName] = useState('');
  const [resPhone, setResPhone] = useState('');
  const [resEmail, setResEmail] = useState('');
  const [resDate, setResDate] = useState('');
  const [resTime, setResTime] = useState('');
  const [resGuests, setResGuests] = useState('2');
  const [resNotes, setResNotes] = useState('');
  const [sendingRes, setSendingRes] = useState(false);
  const [resSuccess, setResSuccess] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    if (searchParams?.get('action') === 'reserve') {
      setActiveTab('reservation');
    }

    const fetchFirstRestaurant = async () => {
      setLoading(true);
      const { data: restData } = await supabase
        .from('restaurants')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (restData) {
        setRestaurant(restData);
        if (restData.allow_delivery) setOrderType('delivery');

        const orderSlots = restData.order_time_slots || ['12:00', '12:30', '13:00', '19:30', '20:00'];
        const resSlots = restData.reservation_time_slots || ['12:30', '13:00', '20:00', '20:30'];

        setPickupTime(orderSlots[0] || '12:00');
        setResTime(resSlots[0] || '20:00');

        const { data: prodData } = await supabase
          .from('products')
          .select('*')
          .eq('restaurant_id', restData.id)
          .eq('is_available', true);

        if (prodData) setProducts(prodData);
      }
      setLoading(false);
    };

    fetchFirstRestaurant();
  }, [searchParams]);

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { ...product, quantity: 1, itemNote: '' }];
    });
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) =>
      prev
        .map((item) => (item.id === productId ? { ...item, quantity: item.quantity - 1 } : item))
        .filter((item) => item.quantity > 0)
    );
  };

  const updateCartItemNote = (productId: string, note: string) => {
    setCart((prev) =>
      prev.map((item) => (item.id === productId ? { ...item, itemNote: note } : item))
    );
  };

  const totalAmount = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  const handleSendOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName || !customerPhone || cart.length === 0) return;
    setSendingOrder(true);

    const itemsSummary = cart
      .map((c) => `${c.quantity}x ${c.name}${c.itemNote ? ` (Nota: ${c.itemNote})` : ''}`)
      .join(', ');

    const { error } = await supabase.from('reservations').insert([
      {
        restaurant_id: restaurant.id,
        customer_name: customerName,
        customer_phone: customerPhone,
        reservation_date: new Date().toISOString().split('T')[0],
        reservation_time: pickupTime,
        notes: `[ORDINE ${orderType.toUpperCase()} - ORARIO: ${pickupTime}] ${generalNotes ? `Note Ordine: ${generalNotes} | ` : ''}Prodotti: ${itemsSummary}`,
        status: 'pending',
        guests: totalItems,
      },
    ]);

    if (!error) {
      setOrderSuccess(true);
      setCart([]);
      setTimeout(() => {
        setIsCheckoutOpen(false);
        setOrderSuccess(false);
      }, 3000);
    } else {
      alert(`Errore invio ordine: ${error.message}`);
    }
    setSendingOrder(false);
  };

  const handleSendReservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resName || (!resPhone && !resEmail) || !resDate) {
      alert("Inserire un numero di telefono oppure una email per la prenotazione.");
      return;
    }
    setSendingRes(true);

    const { error } = await supabase.from('reservations').insert([
      {
        restaurant_id: restaurant.id,
        customer_name: resName,
        customer_phone: resPhone || 'Non specificato',
        customer_email: resEmail || null,
        reservation_date: resDate,
        reservation_time: resTime,
        guests: parseInt(resGuests) || 2,
        notes: `[PRENOTAZIONE TAVOLO] ${resNotes} (GoogleRef: ${rwgToken || 'Direct'})`,
        status: 'pending',
      },
    ]);

    if (!error) {
      setResSuccess(true);
      setResName('');
      setResPhone('');
      setResEmail('');
      setResNotes('');
    } else {
      alert(`Errore prenotazione: ${error.message}`);
    }
    setSendingRes(false);
  };

  if (loading) return <div className="min-h-screen bg-slate-900 text-white p-6 flex items-center justify-center">Caricamento...</div>;

  const orderTimeSlots = restaurant?.order_time_slots || ['12:00', '12:30', '13:00', '19:30', '20:00'];
  const reservationTimeSlots = restaurant?.reservation_time_slots || ['12:30', '13:00', '20:00', '20:30'];

  return (
    <div className="min-h-screen bg-slate-900 text-white pb-28">
      <header className="bg-slate-800 border-b border-slate-700 p-6 text-center space-y-3">
        <h1 className="text-3xl font-black text-amber-500">{restaurant.name}</h1>
        {restaurant.description && <p className="text-slate-300 text-sm max-w-md mx-auto">{restaurant.description}</p>}

        <div className="flex justify-center gap-2 pt-2 max-w-xs mx-auto">
          <button
            onClick={() => setActiveTab('menu')}
            className={`flex-1 py-2 px-4 rounded-xl text-xs font-bold transition-colors ${
              activeTab === 'menu' ? 'bg-amber-500 text-slate-900' : 'bg-slate-900 text-slate-400 border border-slate-700'
            }`}
          >
            Ordina Online
          </button>
          {restaurant.allow_reservations && (
            <button
              onClick={() => setActiveTab('reservation')}
              className={`flex-1 py-2 px-4 rounded-xl text-xs font-bold transition-colors ${
                activeTab === 'reservation' ? 'bg-amber-500 text-slate-900' : 'bg-slate-900 text-slate-400 border border-slate-700'
              }`}
            >
              Prenota Tavolo
            </button>
          )}
        </div>
      </header>

      {activeTab === 'menu' && (
        <main className="max-w-md mx-auto p-4 space-y-4">
          {products.length === 0 ? (
            <p className="text-slate-400 text-center py-8">Nessun piatto disponibile.</p>
          ) : (
            products.map((item) => {
              const inCart = cart.find((c) => c.id === item.id);
              return (
                <div key={item.id} className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex justify-between items-center gap-4">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} className="w-16 h-16 rounded-lg object-cover bg-slate-900 border border-slate-700" />
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center text-[10px] text-slate-500">No Img</div>
                  )}

                  <div className="flex-1">
                    <h3 className="font-bold text-sm">{item.name}</h3>
                    <p className="text-xs text-slate-400">{item.description}</p>
                    <span className="font-bold text-amber-500 text-sm mt-1 block">€{Number(item.price).toFixed(2)}</span>
                  </div>

                  <div className="flex items-center gap-2 bg-slate-900 p-1 rounded-lg border border-slate-700">
                    {inCart ? (
                      <>
                        <button onClick={() => removeFromCart(item.id)} className="w-7 h-7 bg-slate-700 rounded text-amber-500 font-bold">-</button>
                        <span className="text-xs font-bold w-4 text-center">{inCart.quantity}</span>
                        <button onClick={() => addToCart(item)} className="w-7 h-7 bg-amber-500 text-slate-900 rounded font-bold">+</button>
                      </>
                    ) : (
                      <button onClick={() => addToCart(item)} className="bg-amber-500 text-slate-900 font-bold text-xs px-3 py-1.5 rounded-md">
                        Aggiungi
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </main>
      )}

      {activeTab === 'reservation' && (
        <main className="max-w-md mx-auto p-4 space-y-4">
          <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 space-y-4">
            <h2 className="text-lg font-bold text-amber-500">Prenota un Tavolo</h2>

            {resSuccess ? (
              <div className="text-center py-6 space-y-2">
                <h3 className="text-lg font-bold text-emerald-400">Richiesta Inviata!</h3>
                <button onClick={() => setResSuccess(false)} className="mt-4 bg-slate-700 text-xs text-white px-4 py-2 rounded-lg">
                  Nuova prenotazione
                </button>
              </div>
            ) : (
              <form onSubmit={handleSendReservation} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Data</label>
                    <input
                      type="date"
                      value={resDate}
                      onChange={(e) => setResDate(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Orario Prenotazione</label>
                    <select
                      value={resTime}
                      onChange={(e) => setResTime(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white"
                    >
                      {reservationTimeSlots.map((slot: string) => (
                        <option key={slot} value={slot}>{slot}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Commensali</label>
                  <select
                    value={resGuests}
                    onChange={(e) => setResGuests(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
                      <option key={n} value={n}>{n} {n === 1 ? 'Persona' : 'Persone'}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-3 pt-2">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Nome e Cognome</label>
                    <input
                      type="text"
                      value={resName}
                      onChange={(e) => setResName(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs text-white focus:outline-none focus:border-amber-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Telefono (oppure Email)</label>
                    <input
                      type="tel"
                      value={resPhone}
                      onChange={(e) => setResPhone(e.target.value.replace(/[^0-9+]/g, ''))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Email (oppure Telefono)</label>
                    <input
                      type="email"
                      value={resEmail}
                      onChange={(e) => setResEmail(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Note</label>
                    <textarea
                      rows={2}
                      value={resNotes}
                      onChange={(e) => setResNotes(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={sendingRes}
                  className="w-full bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold p-3 rounded-lg transition-colors text-xs"
                >
                  {sendingRes ? 'Invio in corso...' : 'Invia Prenotazione Tavolo'}
                </button>
              </form>
            )}
          </div>
        </main>
      )}

      {totalItems > 0 && activeTab === 'menu' && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-slate-900/95 border-t border-slate-800 backdrop-blur-md">
          <div className="max-w-md mx-auto flex items-center justify-between bg-amber-500 p-3 rounded-xl text-slate-900">
            <div>
              <span className="text-xs font-bold block">{totalItems} articoli selezionati</span>
              <span className="text-lg font-black">Totale: €{totalAmount.toFixed(2)}</span>
            </div>
            <button
              onClick={() => setIsCheckoutOpen(true)}
              className="bg-slate-900 text-amber-500 font-bold px-4 py-2 rounded-lg text-sm"
            >
              Vedi Ordine →
            </button>
          </div>
        </div>
      )}

      {/* Modale Carrello con Note sui Singoli Piatti */}
      {isCheckoutOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 w-full max-w-md rounded-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-700 pb-3">
              <h2 className="text-lg font-bold">Riepilogo Ordine</h2>
              <button onClick={() => setIsCheckoutOpen(false)} className="text-slate-400 text-sm">Chiudi ✕</button>
            </div>

            {orderSuccess ? (
              <div className="text-center py-8 space-y-2">
                <h3 className="text-xl font-bold text-emerald-400">Ordine Inviato!</h3>
              </div>
            ) : (
              <form onSubmit={handleSendOrder} className="space-y-4">
                {/* Lista Piatto con campo Nota dedicato */}
                <div className="space-y-3 max-h-52 overflow-y-auto pr-1">
                  {cart.map((c) => (
                    <div key={c.id} className="bg-slate-900 p-3 rounded-lg border border-slate-700 space-y-2">
                      <div className="flex justify-between text-sm font-bold">
                        <span>{c.quantity}x {c.name}</span>
                        <span className="text-amber-500">€{(c.price * c.quantity).toFixed(2)}</span>
                      </div>
                      <input
                        type="text"
                        value={c.itemNote || ''}
                        onChange={(e) => updateCartItemNote(c.id, e.target.value)}
                        placeholder="Note per questo piatto (es. senza cipolla)..."
                        className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-[11px] text-white focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2">
                  {restaurant.allow_takeaway && (
                    <button
                      type="button"
                      onClick={() => setOrderType('takeaway')}
                      className={`p-2 rounded-lg text-xs font-bold border ${orderType === 'takeaway' ? 'bg-amber-500 text-slate-900 border-amber-500' : 'bg-slate-900 text-slate-400 border-slate-700'}`}
                    >
                      Asporto
                    </button>
                  )}
                  {restaurant.allow_delivery && (
                    <button
                      type="button"
                      onClick={() => setOrderType('delivery')}
                      className={`p-2 rounded-lg text-xs font-bold border ${orderType === 'delivery' ? 'bg-amber-500 text-slate-900 border-amber-500' : 'bg-slate-900 text-slate-400 border-slate-700'}`}
                    >
                      Consegna (€{Number(restaurant.delivery_fee || 0).toFixed(2)})
                    </button>
                  )}
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Orario Desiderato Ordine</label>
                  <select
                    value={pickupTime}
                    onChange={(e) => setPickupTime(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white"
                  >
                    {orderTimeSlots.map((slot: string) => (
                      <option key={slot} value={slot}>{slot}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Nome e Cognome</label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs text-white focus:outline-none focus:border-amber-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Telefono</label>
                    <input
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value.replace(/[^0-9+]/g, ''))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs text-white focus:outline-none focus:border-amber-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Note Generali Ordine</label>
                    <textarea
                      rows={2}
                      value={generalNotes}
                      onChange={(e) => setGeneralNotes(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={sendingOrder}
                  className="w-full bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold p-3 rounded-lg transition-colors text-xs"
                >
                  {sendingOrder ? 'Invio in corso...' : `Invia Ordine (€${(totalAmount + (orderType === 'delivery' ? (restaurant.delivery_fee || 0) : 0)).toFixed(2)})`}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-900 text-white p-6 flex items-center justify-center">Caricamento...</div>}>
      <MainRestaurantContent />
    </Suspense>
  );
}