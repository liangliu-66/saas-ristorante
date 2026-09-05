'use client';

import { useEffect, useState, use } from 'react';
import { createBrowserClient } from '@supabase/ssr';

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
}

export default function PublicMenuPage({ params }: { params: Promise<{ slug: string }> }) {
  // Risoluzione asincrona dei parametri per Next.js 15+
  const resolvedParams = use(params);
  const slug = resolvedParams?.slug;

  const [restaurant, setRestaurant] = useState<any>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    if (!slug) return;

    const fetchMenu = async () => {
      // 1. Cerca il ristorante tramite lo slug
      const { data: restData, error: restError } = await supabase
        .from('restaurants')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();

      if (restError) {
        console.error('Errore durante il recupero del ristorante:', restError);
      }

      if (restData) {
        setRestaurant(restData);

        // 2. Cerca i prodotti legati al ristorante
        const { data: prodData } = await supabase
          .from('products')
          .select('*')
          .eq('restaurant_id', restData.id);

        if (prodData) {
          setProducts(prodData);
        }
      }

      setLoading(false);
    };

    fetchMenu();
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-6">
        <p className="text-slate-400">Caricamento menu in corso...</p>
      </div>
    );
  }

  if (!restaurant) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 text-center space-y-3">
        <h1 className="text-2xl font-bold text-red-400">Ristorante Non Trovato</h1>
        <p className="text-slate-400 text-sm max-w-sm">
          Nessun locale associato allo slug <code className="text-amber-500 bg-slate-800 px-2 py-1 rounded">"{slug}"</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <div className="max-w-md mx-auto space-y-6">
        <header className="text-center border-b border-slate-800 pb-4">
          <h1 className="text-3xl font-bold text-amber-500">{restaurant.name}</h1>
          <p className="text-slate-400 text-sm">Menu Digitale</p>
        </header>

        <div className="space-y-4">
          {products.length === 0 ? (
            <p className="text-slate-400 text-center py-8">Nessun piatto presente nel menu.</p>
          ) : (
            products.map((item) => (
              <div key={item.id} className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex justify-between items-center">
                <div>
                  <h3 className="font-bold">{item.name}</h3>
                  <p className="text-xs text-slate-400">{item.description}</p>
                </div>
                <span className="font-bold text-amber-500">€{Number(item.price).toFixed(2)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}