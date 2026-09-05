'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { ShoppingBag, Utensils, Check } from 'lucide-react';

type Product = {
  id: string;
  name: string;
  price: number;
  description?: string;
  is_available?: boolean;
};

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<{ id: string; name: string; price: number; qty: number }[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [submitted, setSubmitted] = useState(false);

  // Scarica i piatti da Supabase
  useEffect(() => {
    async function fetchProducts() {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('name');

      if (!error && data) {
        setProducts(data);
      }
      setLoading(false);
    }

    fetchProducts();
  }, []);

  const addToCart = (item: Product) => {
    setCart((prev) => {
      const exists = prev.find((i) => i.id === item.id);
      if (exists) {
        return prev.map((i) => (i.id === item.id ? { ...i, qty: i.qty + 1 } : i));
      }
      return [...prev, { id: item.id, name: item.name, price: item.price, qty: 1 }];
    });
  };

  const totalAmount = cart.reduce((acc, i) => acc + i.price * i.qty, 0);

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone || cart.length === 0) return;

    const { data: restaurants } = await supabase.from('restaurants').select('id').limit(1);
    const restaurantId = restaurants?.[0]?.id || null;

    const { error } = await supabase.from('orders').insert([
      {
        restaurant_id: restaurantId,
        customer_name: name,
        customer_phone: phone,
        total_amount: totalAmount,
        pickup_time: new Date(Date.now() + 30 * 60000).toISOString(),
        status: 'pending',
      },
    ]);

    if (!error) {
      setSubmitted(true);
      setCart([]);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 pb-20">
      <header className="bg-orange-600 text-white p-6 shadow-md">
        <div className="max-w-xl mx-auto flex items-center gap-3">
          <Utensils className="w-8 h-8" />
          <div>
            <h1 className="text-xl font-bold">Pizzeria da Mario</h1>
            <p className="text-orange-100 text-sm">Ordina d'asporto in pochi tap</p>
          </div>
        </div>
      </header>

      <div className="max-w-xl mx-auto p-4">
        {submitted ? (
          <div className="bg-emerald-100 border border-emerald-400 text-emerald-800 rounded-xl p-6 text-center my-8">
            <Check className="w-12 h-12 text-emerald-600 mx-auto mb-2" />
            <h2 className="text-xl font-bold mb-1">Ordine Inviato!</h2>
            <p className="text-sm">Il ristorante ha ricevuto la tua richiesta e la sta elaborando.</p>
          </div>
        ) : (
          <>
            <h2 className="text-lg font-bold mb-4 mt-2">Il nostro Menu</h2>

            {loading ? (
              <p className="text-slate-500 text-sm">Caricamento menu in corso...</p>
            ) : (
              <div className="flex flex-col gap-3 mb-8">
                {products.map((item) => {
                  const isAvailable = item.is_available ?? true;
                  return (
                    <div key={item.id} className="bg-white border rounded-xl p-4 shadow-sm flex justify-between items-center">
                      <div>
                        <h3 className="font-semibold">{item.name}</h3>
                        <p className="text-xs text-slate-500 mb-2">{item.description}</p>
                        <span className="font-bold text-orange-600">€{item.price.toFixed(2)}</span>
                      </div>
                      <button
                        disabled={!isAvailable}
                        onClick={() => addToCart(item)}
                        className={`font-bold px-4 py-2 rounded-lg text-sm transition ${
                          isAvailable
                            ? 'bg-orange-100 hover:bg-orange-200 text-orange-700'
                            : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                        }`}
                      >
                        {isAvailable ? '+ Aggiungi' : 'Esaurito'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {cart.length > 0 && (
              <form onSubmit={handleSubmitOrder} className="bg-white border rounded-xl p-5 shadow-lg">
                <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
                  <ShoppingBag className="text-orange-600" /> Il tuo Carrello (€{totalAmount.toFixed(2)})
                </h3>
                <div className="divide-y mb-4">
                  {cart.map((i) => (
                    <div key={i.id} className="py-2 flex justify-between text-sm">
                      <span>{i.qty}x {i.name}</span>
                      <span className="font-semibold">€{(i.price * i.qty).toFixed(2)}</span>
                    </div>
                  ))}
                </div>

                <div className="space-y-3 border-t pt-4">
                  <input
                    type="text"
                    placeholder="Il tuo Nome e Cognome"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full border rounded-lg p-2.5 text-sm focus:outline-orange-500"
                  />
                  <input
                    type="tel"
                    placeholder="Numero di Cellulare"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full border rounded-lg p-2.5 text-sm focus:outline-orange-500"
                  />
                  <button
                    type="submit"
                    className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 rounded-xl shadow-md text-sm"
                  >
                    Conferma e Invia Ordine
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </main>
  );
}
