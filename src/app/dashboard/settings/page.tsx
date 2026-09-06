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

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [allowTakeaway, setAllowTakeaway] = useState(true);
  const [allowDelivery, setAllowDelivery] = useState(false);
  const [allowReservations, setAllowReservations] = useState(true);
  const [deliveryFee, setDeliveryFee] = useState('2.50');

  // Configurazione Fasce Orarie Selezionabili dai Clienti
  const [slotStart, setSlotStart] = useState('12:00');
  const [slotEnd, setSlotEnd] = useState('22:30');
  const [slotInterval, setSlotInterval] = useState('15');

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
        setSlotStart(data.time_slot_start || '12:00');
        setSlotEnd(data.time_slot_end || '22:30');
        setSlotInterval((data.time_slot_interval || 15).toString());
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
        time_slot_start: slotStart,
        time_slot_end: slotEnd,
        time_slot_interval: parseInt(slotInterval) || 15,
      })
      .eq('id', restaurant.id);

    if (!error) {
      setMessage('Impostazioni e fasce orarie salvate!');
    } else {
      setMessage(`Errore: ${error.message}`);
    }
    setSaving(false);
  };

  if (loading) return <div className="p-8 text-white bg-slate-900 min-h-screen">Caricamento...</div>;

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <Link href="/dashboard" className="text-sm text-amber-500 font-bold hover:underline">← Torna agli Ordini Live</Link>
        
        <h1 className="text-2xl font-bold">Impostazioni Locale & Fasce Orarie</h1>

        {message && (
          <div className="bg-slate-800 border border-amber-500/50 text-amber-400 p-3 rounded-lg text-xs">
            {message}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-6">
          <section className="bg-slate-800 p-6 rounded-xl border border-slate-700 space-y-4">
            <h2 className="text-base font-bold text-amber-500">Info Ristorante</h2>
            <div>
              <label className="block text-slate-400 text-xs mb-1">Nome Ristorante</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs text-white"
                required
              />
            </div>
            <div>
              <label className="block text-slate-400 text-xs mb-1">Descrizione Locale</label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs text-white"
              />
            </div>
          </section>

          {/* Configurazione Fasce Orarie Prenotabili */}
          <section className="bg-slate-800 p-6 rounded-xl border border-slate-700 space-y-4">
            <h2 className="text-base font-bold text-amber-500">Configurazione Fasce Orarie (Ordini & Prenotazioni)</h2>
            <p className="text-slate-400 text-xs">
              Definisci gli orari di apertura e gli intervalli per le fasce orarie che appariranno nel menu a tendina per i clienti.
            </p>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Orario Inizio</label>
                <input
                  type="time"
                  value={slotStart}
                  onChange={(e) => setSlotStart(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Orario Fine</label>
                <input
                  type="time"
                  value={slotEnd}
                  onChange={(e) => setSlotEnd(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Intervallo Minuti</label>
                <select
                  value={slotInterval}
                  onChange={(e) => setSlotInterval(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white"
                >
                  <option value="15">Ogni 15 min</option>
                  <option value="30">Ogni 30 min</option>
                  <option value="60">Ogni 60 min</option>
                </select>
              </div>
            </div>
          </section>

          <section className="bg-slate-800 p-6 rounded-xl border border-slate-700 space-y-4">
            <h2 className="text-base font-bold text-amber-500">Servizi e Spedizioni</h2>
            
            <div className="space-y-3">
              <label className="flex items-center gap-3">
                <input type="checkbox" checked={allowTakeaway} onChange={(e) => setAllowTakeaway(e.target.checked)} className="w-4 h-4 accent-amber-500" />
                <span className="text-xs">Abilita Asporto</span>
              </label>

              <label className="flex items-center gap-3">
                <input type="checkbox" checked={allowDelivery} onChange={(e) => setAllowDelivery(e.target.checked)} className="w-4 h-4 accent-amber-500" />
                <span className="text-xs">Abilita Delivery</span>
              </label>

              <label className="flex items-center gap-3">
                <input type="checkbox" checked={allowReservations} onChange={(e) => setAllowReservations(e.target.checked)} className="w-4 h-4 accent-amber-500" />
                <span className="text-xs">Abilita Prenotazione Tavoli</span>
              </label>
            </div>
          </section>

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold p-3 rounded-lg transition-colors text-xs"
          >
            {saving ? 'Salvataggio...' : 'Salva Impostazioni'}
          </button>
        </form>
      </div>
    </div>
  );
}