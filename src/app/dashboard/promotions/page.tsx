'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function PromotionsPage() {
  const [restaurant, setRestaurant] = useState<any>(null);
  const [promos, setPromos] = useState<any[]>([]);
  const [discounts, setDiscounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form Promozione / Slide
  const [promoTitle, setPromoTitle] = useState('');
  const [promoDesc, setPromoDesc] = useState('');
  const [promoImg, setPromoImg] = useState('');

  // Form Regola Sconto
  const [minAmount, setMinAmount] = useState('');
  const [discountPercent, setDiscountPercent] = useState('');

  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const fetchData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }

    const { data: restData } = await supabase.from('restaurants').select('*').eq('user_id', user.id).maybeSingle();
    if (!restData) { router.push('/onboarding'); return; }

    setRestaurant(restData);

    const { data: promoData } = await supabase.from('promotions').select('*').eq('restaurant_id', restData.id).order('created_at', { ascending: false });
    const { data: discData } = await supabase.from('discount_rules').select('*').eq('restaurant_id', restData.id).order('min_amount', { ascending: true });

    if (promoData) setPromos(promoData);
    if (discData) setDiscounts(discData);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleAddPromo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promoTitle) return;

    await supabase.from('promotions').insert({
      restaurant_id: restaurant.id,
      title: promoTitle,
      description: promoDesc,
      image_url: promoImg,
    });

    setPromoTitle('');
    setPromoDesc('');
    setPromoImg('');
    fetchData();
  };

  const handleDeletePromo = async (id: string) => {
    await supabase.from('promotions').delete().eq('id', id);
    fetchData();
  };

  const handleAddDiscount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!minAmount || !discountPercent) return;

    await supabase.from('discount_rules').insert({
      restaurant_id: restaurant.id,
      min_amount: parseFloat(minAmount),
      discount_percentage: parseFloat(discountPercent),
    });

    setMinAmount('');
    setDiscountPercent('');
    fetchData();
  };

  const handleDeleteDiscount = async (id: string) => {
    await supabase.from('discount_rules').delete().eq('id', id);
    fetchData();
  };

  if (loading) return <div className="p-8 text-slate-400 bg-slate-900 min-h-screen text-xs">Caricamento in corso...</div>;

  return (
    <div className="min-h-screen bg-slate-900 text-white p-4 sm:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Header con pulsante di ritorno uniformato */}
        <header className="flex justify-between items-center bg-slate-800 p-5 rounded-xl border border-slate-700">
          <div>
            <span className="text-[10px] text-amber-500 font-bold uppercase tracking-widest">Gestione Offerte</span>
            <h1 className="text-xl font-black">Promozioni & Sconti Checkout</h1>
          </div>
          <Link href="/dashboard" className="bg-slate-700 hover:bg-slate-600 text-xs text-white font-semibold px-3 py-2 rounded-lg transition-colors">
            Torna alla Dashboard
          </Link>
        </header>

        {/* SEZIONE 1: Slide Bacheca Promozioni */}
        <section className="bg-slate-800 p-5 rounded-xl border border-slate-700 space-y-4">
          <h2 className="text-sm font-bold text-amber-400 uppercase tracking-wider">1. Slide Bacheca Promozioni (Home)</h2>
          
          <form onSubmit={handleAddPromo} className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-900 p-3 rounded-lg border border-slate-700 text-xs">
            <input
              type="text"
              placeholder="Titolo Promozione (es. Speciale All You Can Eat)"
              value={promoTitle}
              onChange={(e) => setPromoTitle(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded p-2 text-white focus:outline-none focus:border-amber-500"
              required
            />
            <input
              type="text"
              placeholder="Descrizione (es. Sconto 10% dal lunedì al giovedì)"
              value={promoDesc}
              onChange={(e) => setPromoDesc(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded p-2 text-white focus:outline-none focus:border-amber-500"
            />
            <div className="flex gap-2">
              <input
                type="url"
                placeholder="URL Immagine (opzionale)"
                value={promoImg}
                onChange={(e) => setPromoImg(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded p-2 text-white focus:outline-none focus:border-amber-500 w-full"
              />
              <button type="submit" className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold px-4 py-2 rounded shrink-0">
                Aggiungi
              </button>
            </div>
          </form>

          {/* Lista Slide */}
          <div className="space-y-2">
            {promos.length === 0 ? (
              <p className="text-xs text-slate-500 italic">Nessuna slide promozione attiva.</p>
            ) : (
              promos.map((p) => (
                <div key={p.id} className="flex justify-between items-center bg-slate-900/60 p-3 rounded-lg border border-slate-700/60 text-xs">
                  <div>
                    <h3 className="font-bold text-white">{p.title}</h3>
                    {p.description && <p className="text-slate-400 text-[11px]">{p.description}</p>}
                  </div>
                  <button onClick={() => handleDeletePromo(p.id)} className="bg-red-500/10 hover:bg-red-500/20 text-red-400 font-semibold px-2.5 py-1 rounded border border-red-500/20">
                    Elimina
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        {/* SEZIONE 2: Scontistiche al Checkout */}
        <section className="bg-slate-800 p-5 rounded-xl border border-slate-700 space-y-4">
          <h2 className="text-sm font-bold text-amber-400 uppercase tracking-wider">2. Scontistiche Automatiche al Checkout</h2>

          <form onSubmit={handleAddDiscount} className="flex flex-wrap sm:flex-nowrap gap-3 bg-slate-900 p-3 rounded-lg border border-slate-700 text-xs">
            <input
              type="number"
              step="0.01"
              placeholder="Ordine Minimo (€) es. 40"
              value={minAmount}
              onChange={(e) => setMinAmount(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded p-2 text-white focus:outline-none focus:border-amber-500 w-full sm:w-1/2"
              required
            />
            <input
              type="number"
              step="1"
              placeholder="Sconto (%) es. 20"
              value={discountPercent}
              onChange={(e) => setDiscountPercent(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded p-2 text-white focus:outline-none focus:border-amber-500 w-full sm:w-1/2"
              required
            />
            <button type="submit" className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold px-4 py-2 rounded shrink-0">
              Aggiungi
            </button>
          </form>

          {/* Lista Regole */}
          <div className="space-y-2">
            {discounts.length === 0 ? (
              <p className="text-xs text-slate-500 italic">Nessuna regola di sconto attiva.</p>
            ) : (
              discounts.map((d) => (
                <div key={d.id} className="flex justify-between items-center bg-slate-900/60 p-3 rounded-lg border border-slate-700/60 text-xs">
                  <div>
                    <span className="font-bold text-emerald-400">{d.discount_percentage}% di sconto</span>
                    <span className="text-slate-300 ml-2">su ordini pari o superiori a €{Number(d.min_amount).toFixed(2)}</span>
                  </div>
                  <button onClick={() => handleDeleteDiscount(d.id)} className="bg-red-500/10 hover:bg-red-500/20 text-red-400 font-semibold px-2.5 py-1 rounded border border-red-500/20">
                    Elimina
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

      </div>
    </div>
  );
}