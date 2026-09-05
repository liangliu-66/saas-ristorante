'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
}

export default function DashboardPage() {
  const [restaurant, setRestaurant] = useState<any>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // Form stato nuovo prodotto
  const [prodName, setProdName] = useState('');
  const [prodDesc, setProdDesc] = useState('');
  const [prodPrice, setProdPrice] = useState('');
  const [saving, setSaving] = useState(false);

  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const fetchRestaurantAndProducts = async () => {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      router.push('/login');
      return;
    }

    const { data: restData } = await supabase
      .from('restaurants')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!restData) {
      router.push('/onboarding');
      return;
    }

    setRestaurant(restData);

    // Recupera i prodotti del ristorante
    const { data: prodData } = await supabase
      .from('products')
      .select('*')
      .eq('restaurant_id', restData.id)
      .order('created_at', { ascending: false });

    if (prodData) setProducts(prodData);
    setLoading(false);
  };

  useEffect(() => {
    fetchRestaurantAndProducts();
  }, []);

  // Aggiungi un piatto
  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prodName || !prodPrice) return;
    setSaving(true);

    const { error } = await supabase.from('products').insert([
      {
        restaurant_id: restaurant.id,
        name: prodName,
        description: prodDesc,
        price: parseFloat(prodPrice),
      },
    ]);

    if (!error) {
      setProdName('');
      setProdDesc('');
      setProdPrice('');
      fetchRestaurantAndProducts();
    } else {
      alert(`Errore nel salvataggio: ${error.message}`);
    }
    setSaving(false);
  };

  // Elimina un piatto
  const handleDeleteProduct = async (id: string) => {
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (!error) {
      setProducts(products.filter((p) => p.id !== id));
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  if (loading) return <div className="p-8 text-white bg-slate-900 min-h-screen">Caricamento...</div>;

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Header */}
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-800 p-6 rounded-xl border border-slate-700 gap-4">
          <div>
            <span className="text-xs text-amber-500 font-semibold uppercase tracking-wider">Locale Attivo</span>
            <h1 className="text-2xl font-bold">{restaurant?.name}</h1>
            <p className="text-slate-400 text-xs mt-1">
              URL Menu: <a href={`/menu/${restaurant?.slug}`} target="_blank" className="text-amber-500 hover:underline">/menu/{restaurant?.slug}</a>
            </p>
          </div>

          <div className="flex gap-3">
            <Link
              href="/dashboard/settings"
              className="bg-slate-700 hover:bg-slate-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              Impostazioni
            </Link>
            <button
              onClick={handleLogout}
              className="bg-red-500/10 hover:bg-red-500/20 text-red-400 text-sm font-semibold px-4 py-2 rounded-lg border border-red-500/20 transition-colors"
            >
              Esci
            </button>
          </div>
        </header>

        {/* Form Aggiungi Piatto */}
        <section className="bg-slate-800 p-6 rounded-xl border border-slate-700 space-y-4">
          <h2 className="text-lg font-bold">Aggiungi un Piatto al Menu</h2>
          
          <form onSubmit={handleAddProduct} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <input
              type="text"
              placeholder="Nome Piatto (es. Roll Salmon)"
              value={prodName}
              onChange={(e) => setProdName(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm focus:outline-none focus:border-amber-500"
              required
            />

            <input
              type="text"
              placeholder="Descrizione (es. Salmone, Avocado)"
              value={prodDesc}
              onChange={(e) => setProdDesc(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm focus:outline-none focus:border-amber-500"
            />

            <div className="flex gap-2">
              <input
                type="number"
                step="0.01"
                placeholder="Prezzo (€)"
                value={prodPrice}
                onChange={(e) => setProdPrice(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm focus:outline-none focus:border-amber-500"
                required
              />
              <button
                type="submit"
                disabled={saving}
                className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold px-4 py-3 rounded-lg transition-colors whitespace-nowrap"
              >
                {saving ? '+' : 'Aggiungi'}
              </button>
            </div>
          </form>
        </section>

        {/* Lista Piatti */}
        <section className="bg-slate-800 p-6 rounded-xl border border-slate-700 space-y-4">
          <h2 className="text-lg font-bold">Piatti nel Menu ({products.length})</h2>

          {products.length === 0 ? (
            <p className="text-slate-400 text-sm">Nessun piatto inserito. Usa il modulo sopra per aggiungere il primo!</p>
          ) : (
            <div className="divide-y divide-slate-700">
              {products.map((item) => (
                <div key={item.id} className="py-3 flex justify-between items-center">
                  <div>
                    <h3 className="font-bold">{item.name}</h3>
                    <p className="text-xs text-slate-400">{item.description}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-bold text-amber-500">€{Number(item.price).toFixed(2)}</span>
                    <button
                      onClick={() => handleDeleteProduct(item.id)}
                      className="text-red-400 hover:text-red-300 text-xs border border-red-500/20 bg-red-500/10 px-2 py-1 rounded"
                    >
                      Elimina
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>
    </div>
  );
}