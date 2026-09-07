'use client';

import { useEffect, useState, useRef } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface OrderItem {
  id: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  notes?: string;
  items?: Array<{ name: string; quantity: number; price?: number; itemNote?: string }>;
  total_amount?: number;
  order_type?: 'takeaway' | 'delivery';
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'completed' | 'cancelled';
  guests?: number;
  party_size?: number;
  date: string;
  time: string;
  created_at: string;
  type: 'order' | 'reservation';
}

export default function LiveDashboardPage() {
  const todayDate = new Date().toISOString().split('T')[0];

  const [restaurant, setRestaurant] = useState<any>(null);
  const [ordersList, setOrdersList] = useState<OrderItem[]>([]);
  const [reservationsList, setReservationsList] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'orders' | 'reservations'>('orders');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'confirmed' | 'completed' | 'cancelled'>('all');
  const [selectedDate, setSelectedDate] = useState<string>(todayDate);
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});

  // Gestione Audio
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [isAlarmPlaying, setIsAlarmPlaying] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Controllo protezione accesso e caricamento dati
  useEffect(() => {
    const init = async () => {
      // 1. Verifica autenticazione (Blocca l'accesso se non loggato)
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      const { data: restData } = await supabase
        .from('restaurants')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!restData) { router.push('/onboarding'); return; }

      setRestaurant(restData);
      await fetchAllData(restData.id);
      setLoading(false);

      // Realtime Ordini
      const ordersChannel = supabase
        .channel('realtime_orders')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restData.id}` },
          (payload) => {
            if (payload.eventType === 'INSERT') {
              const newOrd: OrderItem = { 
                ...payload.new as any, 
                date: payload.new.pickup_date, 
                time: payload.new.pickup_time || '12:00', 
                type: 'order' 
              };
              setOrdersList((prev) => [...prev, newOrd].sort((a, b) => (a.time > b.time ? 1 : -1)));
              
              if (newOrd.status === 'pending') {
                setIsAlarmPlaying(true);
              }
            } else if (payload.eventType === 'UPDATE') {
              setOrdersList((prev) => {
                const updated = prev.map((o) => (o.id === payload.new.id ? { ...payload.new as any, date: payload.new.pickup_date, time: payload.new.pickup_time || '12:00', type: 'order' } : o));
                if (!updated.some((o) => o.status === 'pending' && o.date === todayDate)) {
                  setIsAlarmPlaying(false);
                }
                return updated;
              });
            }
          }
        )
        .subscribe();

      // Realtime Prenotazioni
      const reservationsChannel = supabase
        .channel('realtime_reservations')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'reservations', filter: `restaurant_id=eq.${restData.id}` },
          (payload) => {
            if (payload.eventType === 'INSERT') {
              const newRes: OrderItem = { 
                ...payload.new as any, 
                date: payload.new.reservation_date, 
                time: payload.new.reservation_time || '12:00', 
                type: 'reservation' 
              };
              setReservationsList((prev) => [...prev, newRes].sort((a, b) => (a.time > b.time ? 1 : -1)));
              
              if (audioEnabled) {
                playBeep(659.25, 0.2, 'sine');
                setTimeout(() => playBeep(880, 0.3, 'sine'), 150);
              }
            } else if (payload.eventType === 'UPDATE') {
              setReservationsList((prev) => 
                prev.map((r) => (r.id === payload.new.id ? { ...r, ...payload.new as any, date: payload.new.reservation_date, time: payload.new.reservation_time || '12:00', type: 'reservation' } : r))
              );
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(ordersChannel);
        supabase.removeChannel(reservationsChannel);
      };
    };

    init();
  }, [audioEnabled, router, supabase]);

  const getAudioContext = () => {
    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        audioCtxRef.current = new AudioCtx();
      }
    }
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  };

  const playBeep = (freq = 880, duration = 0.3, type: OscillatorType = 'sawtooth') => {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.9, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {
      console.error('Errore riproduzione suono:', e);
    }
  };

  const enableAudio = () => {
    const ctx = getAudioContext();
    if (ctx) {
      ctx.resume().then(() => {
        setAudioEnabled(true);
        playBeep(880, 0.3, 'sine');
      });
    } else {
      setAudioEnabled(true);
    }
  };

  const testSound = () => {
    enableAudio();
    playBeep(987.77, 0.2, 'triangle');
    setTimeout(() => playBeep(1318.51, 0.4, 'triangle'), 200);
  };

  const fetchAllData = async (restaurantId: string) => {
    const { data: ordData } = await supabase
      .from('orders')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('pickup_time', { ascending: true });

    const { data: resData } = await supabase
      .from('reservations')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('reservation_time', { ascending: true });

    if (ordData) {
      const formatted = ordData.map((o) => ({
        ...o,
        date: o.pickup_date,
        time: o.pickup_time || '12:00',
        type: 'order' as const,
      }));
      setOrdersList(formatted);

      if (formatted.some((o) => o.status === 'pending' && o.date === todayDate)) {
        setIsAlarmPlaying(true);
      }
    }

    if (resData) {
      setReservationsList(
        resData.map((r) => ({
          ...r,
          date: r.reservation_date,
          time: r.reservation_time || '12:00',
          type: 'reservation' as const,
        }))
      );
    }
  };

  useEffect(() => {
    let intervalId: any;
    if (isAlarmPlaying && audioEnabled) {
      intervalId = setInterval(() => {
        playBeep(850, 0.25, 'sawtooth');
        setTimeout(() => playBeep(1200, 0.25, 'sawtooth'), 250);
      }, 1200);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isAlarmPlaying, audioEnabled]);

  const handleStatusChange = async (id: string, type: 'order' | 'reservation', newStatus: OrderItem['status']) => {
    const tableName = type === 'order' ? 'orders' : 'reservations';
    const { error } = await supabase.from(tableName).update({ status: newStatus }).eq('id', id);

    if (!error) {
      let targetItem: OrderItem | undefined;

      if (type === 'order') {
        setOrdersList((prev) => {
          const nextList = prev.map((o) => {
            if (o.id === id) {
              targetItem = { ...o, status: newStatus };
              return targetItem;
            }
            return o;
          });
          return nextList;
        });
      } else {
        setReservationsList((prev) => prev.map((r) => (r.id === id ? { ...r, status: newStatus } : r)));
      }

      // <--- INCOLLA QUI IL FETCH PER L'API --->
      // Trova l'elemento corrente (sia esso ordine o prenotazione) per recuperarne i dati
      const currentItem = type === 'order' 
        ? ordersList.find(o => o.id === id) 
        : reservationsList.find(r => r.id === id);

      if (currentItem) {
        await fetch('/api/notify-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: currentItem.id,
            customerPhone: currentItem.customer_phone,
            customerEmail: currentItem.customer_email,
            customerName: currentItem.customer_name,
            newStatus: newStatus,
            orderType: currentItem.order_type,
            pickupTime: currentItem.time,
            type: type, // 'order' oppure 'reservation'
            restaurantName: restaurant?.name,
            totalAmount: currentItem.total_amount,
          }),
        }).catch((err) => console.error('Errore chiamata API notifiche:', err));
      }
      // ----------------------------------------

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

  if (loading) return <div className="p-8 text-slate-400 bg-slate-900 min-h-screen text-xs">Caricamento in corso...</div>;

  const currentRawList = activeTab === 'orders' ? ordersList : reservationsList;
  const dateFilteredList = currentRawList.filter((item) => item.date === selectedDate);

  const finalFilteredList = dateFilteredList.filter((item) => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'pending') return item.status === 'pending';
    if (statusFilter === 'confirmed') return item.status === 'confirmed' || item.status === 'preparing' || item.status === 'ready';
    if (statusFilter === 'completed') return item.status === 'completed';
    if (statusFilter === 'cancelled') return item.status === 'cancelled';
    return true;
  });

  const lunchList = finalFilteredList.filter((i) => {
    const hour = parseInt((i.time || '12:00').split(':')[0], 10);
    return hour < 16;
  });

  const dinnerList = finalFilteredList.filter((i) => {
    const hour = parseInt((i.time || '12:00').split(':')[0], 10);
    return hour >= 16;
  });

  const renderCard = (item: OrderItem) => {
    const numPeople = item.guests || item.party_size || 1;
    const isExpanded = !!expandedCards[item.id];

    return (
      <div key={item.id} className="bg-slate-800/80 p-4 rounded-xl border border-slate-700/80 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <h3 className="font-bold text-sm text-white">{item.customer_name}</h3>
            
            {item.type === 'reservation' && (
              <span className="bg-slate-900 text-slate-300 border border-slate-700 px-2.5 py-0.5 rounded-md text-[11px] font-medium">
                {numPeople} {numPeople === 1 ? 'persona' : 'persone'}
              </span>
            )}

            {item.type === 'order' && (
              <span className="bg-slate-900 text-slate-300 border border-slate-700 px-2 py-0.5 rounded-md text-[11px] font-medium uppercase tracking-wider">
                {item.order_type === 'delivery' ? 'Consegna' : 'Ritiro'}
              </span>
            )}

            <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-md text-[11px] font-mono font-bold">
              {item.time}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400">{item.date}</span>
            {item.status === 'pending' && <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded text-[11px] font-semibold animate-pulse">Da Confermare</span>}
            {item.status === 'confirmed' && <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded text-[11px] font-semibold">Confermato</span>}
            {item.status === 'preparing' && <span className="bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded text-[11px] font-semibold">In Cucinazione</span>}
            {item.status === 'ready' && <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded text-[11px] font-semibold">Pronto</span>}
            {item.status === 'completed' && <span className="bg-slate-700/60 text-slate-300 border border-slate-600 px-2 py-0.5 rounded text-[11px] font-semibold">Completato</span>}
            {item.status === 'cancelled' && <span className="bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded text-[11px] font-semibold">Annullato</span>}
          </div>
        </div>

        {item.type === 'order' && item.items && item.items.length > 0 && (
          <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-700/60 space-y-1.5">
            <div className="flex justify-between items-center border-b border-slate-800 pb-1 text-[11px]">
              <span className="uppercase tracking-wider text-slate-400 font-bold">Comanda:</span>
              {item.total_amount && <span className="font-mono text-emerald-400 font-bold">Totale: €{Number(item.total_amount).toFixed(2)}</span>}
            </div>
            <div className="divide-y divide-slate-800/60">
              {item.items.map((it, idx) => (
                <div key={idx} className="py-1 text-xs flex justify-between items-start">
                  <div>
                    <span className="font-semibold text-white">{it.quantity}x {it.name}</span>
                    {it.itemNote && <span className="text-slate-400 text-[11px] block italic">Note: {it.itemNote}</span>}
                  </div>
                  {it.price && <span className="text-slate-400 font-mono text-[11px]">€{(it.price * it.quantity).toFixed(2)}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {isExpanded && (
          <div className="space-y-2 pt-2 border-t border-slate-700/60 transition-all">
            <div className="text-xs text-slate-300 font-mono flex flex-wrap items-center gap-4">
              <span>Tel: {item.customer_phone || 'N/D'}</span>
              {item.customer_email && <span>Email: {item.customer_email}</span>}
            </div>

            {item.notes ? (
              <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-700/40 text-xs text-slate-300">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block mb-0.5">Note:</span>
                <p className="whitespace-pre-line leading-snug">{item.notes}</p>
              </div>
            ) : (
              <p className="text-[11px] text-slate-500 italic">Nessuna nota specificata.</p>
            )}
          </div>
        )}

        <div className="flex items-center justify-between pt-1 border-t border-slate-700/40">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium">Stato:</span>
            <select
              value={item.status}
              onChange={(e) => handleStatusChange(item.id, item.type, e.target.value as OrderItem['status'])}
              className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white font-medium focus:outline-none focus:border-amber-500 cursor-pointer"
            >
              <option value="pending">Da Confermare</option>
              <option value="confirmed">Confermato</option>
              {item.type === 'order' && <option value="preparing">In Cucinazione</option>}
              {item.type === 'order' && <option value="ready">Pronto</option>}
              <option value="completed">Completato</option>
              <option value="cancelled">Annullato</option>
            </select>
          </div>

          <button
            onClick={() => toggleExpand(item.id)}
            className="bg-slate-700/70 hover:bg-slate-700 text-slate-300 text-xs font-semibold px-3 py-1 rounded-lg transition-colors"
          >
            {isExpanded ? 'Comprimi' : 'Dettagli'}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-4 sm:p-6">
      <div className="max-w-5xl mx-auto space-y-5">
        
        {/* Banner Allarme Attivo */}
        {isAlarmPlaying && (
          <div className="bg-amber-500 text-slate-900 font-black p-3 rounded-xl shadow-lg animate-pulse flex justify-between items-center text-xs">
            <span>ORDINI IN ATTESA DI CONFERMA!</span>
            <button onClick={() => setIsAlarmPlaying(false)} className="bg-slate-900 text-white px-2.5 py-1 rounded text-[11px]">Silenzia Audio</button>
          </div>
        )}

        {/* Header Gestore */}
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-800 p-4 sm:p-5 rounded-xl border border-slate-700 gap-3">
          <div>
            <span className="text-[10px] text-amber-500 font-bold uppercase tracking-widest">Pannello Live</span>
            <h1 className="text-xl font-black">{restaurant?.name}</h1>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs w-full sm:w-auto">
            <button
              onClick={enableAudio}
              className={`px-3 py-2 rounded-lg font-bold border transition ${
                audioEnabled ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border-amber-500/40 animate-pulse'
              }`}
            >
              {audioEnabled ? 'Audio Attivo' : 'Attiva Audio'}
            </button>

            <button
              onClick={testSound}
              className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-2 rounded-lg font-semibold border border-slate-600 transition"
            >
              Test Audio
            </button>

            <Link 
              href="/dashboard/promotions" 
              className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 font-bold px-3 py-2 rounded-lg transition-colors flex items-center gap-1"
            >
              Promozioni
            </Link>

            {/* TASTO MENU AGGANCIATO CORRETTAMENTE ALLO SLUG */}
            <Link 
              href={restaurant?.slug ? `/menu/${restaurant.slug}` : '/dashboard/menu'} 
              className="bg-slate-700 hover:bg-slate-600 text-white font-semibold px-3 py-2 rounded-lg transition-colors"
            >
              Menu
            </Link>
            
            <Link href="/dashboard/settings" className="bg-slate-700 hover:bg-slate-600 text-white font-semibold px-3 py-2 rounded-lg transition-colors">
              Impostazioni
            </Link>
            
            <button onClick={handleLogout} className="bg-red-500/10 hover:bg-red-500/20 text-red-400 font-semibold px-3 py-2 rounded-lg border border-red-500/20 transition-colors">
              Esci
            </button>
          </div>
        </header>

        {/* Selezione Data e Tabs */}
        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex gap-2 text-xs">
            <button
              onClick={() => setActiveTab('orders')}
              className={`px-4 py-2 rounded-lg font-bold transition-colors ${
                activeTab === 'orders' ? 'bg-amber-500 text-slate-900' : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-700'
              }`}
            >
              Ordini Ritiro & Delivery ({ordersList.filter(o => o.date === selectedDate).length})
            </button>

            <button
              onClick={() => setActiveTab('reservations')}
              className={`px-4 py-2 rounded-lg font-bold transition-colors ${
                activeTab === 'reservations' ? 'bg-amber-500 text-slate-900' : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-700'
              }`}
            >
              Prenotazioni Tavolo ({reservationsList.filter(r => r.date === selectedDate).length})
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium">Data:</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white font-semibold focus:outline-none focus:border-amber-500"
            />
            {selectedDate !== todayDate && (
              <button
                onClick={() => setSelectedDate(todayDate)}
                className="bg-slate-700 hover:bg-slate-600 text-xs text-slate-200 px-2.5 py-2 rounded-lg font-medium transition"
              >
                Oggi
              </button>
            )}
          </div>
        </div>

        {/* Filtri per Stato */}
        <div className="flex flex-wrap gap-1.5 bg-slate-800/60 p-2 rounded-xl border border-slate-700/80 text-xs">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1 rounded-lg font-semibold transition-colors ${statusFilter === 'all' ? 'bg-amber-500 text-slate-900 font-bold' : 'text-slate-400 hover:text-white'}`}
          >
            Tutti ({dateFilteredList.length})
          </button>
          <button
            onClick={() => setStatusFilter('pending')}
            className={`px-3 py-1 rounded-lg font-semibold transition-colors ${statusFilter === 'pending' ? 'bg-amber-500 text-slate-900 font-bold' : 'text-slate-400 hover:text-white'}`}
          >
            Da Confermare ({dateFilteredList.filter(i => i.status === 'pending').length})
          </button>
          <button
            onClick={() => setStatusFilter('confirmed')}
            className={`px-3 py-1 rounded-lg font-semibold transition-colors ${statusFilter === 'confirmed' ? 'bg-amber-500 text-slate-900 font-bold' : 'text-slate-400 hover:text-white'}`}
          >
            Confermati ({dateFilteredList.filter(i => ['confirmed', 'preparing', 'ready'].includes(i.status)).length})
          </button>
          <button
            onClick={() => setStatusFilter('completed')}
            className={`px-3 py-1 rounded-lg font-semibold transition-colors ${statusFilter === 'completed' ? 'bg-amber-500 text-slate-900 font-bold' : 'text-slate-400 hover:text-white'}`}
          >
            Completati ({dateFilteredList.filter(i => i.status === 'completed').length})
          </button>
          <button
            onClick={() => setStatusFilter('cancelled')}
            className={`px-3 py-1 rounded-lg font-semibold transition-colors ${statusFilter === 'cancelled' ? 'bg-amber-500 text-slate-900 font-bold' : 'text-slate-400 hover:text-white'}`}
          >
            Annullati ({dateFilteredList.filter(i => i.status === 'cancelled').length})
          </button>
        </div>

        {/* Elenco Sezionato Pranzo / Cena */}
        {finalFilteredList.length === 0 ? (
          <div className="bg-slate-800 p-8 rounded-xl border border-slate-700 text-center text-slate-400 text-xs">
            Nessun elemento registrato per la data del {selectedDate}.
          </div>
        ) : (
          <div className="space-y-6">
            {lunchList.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center gap-2 border-b border-slate-800 pb-1">
                  <span className="text-amber-500 font-extrabold text-xs uppercase tracking-wider">Pranzo</span>
                  <span className="text-xs text-slate-400">({lunchList.length})</span>
                </div>
                <div className="space-y-3">
                  {lunchList.map(renderCard)}
                </div>
              </section>
            )}

            {dinnerList.length > 0 && (
              <section className="space-y-3 pt-2">
                <div className="flex items-center gap-2 border-b border-slate-800 pb-1">
                  <span className="text-amber-500 font-extrabold text-xs uppercase tracking-wider">Cena</span>
                  <span className="text-xs text-slate-400">({dinnerList.length})</span>
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