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
  items?: Array<{ name: string; quantity: number; price?: number; itemNote?: string }>;
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'completed' | 'cancelled';
  guests: number;
  party_size?: number;
  reservation_date: string;
  reservation_time: string;
  created_at: string;
}

export default function LiveDashboardPage() {
  const [restaurant, setRestaurant] = useState<any>(null);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'reservations' | 'orders'>('orders');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'confirmed' | 'completed' | 'cancelled'>('all');
  const [newOrderAlert, setNewOrderAlert] = useState(false);

  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});

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
      .order('reservation_time', { ascending: true });

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

      const channel = supabase
        .channel('realtime_live_dashboard')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'reservations',
            filter: `restaurant_id=eq.${restData.id}`,
          },
          (payload) => {
            setOrders((prev) => [...prev, payload.new as OrderItem].sort((a, b) => (a.reservation_time > b.reservation_time ? 1 : -1)));
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

  const toggleExpand = (id: string) => {
    setExpandedCards((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (loading) return <div className="p-8 text-white bg-slate-900 min-h-screen">Caricamento ordini live...</div>;

  const foodOrders = orders.filter((o) => o.notes?.includes('[ORDINE') || (o.items && o.items.length > 0));
  const tableReservations = orders.filter((o) => !o.notes?.includes('[ORDINE') && (!o.items || o.items.length === 0));
  const rawList = activeTab === 'orders' ? foodOrders : tableReservations;

  const filteredList = rawList.filter((item) => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'pending') return item.status === 'pending';
    if (statusFilter === 'confirmed') return item.status === 'confirmed' || item.status === 'preparing' || item.status === 'ready';
    if (statusFilter === 'completed') return item.status === 'completed';
    if (statusFilter === 'cancelled') return item.status === 'cancelled';
    return true;
  });

  const lunchList = filteredList.filter((i) => {
    const hour = parseInt((i.reservation_time || '12:00').split(':')[0], 10);
    return hour < 16;
  });

  const dinnerList = filteredList.filter((i) => {
    const hour = parseInt((i.reservation_time || '12:00').split(':')[0], 10);
    return hour >= 16;
  });

  // Funzione che estrae sia la lista piatti (se era salvata nella stringa) sia la nota pura del cliente
  const parseOrderDetails = (notesStr: string, dbItems?: any[]) => {
    let extractedItems = dbItems && dbItems.length > 0 ? dbItems : [];
    let cleanClientNotes = notesStr || '';

    // Se non ci sono items strutturati nel DB, li estraiamo dalla stringa delle note
    if (extractedItems.length === 0 && notesStr?.includes('Prodotti:')) {
      const parts = notesStr.split('Prodotti:');
      const itemsText = parts[1] || '';
      
      cleanClientNotes = parts[0]
        .replace(/\[ORDINE [^\]]*\]/g, '')
        .replace(/Note:\s*/g, '')
        .replace(/\|/g, '')
        .trim();

      const itemStrings = itemsText.split(',');
      extractedItems = itemStrings.map((str) => {
        const trimmed = str.trim();
        const match = trimmed.match(/^(\d+)x\s+(.*?)(?:\s+\(Modifiche:\s*(.*?)\))?$/);
        if (match) {
          return { quantity: parseInt(match[1]), name: match[2], itemNote: match[3] || '' };
        }
        return { quantity: 1, name: trimmed, itemNote: '' };
      });
    } else {
      cleanClientNotes = cleanClientNotes
        .replace(/\[PRENOTAZIONE TAVOLO\]/g, '')
        .replace(/\[ORDINE [^\]]*\]/g, '')
        .replace(/\(GoogleRef:[^)]*\)/g, '')
        .trim();
    }

    return { items: extractedItems, clientNote: cleanClientNotes };
  };

  const renderCard = (item: OrderItem) => {
    const numPeople = item.guests || item.party_size || 1;
    const isExpanded = !!expandedCards[item.id];
    const { items: orderItems, clientNote } = parseOrderDetails(item.notes, item.items);

    return (
      <div key={item.id} className="bg-slate-800 p-4 rounded-xl border border-slate-700 space-y-3 shadow-sm">
        {/* riga 1: Nome, Persone/Articoli, Orario, Stato */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <h3 className="font-extrabold text-base text-white">{item.customer_name}</h3>
            
            {activeTab === 'reservations' && (
              <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2.5 py-0.5 rounded-md text-xs font-black">
                👥 {numPeople} {numPeople === 1 ? 'persona' : 'persone'}
              </span>
            )}

            <span className="bg-slate-900 text-slate-200 border border-slate-700 px-2 py-0.5 rounded-md text-xs font-mono font-bold">
              🕒 {item.reservation_time}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400 font-medium">{item.reservation_date}</span>
            {item.status === 'pending' && <span className="bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded text-xs font-bold">Da Confermare</span>}
            {item.status === 'confirmed' && <span className="bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded text-xs font-bold">Confermato</span>}
            {item.status === 'preparing' && <span className="bg-purple-500/20 text-purple-400 border border-purple-500/30 px-2 py-0.5 rounded text-xs font-bold">In Preparazione</span>}
            {item.status === 'ready' && <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded text-xs font-bold">Pronto</span>}
            {item.status === 'completed' && <span className="bg-slate-700 text-slate-300 border border-slate-600 px-2 py-0.5 rounded text-xs font-bold">Completato</span>}
            {item.status === 'cancelled' && <span className="bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded text-xs font-bold">Annullato</span>}
          </div>
        </div>

        {/* Visualizzazione Elenco Comanda Piatti */}
        {activeTab === 'orders' && orderItems.length > 0 && (
          <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-700/80 space-y-1.5">
            <span className="text-[10px] uppercase tracking-wider text-amber-500 font-extrabold block">Comanda Piatti Selezionati:</span>
            <div className="divide-y divide-slate-800">
              {orderItems.map((it, idx) => (
                <div key={idx} className="py-1 text-xs flex justify-between items-start">
                  <div>
                    <span className="font-bold text-white">{it.quantity}x {it.name}</span>
                    {it.itemNote && <span className="text-amber-400 text-[11px] block">↳ Modifica: {it.itemNote}</span>}
                  </div>
                  {it.price && <span className="text-slate-400 font-mono">€{(it.price * it.quantity).toFixed(2)}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Dettagli Espandibili (Contatti & Note Cliente Pura) */}
        {isExpanded && (
          <div className="space-y-2 pt-2 border-t border-slate-700/60 transition-all">
            <div className="text-xs text-amber-400 font-semibold flex flex-wrap items-center gap-4">
              <span>📞 {item.customer_phone || 'Nessun telefono'}</span>
              {item.customer_email && <span>✉️ {item.customer_email}</span>}
            </div>

            {clientNote ? (
              <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-700/60 text-xs text-slate-300">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block mb-0.5">Note Cliente:</span>
                <p className="whitespace-pre-line leading-snug">{clientNote}</p>
              </div>
            ) : (
              <p className="text-[11px] text-slate-500 italic">Nessuna nota aggiuntiva specificata dal cliente.</p>
            )}
          </div>
        )}

        {/* riga Azioni: Modifica Stato + Tasto ALTRO */}
        <div className="flex items-center justify-between pt-1 border-t border-slate-700/40">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium">Stato:</span>
            <select
              value={item.status}
              onChange={(e) => handleStatusChange(item.id, e.target.value as OrderItem['status'])}
              className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white font-semibold focus:outline-none focus:border-amber-500 cursor-pointer"
            >
              <option value="pending">⏳ Da Confermare</option>
              <option value="confirmed">✓ Confermato</option>
              {activeTab === 'orders' && <option value="preparing">🍳 In Preparazione</option>}
              {activeTab === 'orders' && <option value="ready">🛵 Pronto</option>}
              <option value="completed">🎉 Completato</option>
              <option value="cancelled">✕ Annullato</option>
            </select>
          </div>

          <button
            onClick={() => toggleExpand(item.id)}
            className="bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold px-3 py-1 rounded-lg transition-colors flex items-center gap-1"
          >
            <span>{isExpanded ? 'Nascondi' : 'Altro'}</span>
            <span className="text-[10px]">{isExpanded ? '▲' : '▼'}</span>
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-4 sm:p-6">
      <div className="max-w-5xl mx-auto space-y-5">
        
        {newOrderAlert && (
          <div className="bg-amber-500 text-slate-900 font-extrabold p-3 rounded-xl shadow-lg animate-bounce flex justify-between items-center text-xs">
            <span>🔔 NUOVA RICHIESTA RICEVUTA IN TEMPO REALE!</span>
            <button onClick={() => setNewOrderAlert(false)} className="bg-slate-900 text-white px-2 py-1 rounded">Chiudi</button>
          </div>
        )}

        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-800 p-4 sm:p-5 rounded-xl border border-slate-700 gap-3">
          <div>
            <span className="text-[10px] text-amber-500 font-bold uppercase tracking-widest">Pannello Live</span>
            <h1 className="text-xl font-black">{restaurant?.name}</h1>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <Link href="/dashboard/orders" className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold px-3 py-2 rounded-lg transition-colors">
              📖 Menu
            </Link>
            <Link href="/dashboard/settings" className="bg-slate-700 hover:bg-slate-600 text-white font-semibold px-3 py-2 rounded-lg transition-colors">
              ⚙️ Impostazioni
            </Link>
            <button onClick={handleLogout} className="bg-red-500/10 hover:bg-red-500/20 text-red-400 font-semibold px-3 py-2 rounded-lg border border-red-500/20 transition-colors">
              Esci
            </button>
          </div>
        </header>

        <div className="flex border-b border-slate-800 gap-4">
          <button
            onClick={() => setActiveTab('orders')}
            className={`pb-2.5 text-xs font-extrabold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'orders' ? 'border-amber-500 text-amber-500' : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <span>🛍️ Ordini Ritiro & Delivery</span>
            <span className="bg-slate-800 px-2 py-0.5 rounded-full text-[10px]">{foodOrders.length}</span>
          </button>

          <button
            onClick={() => setActiveTab('reservations')}
            className={`pb-2.5 text-xs font-extrabold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'reservations' ? 'border-amber-500 text-amber-500' : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <span>📅 Prenotazioni Tavolo</span>
            <span className="bg-slate-800 px-2 py-0.5 rounded-full text-[10px]">{tableReservations.length}</span>
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5 bg-slate-800/60 p-2 rounded-xl border border-slate-700/80 text-xs">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1 rounded-lg font-bold transition-colors ${statusFilter === 'all' ? 'bg-amber-500 text-slate-900' : 'text-slate-400 hover:text-white'}`}
          >
            Tutti ({rawList.length})
          </button>
          <button
            onClick={() => setStatusFilter('pending')}
            className={`px-3 py-1 rounded-lg font-bold transition-colors ${statusFilter === 'pending' ? 'bg-amber-500 text-slate-900' : 'text-slate-400 hover:text-white'}`}
          >
            Da Confermare ({rawList.filter(i => i.status === 'pending').length})
          </button>
          <button
            onClick={() => setStatusFilter('confirmed')}
            className={`px-3 py-1 rounded-lg font-bold transition-colors ${statusFilter === 'confirmed' ? 'bg-amber-500 text-slate-900' : 'text-slate-400 hover:text-white'}`}
          >
            Confermati ({rawList.filter(i => ['confirmed', 'preparing', 'ready'].includes(i.status)).length})
          </button>
          <button
            onClick={() => setStatusFilter('completed')}
            className={`px-3 py-1 rounded-lg font-bold transition-colors ${statusFilter === 'completed' ? 'bg-amber-500 text-slate-900' : 'text-slate-400 hover:text-white'}`}
          >
            Completati ({rawList.filter(i => i.status === 'completed').length})
          </button>
          <button
            onClick={() => setStatusFilter('cancelled')}
            className={`px-3 py-1 rounded-lg font-bold transition-colors ${statusFilter === 'cancelled' ? 'bg-amber-500 text-slate-900' : 'text-slate-400 hover:text-white'}`}
          >
            Annullati ({rawList.filter(i => i.status === 'cancelled').length})
          </button>
        </div>

        {filteredList.length === 0 ? (
          <div className="bg-slate-800 p-8 rounded-xl border border-slate-700 text-center text-slate-400 text-xs">
            Nessun elemento corrisponde ai filtri selezionati.
          </div>
        ) : (
          <div className="space-y-6">
            {lunchList.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center gap-2 border-b border-slate-800 pb-1">
                  <span className="text-amber-500 font-extrabold text-sm uppercase tracking-wider">☀️ PRANZO</span>
                  <span className="text-xs text-slate-400 font-semibold">({lunchList.length})</span>
                </div>
                <div className="space-y-3">
                  {lunchList.map(renderCard)}
                </div>
              </section>
            )}

            {dinnerList.length > 0 && (
              <section className="space-y-3 pt-2">
                <div className="flex items-center gap-2 border-b border-slate-800 pb-1">
                  <span className="text-amber-500 font-extrabold text-sm uppercase tracking-wider">🌙 CENA</span>
                  <span className="text-xs text-slate-400 font-semibold">({dinnerList.length})</span>
                </div>
                <div className="space-y-3">
                  {dinnerList.map(renderCard)}
                </div>
              </section>
            )}
          </div>
        )}

      </div>
    </div>
  );
}