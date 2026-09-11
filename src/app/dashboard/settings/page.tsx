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

  // Liste orari inseriti uno per uno
  const [orderSlots, setOrderSlots] = useState<string[]>([]);
  const [newOrderSlot, setNewOrderSlot] = useState('');

  const [resSlots, setResSlots] = useState<string[]>([]);
  const [newResSlot, setNewResSlot] = useState('');

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
        setOrderSlots(data.order_time_slots || ['12:00', '12:30', '13:00', '19:30', '20:00', '20:30']);
        setResSlots(data.reservation_time_slots || ['12:30', '13:00', '13:30', '20:00', '20:30', '21:00']);
      }
      setLoading(false);
    };

    fetchRestaurant();
  }, []);

  const addOrderSlot = () => {
    if (newOrderSlot && !orderSlots.includes(newOrderSlot)) {
      setOrderSlots([...orderSlots, newOrderSlot].sort());
      setNewOrderSlot('');
    }
  };

  const removeOrderSlot = (slot: string) => {
    setOrderSlots(orderSlots.filter((s) => s !== slot));
  };

  const addResSlot = () => {
    if (newResSlot && !resSlots.includes(newResSlot)) {
      setResSlots([...resSlots, newResSlot].sort());
      setNewResSlot('');
    }
  };

  const removeResSlot = (slot: string) => {
    setResSlots(resSlots.filter((s) => s !== slot));
  };

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
        order_time_slots: orderSlots,
        reservation_time_slots: resSlots,
      })
      .eq('id', restaurant.id);

    if (!error) {
      setMessage('Impostazioni e orari salvati!');
    } else {
      setMessage(`Errore: ${error.message}`);
    }
    setSaving(false);
  };

  if (loading) return <div className="p-8 text-white bg-slate-900 min-h-screen text-xs">Caricamento...</div>;

  return (
    <div className="min-h-screen bg-slate-900 text-white p-4 sm:p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        
        {/* Header con pulsante di ritorno uniformato */}
        <header className="flex justify-between items-center bg-slate-800 p-5 rounded-xl border border-slate-700">
          <div>
            <span className="text-[10px] text-amber-500 font-bold uppercase tracking-widest">Configurazione</span>
            <h1 className="text-xl font-black">Impostazioni Locale & Gestione Orari</h1>
          </div>
          <Link href="/dashboard" className="bg-slate-700 hover:bg-slate-600 text-xs text-white font-semibold px-3 py-2 rounded-lg transition-colors">
            Torna alla Dashboard
          </Link>
        </header>

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

          {/* Configurazione Orari Ordini (Asporto/Delivery) */}
          <section className="bg-slate-800 p-6 rounded-xl border border-slate-700 space-y-4">
            <h2 className="text-base font-bold text-amber-500">Orari Disponibili per Ordini (Asporto/Delivery)</h2>
            <div className="flex gap-2">
              <input
                type="time"
                value={newOrderSlot}
                onChange={(e) => setNewOrderSlot(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white"
              />
              <button
                type="button"
                onClick={addOrderSlot}
                className="bg-amber-500 text-slate-900 font-bold px-4 py-2 rounded-lg text-xs"
              >
                + Aggiungi Orario Ordine
              </button>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              {orderSlots.map((slot) => (
                <span key={slot} className="bg-slate-900 border border-slate-700 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2">
                  {slot}
                  <button type="button" onClick={() => removeOrderSlot(slot)} className="text-red-400 font-bold hover:text-red-300">✕</button>
                </span>
              ))}
            </div>
          </section>

          {/* Configurazione Orari Prenotazioni Tavoli */}
          <section className="bg-slate-800 p-6 rounded-xl border border-slate-700 space-y-4">
            <h2 className="text-base font-bold text-amber-500">Orari Disponibili per Prenotazione Tavoli</h2>
            <div className="flex gap-2">
              <input
                type="time"
                value={newResSlot}
                onChange={(e) => setNewResSlot(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white"
              />
              <button
                type="button"
                onClick={addResSlot}
                className="bg-amber-500 text-slate-900 font-bold px-4 py-2 rounded-lg text-xs"
              >
                + Aggiungi Orario Prenotazione
              </button>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              {resSlots.map((slot) => (
                <span key={slot} className="bg-slate-900 border border-slate-700 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2">
                  {slot}
                  <button type="button" onClick={() => removeResSlot(slot)} className="text-red-400 font-bold hover:text-red-300">✕</button>
                </span>
              ))}
            </div>
          </section>

          <section className="bg-slate-800 p-6 rounded-xl border border-slate-700 space-y-4">
            <h2 className="text-base font-bold text-amber-500">Servizi</h2>
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={allowTakeaway} 
                  onChange={(e) => setAllowTakeaway(e.target.checked)} 
                  className="w-4 h-4 accent-amber-500 cursor-pointer" 
                />
                <span className="text-xs font-semibold">Abilita Ritiro</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={allowDelivery} 
                  onChange={(e) => setAllowDelivery(e.target.checked)} 
                  className="w-4 h-4 accent-amber-500 cursor-pointer" 
                />
                <span className="text-xs font-semibold">Abilita Consegna</span>
              </label>

              {allowDelivery && (
                <div className="ml-7 space-y-1">
                  <label className="block text-slate-400 text-xs">Costo di consegna (€)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={deliveryFee}
                    onChange={(e) => setDeliveryFee(e.target.value)}
                    className="w-full max-w-xs bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white"
                  />
                  <p className="text-[10px] text-slate-500">
                    Questo importo viene aggiunto al totale solo se il cliente sceglie la consegna.
                  </p>
                </div>
              )}

              <label className="flex items-center gap-3 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={allowReservations} 
                  onChange={(e) => setAllowReservations(e.target.checked)} 
                  className="w-4 h-4 accent-amber-500 cursor-pointer" 
                />
                <span className="text-xs font-semibold">Abilita Prenotazione Tavoli</span>
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