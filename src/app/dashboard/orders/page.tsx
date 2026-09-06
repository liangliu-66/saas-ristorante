'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface OrderItem {
  id: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  notes: string;
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'completed' | 'cancelled';
  guests: number;
  reservation_date: string;
  reservation_time: string;
  created_at: string;
}

export default function LiveOrdersPage() {
  const [restaurant, setRestaurant] = useState<any>(null);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'orders' | 'reservations'>('orders');
  const [newOrderAlert, setNewOrderAlert] = useState(false);

  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const fetchOrders = async (restaurantId: string) => {
    const { data, error } = await supabase
      .from('reservations')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setOrders(data);
    }
  };

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      const { data: restData } = await supabase
        .from('restaurants')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!restData) { router.push('/onboarding'); return; }

      setRestaurant(restData);
      await fetchOrders(restData.id);
      setLoading(false);

      // Sottoscrizione Realtime per nuovi ordini/prenotazioni
      const channel = supabase
        .channel('realtime_orders')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'reservations',
            filter: `restaurant_id=eq.${restData.id}`,
          },
          (payload) => {
            setOrders((prev) => [payload.new as OrderItem, ...prev]);
            setNewOrderAlert(true);
            setTimeout(() => setNewOrderAlert(false), 5000);
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'reservations',
            filter: `restaurant_id=eq.${restData.id}`,
          },
          (payload) => {
            setOrders((prev) =>
              prev.map((o) => (o.id === payload.new.id ? (payload.new as OrderItem) : o))
            );
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    };

    init();
  }, []);

  // Aggiorna lo stato dell'ordine o prenotazione
  const handleStatusChange = async (id: string, newStatus: OrderItem['status']) => {
    const { error } = await supabase
      .from('reservations')
      .update({ status: newStatus })
      .eq('id', id);

    if (!error) {
      setOrders(orders.map((o) => (o.id === id ? { ...o, status: newStatus } : o)));
    } else {
      alert(`Errore aggiornamento: ${error.message}`);
    }
  };

  if (loading) return <div className="p-8 text-white bg-slate-900 min-h-screen">Caricamento ordini live...</div>;

  // Filtra ordini d'asporto e prenotazioni tavoli basandosi sulle note
  const foodOrders = orders.filter((o) => o.notes?.includes('[ORDINE'));
  const tableReservations = orders.filter((o) => !o.notes?.includes('[ORDINE'));

  const currentList = activeTab === 'orders' ? foodOrders : tableReservations;

  const getStatusBadge = (status: OrderItem['status']) => {
    switch (status) {
      case 'pending':
        return <span className="bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2.5 py-1 rounded-full text-xs font-bold">In Attesa</span>;
      case 'confirmed':
        return <span className="bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2.5 py-1 rounded-full text-xs font-bold">Confermato</span>;
      case 'preparing':
        return <span className="bg-purple-500/20 text-purple-400 border border-purple-500/30 px-2.5 py-1 rounded-full text-xs font-bold">In Cucinazione</span>;
      case 'ready':
        return <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2.5 py-1 rounded-full text-xs font-bold">Pronto</span>;
      case 'completed':
        return <span className="bg-slate-700 text-slate-400 border border-slate-600 px-2.5 py-1 rounded-full text-xs font-bold">Completato</span>;
      case 'cancelled':
        return <span className="bg-red-500/20 text-red-400 border border-red-500/30 px-2.5 py-1 rounded-full text-xs font-bold">Annullato</span>;
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* Banner Avviso Nuovo Ordine Realtime */}
        {newOrderAlert && (
          <div className="bg-amber-500 text-slate-900 font-extrabold p-4 rounded-xl shadow-lg animate-bounce flex justify-between items-center">
            <span>🔔 NUOVA RICHIESTA RICEVUTA IN TEMPO REALE!</span>
            <button onClick={() => setNewOrderAlert(false)} className="text-xs bg-slate-900 text-white px-2 py-1 rounded">Chiudi</button>
          </div>
        )}

        {/* Header Dashboard Ordini */}
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-800 p-6 rounded-xl border border-slate-700 gap-4">
          <div>
            <span className="text-xs text-amber-500 font-semibold uppercase tracking-wider">Gestione Live</span>
            <h1 className="text-2xl font-bold">Ordini e Prenotazioni</h1>
            <p className="text-slate-400 text-xs mt-1">{restaurant?.name}</p>
          </div>

          <div className="flex gap-3">
            <Link href="/dashboard" className="bg-slate-700 hover:bg-slate-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
              Menu & Carta
            </Link>
            <Link href="/dashboard/settings" className="bg-slate-700 hover:bg-slate-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
              Impostazioni
            </Link>
          </div>
        </header>

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-800 gap-4">
          <button
            onClick={() => setActiveTab('orders')}
            className={`pb-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'orders' ? 'border-amber-500 text-amber-500' : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <span>🛍️ Ordini d'Asporto / Delivery</span>
            <span className="bg-slate-800 px-2 py-0.5 rounded-full text-xs">{foodOrders.length}</span>
          </button>

          <button
            onClick={() => setActiveTab('reservations')}
            className={`pb-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'reservations' ? 'border-amber-500 text-amber-500' : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <span>📅 Prenotazioni Tavolo</span>
            <span className="bg-slate-800 px-2 py-0.5 rounded-full text-xs">{tableReservations.length}</span>
          </button>
        </div>

        {/* Lista Live */}
        <section className="space-y-4">
          {currentList.length === 0 ? (
            <div className="bg-slate-800 p-8 rounded-xl border border-slate-700 text-center text-slate-400 text-sm">
              Nessuna richiesta ricevuta in questa sezione.
            </div>
          ) : (
            currentList.map((item) => (
              <div key={item.id} className="bg-slate-800 p-6 rounded-xl border border-slate-700 space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-700/60 pb-3">
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="font-bold text-lg">{item.customer_name}</h3>
                      {getStatusBadge(item.status)}
                    </div>
                    <p className="text-xs text-amber-500 font-semibold mt-0.5">
                      📞 {item.customer_phone} {item.customer_email && `| ✉️ ${item.customer_email}`}
                    </p>
                  </div>

                  <div className="text-right text-xs text-slate-400">
                    <div>Data: <strong className="text-white">{item.reservation_date}</strong> ore <strong className="text-white">{item.reservation_time}</strong></div>
                    <div className="text-[10px] text-slate-500">Ricevuto il {new Date(item.created_at).toLocaleString('it-IT')}</div>
                  </div>
                </div>

                {/* Dettaglio Note/Prodotti */}
                <div className="bg-slate-900 p-4 rounded-lg border border-slate-700/80 text-sm text-slate-300">
                  <span className="text-xs font-bold text-slate-400 block mb-1">Dettagli & Note:</span>
                  <p className="whitespace-pre-line leading-relaxed">{item.notes}</p>
                  {activeTab === 'reservations' && (
                    <span className="text-xs text-amber-400 font-semibold mt-2 block">👥 Commensali: {item.guests} persone</span>
                  )}
                </div>

                {/* Pulsanti Cambio Stato */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-xs text-slate-400 mr-2">Aggiorna Stato:</span>
                  
                  {item.status === 'pending' && (
                    <button
                      onClick={() => handleStatusChange(item.id, 'confirmed')}
                      className="bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                    >
                      ✓ Conferma
                    </button>
                  )}

                  {activeTab === 'orders' && item.status === 'confirmed' && (
                    <button
                      onClick={() => handleStatusChange(item.id, 'preparing')}
                      className="bg-purple-500 hover:bg-purple-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                    >
                      🍳 In Preparazione
                    </button>
                  )}

                  {activeTab === 'orders' && item.status === 'preparing' && (
                    <button
                      onClick={() => handleStatusChange(item.id, 'ready')}
                      className="bg-emerald-500 hover:bg-emerald-600 text-slate-900 font-bold text-xs px-3 py-1.5 rounded-lg transition-colors"
                    >
                      🛵 Pronto per Ritiro/Delivery
                    </button>
                  )}

                  {item.status !== 'completed' && item.status !== 'cancelled' && (
                    <button
                      onClick={() => handleStatusChange(item.id, 'completed')}
                      className="bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                    >
                      ✓ Segna Completato
                    </button>
                  )}

                  {item.status !== 'cancelled' && (
                    <button
                      onClick={() => handleStatusChange(item.id, 'cancelled')}
                      className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ml-auto"
                    >
                      Annulla
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </section>

      </div>
    </div>
  );
}