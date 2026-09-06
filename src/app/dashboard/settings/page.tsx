'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function SettingsPage() {
  const [restaurant, setRestaurant] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Form Campi
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [allowTakeaway, setAllowTakeaway] = useState(true);
  const [allowDelivery, setAllowDelivery] = useState(false);
  const [allowReservations, setAllowReservations] = useState(true);
  const [deliveryFee, setDeliveryFee] = useState('2.50');
  const [minDeliveryAmount, setMinDeliveryAmount] = useState('15.00');

  // Orari (Stringhe semplici per gestione rapida)
  const [openingHours, setOpeningHours] = useState('12:00 - 15:00, 19:00 - 23:00');
  const [takeawayHours, setTakeawayHours] = useState('12:00 - 14:30, 19:00 - 22:30');
  const [deliveryHours, setDeliveryHours] = useState('19:00 - 22:30');

  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    const fetchRestaurant = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      const { data } = await supabase
        .from('restaurants')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (data) {
        setRestaurant(data);
        setName(data.name || '');
        setDescription(data.description || '');
        setAllowTakeaway(data.allow_takeaway ?? true);
        setAllowDelivery(data.allow_delivery ?? false);
        setAllowReservations(data.allow_reservations ?? true);
        setDeliveryFee((data.delivery_fee ?? 2.50).toString());
        setMinDeliveryAmount((data.min_delivery_amount ?? 15.00).toString());
        if (data.opening_hours?.text) setOpeningHours(data.opening_hours.text);
        if (data.takeaway_hours?.text) setTakeawayHours(data.takeaway_hours.text);
        if (data.delivery_hours?.text) setDeliveryHours(data.delivery_hours.text);
      }
      setLoading(false);
    };

    fetchRestaurant();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    const { error } = await supabase
      .from('restaurants')
      .update({
        name,
        description,
        allow_takeaway: allowTakeaway,
        allow_delivery: allowDelivery,
        allow_reservations: allowReservations,
        delivery_fee: parseFloat(deliveryFee),
        min_delivery_amount: parseFloat(minDeliveryAmount),
        opening_hours: { text: openingHours },
        takeaway_hours: { text: takeawayHours },
        delivery_hours: { text: deliveryHours },
      })
      .eq('id', restaurant.id);

    if (!error) {
      setMessage('Impostazioni salvate con successo!');
    } else {
      setMessage(`Errore: ${error.message}`);
    }
    setSaving(false);
  };

  if (loading) return <div className="p-8 text-white bg-slate-900 min-h-screen">Caricamento...</div>;

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <Link href="/dashboard" className="text-sm text-slate-400 hover:text-white">← Torna alla Dashboard</Link>
        
        <h1 className="text-2xl font-bold">Gestione Bacheca & Servizi</h1>

        {message && (
          <div className="bg-slate-800 border border-amber-500/50 text-amber-400 p-3 rounded-lg text-sm break-words">
            {message}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-6">
          {/* Info Bacheca */}
          <section className="bg-slate-800 p-6 rounded-xl border border-slate-700 space-y-4">
            <h2 className="text-lg font-bold text-amber-500">Bacheca del Locale</h2>
            <div>
              <label className="block text-slate-400 text-xs mb-1">Nome Ristorante</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm focus:outline-none focus:border-amber-500"
                required
              />
            </div>
            <div>
              <label className="block text-slate-400 text-xs mb-1">Descrizione / Presentazione Locale</label>
              <textarea
                rows={3}
                placeholder="es. Autentica cucina giapponese nel cuore della città..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm focus:outline-none focus:border-amber-500"
              />
            </div>
          </section>

          {/* Abilitazione Servizi */}
          <section className="bg-slate-800 p-6 rounded-xl border border-slate-700 space-y-4">
            <h2 className="text-lg font-bold text-amber-500">Servizi e Regole di Consegna</h2>
            
            <div className="space-y-3">
              <label className="flex items-center gap-3">
                <input type="checkbox" checked={allowTakeaway} onChange={(e) => setAllowTakeaway(e.target.checked)} className="w-4 h-4 accent-amber-500" />
                <span className="text-sm">Abilita Ritiro d'Asporto (Takeaway)</span>
              </label>

              <label className="flex items-center gap-3">
                <input type="checkbox" checked={allowDelivery} onChange={(e) => setAllowDelivery(e.target.checked)} className="w-4 h-4 accent-amber-500" />
                <span className="text-sm">Abilita Consegna a Domicilio (Delivery)</span>
              </label>

              <label className="flex items-center gap-3">
                <input type="checkbox" checked={allowReservations} onChange={(e) => setAllowReservations(e.target.checked)} className="w-4 h-4 accent-amber-500" />
                <span className="text-sm">Abilita Prenotazione Tavoli</span>
              </label>
            </div>

            {allowDelivery && (
              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-700">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Costo Consegna (€)</label>
                  <input
                    type="number" step="0.50"
                    value={deliveryFee}
                    onChange={(e) => setDeliveryFee(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Ordine Minimo (€)</label>
                  <input
                    type="number" step="1.00"
                    value={minDeliveryAmount}
                    onChange={(e) => setMinDeliveryAmount(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm"
                  />
                </div>
              </div>
            )}
          </section>

          {/* Orari Differenziati */}
          <section className="bg-slate-800 p-6 rounded-xl border border-slate-700 space-y-4">
            <h2 className="text-lg font-bold text-amber-500">Orari di Servizio</h2>
            
            <div>
              <label className="block text-xs text-slate-400 mb-1">Orari Apertura Locale (Generale)</label>
              <input
                type="text"
                value={openingHours}
                onChange={(e) => setOpeningHours(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm"
              />
            </div>

            {allowTakeaway && (
              <div>
                <label className="block text-xs text-slate-400 mb-1">Fasce Orarie Ritiro Asporto</label>
                <input
                  type="text"
                  value={takeawayHours}
                  onChange={(e) => setTakeawayHours(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm"
                />
              </div>
            )}

            {allowDelivery && (
              <div>
                <label className="block text-xs text-slate-400 mb-1">Fasce Orarie Consegna a Domicilio</label>
                <input
                  type="text"
                  value={deliveryHours}
                  onChange={(e) => setDeliveryHours(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm"
                />
              </div>
            )}
          </section>

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold p-3 rounded-lg transition-colors"
          >
            {saving ? 'Salvataggio...' : 'Salva Impostazioni'}
          </button>
        </form>
      </div>
    </div>
  );
}