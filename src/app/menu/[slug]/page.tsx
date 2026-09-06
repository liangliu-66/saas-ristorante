'use client';

import { useEffect, useState, use } from 'react';
import { createBrowserClient } from '@supabase/ssr';

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
}

export default function PublicMenuPage({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = use(params);
  const slug = resolvedParams?.slug;

  const [restaurant, setRestaurant] = useState<any>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // Stato Carrello
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);

  // Form Cliente
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [orderType, setOrderType] = useState<'takeaway' | 'delivery'>('takeaway');
  const [notes, setNotes] = useState('');
  const [sendingOrder, setSendingOrder] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    if (!slug) return;

    const fetchMenu = async () => {
      const { data: restData } = await supabase
        .from('restaurants')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();

      if (restData) {
        setRestaurant(restData);
        if (restData.allow_delivery) setOrderType('delivery');

        const { data: prodData } = await supabase
          .from('products')
          .select('*')
          .eq('restaurant_id', restData.id)
          .eq('is_available', true);

        if (prodData) setProducts(prodData);
      }
      setLoading(false);
    };

    fetchMenu();
  }, [slug]);

  // Gestione Carrello
  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) =>
      prev
        .map((item) => (item.id === productId ? { ...item, quantity: item.quantity - 1 } : item))
        .filter((item) => item.quantity > 0)
    );
  };

  const totalAmount = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  // Validazione Telefono: Solo cifre e il + iniziale
  const handlePhoneChange = (val: string) => {
    const cleanVal = val.replace(/[^0-9+]/g, '');
    setCustomerPhone(cleanVal);
  };

  // Invio Ordine in Batch
  const handleSendOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName || !customerPhone || cart.length === 0) return;
    setSendingOrder(true);

    const deliveryFee = orderType === 'delivery' ? (restaurant.delivery_fee || 0) : 0;
    const finalPrice = totalAmount + deliveryFee;

    // 1. Inserimento Ordine Principale
    const { data: orderData, error: orderError } = await supabase
      .from('reservations') // Usiamo la tabella ordini/prenotazioni
      .insert([
        {
          restaurant_id: restaurant.id,
          customer_name: customerName,
          customer_phone: customerPhone,
          notes: `[ORDINE ${orderType.toUpperCase()}] ${notes} - Articoli: ${cart.map(c => `${c.quantity}x ${c.name}`).join(', ')}`,
          status: 'pending',
          guests: totalItems,
          reservation_date: new Date().toISOString().split('T')[0],
          reservation_time: new Date().toTimeString().split(' ')[0],
        },
      ])
      .select()
      .single();

    if (!orderError) {
      setOrderSuccess(true);
      setCart([]);
      setTimeout(() => {
        setIsCheckoutOpen(false);
        setOrderSuccess(false);
      }, 3000);
    } else {
      alert(`Errore invio ordine: ${orderError.message}`);
    }
    setSendingOrder(false);
  };

  if (loading) {
    return <div className="min-h-screen bg-slate-900 text-white p-6 flex items-center justify-center">Caricamento menu...</div>;
  }

  if (!restaurant) {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-6 flex flex-col items-center justify-center text-center">
        <h1 className="text-2xl font-bold text-red-400">Ristorante Non Trovato</h1>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white pb-28">
      {/* Header Ristorante */}
      <header className="bg-slate-800 p-6 border-b border-slate-700 text-center space-y-2">
        <h1 className="text-3xl font-bold text-amber-500">{restaurant.name}</h1>
        {restaurant.description && <p className="text-slate-400 text-sm">{restaurant.description}</p>}
        
        <div className="flex justify-center gap-4 text-xs text-slate-400 pt-2">
          {restaurant.opening_hours?.text && <span>🕒 Orari: {restaurant.opening_hours.text}</span>}
        </div>
      </header>

      {/* Lista Prodotti */}
      <main className="max-w-md mx-auto p-4 space-y-4">
        {products.length === 0 ? (
          <p className="text-slate-400 text-center py-8">Nessun piatto disponibile al momento.</p>
        ) : (
          products.map((item) => {
            const inCart = cart.find((c) => c.id === item.id);
            return (
              <div key={item.id} className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex justify-between items-center gap-4">
                {item.image_url && (
                  <img src={item.image_url} alt={item.name} className="w-16 h-16 rounded-lg object-cover bg-slate-900" />
                )}
                <div className="flex-1">
                  <h3 className="font-bold text-sm">{item.name}</h3>
                  <p className="text-xs text-slate-400">{item.description}</p>
                  <span className="font-bold text-amber-500 text-sm mt-1 block">€{Number(item.price).toFixed(2)}</span>
                </div>

                <div className="flex items-center gap-2 bg-slate-900 p-1 rounded-lg border border-slate-700">
                  {inCart ? (
                    <>
                      <button onClick={() => removeFromCart(item.id)} className="w-7 h-7 bg-slate-700 hover:bg-slate-600 rounded text-amber-500 font-bold">-</button>
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

      {/* Bar del Carrello Floating in Basso */}
      {totalItems > 0 && (
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

      {/* Modale Checkout */}
      {isCheckoutOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 w-full max-w-md rounded-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-700 pb-3">
              <h2 className="text-lg font-bold">Riepilogo Ordine</h2>
              <button onClick={() => setIsCheckoutOpen(false)} className="text-slate-400 text-sm">Chiudi ✕</button>
            </div>

            {orderSuccess ? (
              <div className="text-center py-8 space-y-2">
                <span className="text-4xl">🎉</span>
                <h3 className="text-xl font-bold text-emerald-400">Ordine Inviato con Successo!</h3>
                <p className="text-slate-400 text-xs">Il ristorante ha ricevuto la tua richiesta.</p>
              </div>
            ) : (
              <form onSubmit={handleSendOrder} className="space-y-4">
                {/* Articoli */}
                <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                  {cart.map((c) => (
                    <div key={c.id} className="flex justify-between text-sm py-1 border-b border-slate-700/50">
                      <span>{c.quantity}x {c.name}</span>
                      <span className="font-semibold">€{(c.price * c.quantity).toFixed(2)}</span>
                    </div>
                  ))}
                </div>

                {/* Tipo Servizio */}
                <div className="grid grid-cols-2 gap-2 pt-2">
                  {restaurant.allow_takeaway && (
                    <button
                      type="button"
                      onClick={() => setOrderType('takeaway')}
                      className={`p-2 rounded-lg text-xs font-bold border ${orderType === 'takeaway' ? 'bg-amber-500 text-slate-900 border-amber-500' : 'bg-slate-900 text-slate-400 border-slate-700'}`}
                    >
                      🥡 Asporto (Ritiro)
                    </button>
                  )}
                  {restaurant.allow_delivery && (
                    <button
                      type="button"
                      onClick={() => setOrderType('delivery')}
                      className={`p-2 rounded-lg text-xs font-bold border ${orderType === 'delivery' ? 'bg-amber-500 text-slate-900 border-amber-500' : 'bg-slate-900 text-slate-400 border-slate-700'}`}
                    >
                      🛵 Consegna (€{Number(restaurant.delivery_fee || 0).toFixed(2)})
                    </button>
                  )}
                </div>

                {/* Dati Cliente */}
                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder="Il tuo Nome e Cognome"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm focus:outline-none focus:border-amber-500"
                    required
                  />

                  <input
                    type="tel"
                    placeholder="Numero di Telefono (es. 3391234567)"
                    value={customerPhone}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm focus:outline-none focus:border-amber-500"
                    required
                  />

                  <textarea
                    rows={2}
                    placeholder="Note aggiuntive (es. citofono, allergie, orario...)"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={sendingOrder}
                  className="w-full bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold p-3 rounded-lg transition-colors text-sm"
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