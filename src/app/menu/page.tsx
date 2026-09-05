'use client';

import { useEffect, useState, use } from 'react';
import { createBrowserClient } from '@supabase/ssr';

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
}

export default function PublicMenuPage({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = use(params);
  const [restaurant, setRestaurant] = useState<any>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    const fetchRestaurantAndMenu = async () => {
      const { data: restData } = await supabase
        .from('restaurants')
        .select('*')
        .eq('slug', resolvedParams.slug)
        .single();

      if (restData) {
        setRestaurant(restData);
        const { data: prodData } = await supabase
          .from('products')
          .select('*')
          .eq('restaurant_id', restData.id);

        if (prodData) setProducts(prodData);
      }
      setLoading(false);
    };

    fetchRestaurantAndMenu();
  }, [resolvedParams.slug]);

  if (loading) return <div className="p-8 text-white bg-slate-900 min-h-screen">Caricamento menu...</div>;
  if (!restaurant) return <div className="p-8 text-white bg-slate-900 min-h-screen">Ristorante non trovato.</div>;

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <div className="max-w-md mx-auto space-y-6">
        <header className="text-center border-b border-slate-800 pb-4">
          <h1 className="text-3xl font-bold text-amber-500">{restaurant.name}</h1>
          <p className="text-slate-400 text-sm">Menu Digitale</p>
        </header>

        <div className="space-y-4">
          {products.length === 0 ? (
            <p className="text-slate-400 text-center">Nessun piatto presente nel menu.</p>
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