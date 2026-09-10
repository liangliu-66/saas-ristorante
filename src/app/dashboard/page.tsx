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
  
  const [pendingFutureDates, setPendingFutureDates] = useState<string[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Stato per la gestione della modale/pannello di modifica
  const [editingItem, setEditingItem] = useState<OrderItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editGuests, setEditGuests] = useState(1);
  const [editNotes, setEditNotes] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const [audioEnabled, setAudioEnabled] = useState(false);
  const [isAlarmPlaying, setIsAlarmPlaying] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    const init = async () => {
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

      const ordersChannel = supabase
        .channel('realtime_orders')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restData.id}` },
          (payload) => {
            if (payload.eventType === 'INSERT') {
              const rawPickup = payload.new.pickup_time || '';
              const orderDate = rawPickup.includes(' ') ? rawPickup.split(' ')[0] : (payload.new.pickup_date || todayDate);
              const orderTime = rawPickup.includes(' ') ? rawPickup.split(' ')[1] : (rawPickup || '12:00');

              const newOrd: OrderItem = { 
                ...payload.new as any, 
                date: orderDate, 
                time: orderTime, 
                type: 'order' 
              };

              setOrdersList((prev) => {
                const updated = [...prev, newOrd].sort((a, b) => (a.time > b.time ? 1 : -1));
                updatePendingFutureCheck(updated, reservationsList);
                return updated;
              });
              
              if (newOrd.status === 'pending') {
                setIsAlarmPlaying(true);
              }
            } else if (payload.eventType === 'UPDATE') {
              setOrdersList((prev) => {
                const rawPickup = payload.new.pickup_time || '';
                const orderDate = rawPickup.includes(' ') ? rawPickup.split(' ')[0] : (payload.new.pickup_date || todayDate);
                const orderTime = rawPickup.includes(' ') ? rawPickup.split(' ')[1] : (rawPickup || '12:00');

                const updated = prev.map((o) => (o.id === payload.new.id ? { ...payload.new as any, date: orderDate, time: orderTime, type: 'order' } : o));
                if (!updated.some((o) => o.status === 'pending' && o.date === todayDate)) {
                  setIsAlarmPlaying(false);
                }
                updatePendingFutureCheck(updated, reservationsList);
                return updated;
              });
            }
          }
        )
        .subscribe();

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
              setReservationsList((prev) => {
                const updated = [...prev, newRes].sort((a, b) => (a.time > b.time ? 1 : -1));
                updatePendingFutureCheck(ordersList, updated);
                return updated;
              });
              
              if (audioEnabled) {
                playBeep(659.25, 0.2, 'sine');
                setTimeout(() => playBeep(880, 0.3, 'sine'), 150);
              }
            } else if (payload.eventType === 'UPDATE') {
              setReservationsList((prev) => {
                const updated = prev.map((r) => (r.id === payload.new.id ? { ...r, ...payload.new as any, date: payload.new.reservation_date, time: payload.new.reservation_time || '12:00', type: 'reservation' } : r));
                updatePendingFutureCheck(ordersList, updated);
                return updated;
              });
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
  }, [audioEnabled, router, supabase, todayDate]);

  const updatePendingFutureCheck = (ords: OrderItem[], resrs: OrderItem[]) => {
    const datesSet = new Set<string>();
    ords.forEach((o) => {
      if (o.date && o.date > todayDate && o.status === 'pending') {
        datesSet.add(o.date);
      }
    });
    resrs.forEach((r) => {
      if (r.date && r.date > todayDate && r.status === 'pending') {
        datesSet.add(r.date);
      }
    });
    setPendingFutureDates(Array.from(datesSet).sort());
  };

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

  const toggleAudio = () => {
    if (!audioEnabled) {
      const ctx = getAudioContext();
      if (ctx) {
        ctx.resume().then(() => {
          setAudioEnabled(true);
          playBeep(880, 0.3, 'sine');
        });
      } else {
        setAudioEnabled(true);
      }
    } else {
      setAudioEnabled(false);
      setIsAlarmPlaying(false);
    }
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

    let formattedOrders: OrderItem[] = [];
    let formattedResrs: OrderItem[] = [];

    if (ordData) {
      formattedOrders = ordData.map((o) => {
        const rawPickup = o.pickup_time || '';
        const orderDate = rawPickup.includes(' ') ? rawPickup.split(' ')[0] : (o.pickup_date || todayDate);
        const orderTime = rawPickup.includes(' ') ? rawPickup.split(' ')[1] : (rawPickup || '12:00');

        return {
          ...o,
          date: orderDate,
          time: orderTime,
          type: 'order' as const,
        };
      });
      setOrdersList(formattedOrders);

      if (formattedOrders.some((o) => o.status === 'pending' && o.date === todayDate)) {
        setIsAlarmPlaying(true);
      }
    }

    if (resData) {
      formattedResrs = resData.map((r) => ({
        ...r,
        date: r.reservation_date,
        time: r.reservation_time || '12:00',
        type: 'reservation' as const,
      }));
      setReservationsList(formattedResrs);
    }

    updatePendingFutureCheck(formattedOrders, formattedResrs);
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
    if (newStatus === 'cancelled') {
      const confirmCancel = window.confirm('Sei sicuro di voler annullare questo elemento?');
      if (!confirmCancel) return;
    }

    const currentItem = type === 'order' 
      ? ordersList.find(o => o.id === id) 
      : reservationsList.find(r => r.id === id);

    const wasAlreadyConfirmed = currentItem?.status === 'confirmed';

    const tableName = type === 'order' ? 'orders' : 'reservations';
    const { error } = await supabase.from(tableName).update({ status: newStatus }).eq('id', id);

    if (!error) {
      let updatedOrders = ordersList;
      let updatedResrs = reservationsList;

      if (type === 'order') {
        updatedOrders = ordersList.map((o) => (o.id === id ? { ...o, status: newStatus } : o));
        setOrdersList(updatedOrders);
      } else {
        updatedResrs = reservationsList.map((r) => (r.id === id ? { ...r, status: newStatus } : r));
        setReservationsList(updatedResrs);
      }

      updatePendingFutureCheck(updatedOrders, updatedResrs);

      // Invia la notifica email SOLO se lo stato diventa confirmed e non lo era già in precedenza
      if (currentItem && newStatus === 'confirmed' && !wasAlreadyConfirmed) {
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
            type: type,
            restaurantName: restaurant?.name,
            totalAmount: currentItem.total_amount,
          }),
        }).catch((err) => console.error('Errore chiamata API notifiche:', err));
      }
    } else {
      alert(`Errore aggiornamento: ${error.message}`);
    }
  };

  const openEditModal = (item: OrderItem) => {
    setEditingItem(item);
    setEditName(item.customer_name || '');
    setEditDate(item.date || todayDate);
    setEditTime(item.time || '12:00');
    setEditGuests(item.guests || item.party_size || 1);
    setEditNotes(item.notes || '');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    setSavingEdit(true);
    const isOrder = editingItem.type === 'order';
    const tableName = isOrder ? 'orders' : 'reservations';

    let updatePayload: any = {};
    if (isOrder) {
      updatePayload = {
        customer_name: editName,
        pickup_time: `${editDate} ${editTime}`,
        notes: editNotes,
      };
    } else {
      updatePayload = {
        customer_name: editName,
        reservation_date: editDate,
        reservation_time: editTime,
        party_size: editGuests,
        guests: editGuests,
        notes: editNotes,
      };
    }

    const { error } = await supabase
      .from(tableName)
      .update(updatePayload)
      .eq('id', editingItem.id);

    if (!error) {
      if (isOrder) {
        setOrdersList((prev) =>
          prev.map((o) => (o.id === editingItem.id ? { ...o, ...updatePayload, date: editDate, time: editTime } : o))
        );
      } else {
        setReservationsList((prev) =>
          prev.map((r) => (r.id === editingItem.id ? { ...r, ...updatePayload, date: editDate, time: editTime, party_size: editGuests, guests: editGuests } : r))
        );
      }
      setEditingItem(null);
    } else {
      alert(`Errore durante il salvataggio: ${error.message}`);
    }
    setSavingEdit(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (loading) return <div className="p-8 text-slate-400 bg-slate-950 min-h-screen text-sm">Caricamento in corso...</div>;

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
    const createdAtFormatted = item.created_at ? item.created_at.replace('T', ' ').substring(0, 16) : '';

    return (
      <div key={item.id} className="bg-slate-900/90 hover:bg-slate-900 p-5 rounded-xl border border-slate-800 shadow-md transition-all space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h3 className="font-bold text-base text-white">{item.customer_name}</h3>
            
            {item.type === 'reservation' && (
              <span className="bg-slate-800 text-slate-300 border border-slate-700 px-3 py-1 rounded-md text-xs font-medium">
                {numPeople} {numPeople === 1 ? 'persona' : 'persone'}
              </span>
            )}

            {item.type === 'order' && (
              <span className="bg-slate-800 text-slate-300 border border-slate-700 px-3 py-1 rounded-md text-xs font-medium uppercase tracking-wider">
                {item.order_type === 'delivery' ? 'Consegna' : 'Ritiro'}
              </span>
            )}

            {/* Riquadro Data e Ora */}
            <div className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 px-3 py-1 rounded-md text-xs font-bold text-slate-200">
              <span>{item.date}</span>
              <span className="text-slate-500">|</span>
              <span>{item.time}</span>
            </div>

            {item.status === 'pending' && <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2.5 py-1 rounded text-xs font-semibold animate-pulse">Da Confermare</span>}
            {item.status === 'confirmed' && <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2.5 py-1 rounded text-xs font-semibold">Confermato</span>}
            {item.status === 'preparing' && <span className="bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2.5 py-1 rounded text-xs font-semibold">In Corso</span>}
            {item.status === 'ready' && <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded text-xs font-semibold">Pronto</span>}
            {item.status === 'completed' && <span className="bg-slate-800 text-slate-400 border border-slate-700 px-2.5 py-1 rounded text-xs font-semibold">Completato</span>}
            {item.status === 'cancelled' && <span className="bg-red-500/10 text-red-400 border border-red-500/20 px-2.5 py-1 rounded text-xs font-semibold">Annullato</span>}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => openEditModal(item)}
              className="text-xs font-bold px-3.5 py-1.5 rounded-lg transition border bg-slate-800 hover:bg-slate-700 text-amber-400 border-slate-700"
            >
              Modifica
            </button>

            <button
              onClick={() => handleStatusChange(item.id, item.type, 'confirmed')}
              className={`text-xs font-bold px-3.5 py-1.5 rounded-lg transition border ${
                item.status === 'confirmed' 
                  ? 'bg-blue-600 text-white border-blue-500 shadow' 
                  : 'bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white border-blue-500/30'
              }`}
            >
              Conferma
            </button>

            <button
              onClick={() => handleStatusChange(item.id, item.type, 'completed')}
              className={`text-xs font-bold px-3.5 py-1.5 rounded-lg transition border ${
                item.status === 'completed' 
                  ? 'bg-emerald-600 text-white border-emerald-500 shadow' 
                  : 'bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white border-emerald-500/30'
              }`}
            >
              Completato
            </button>

            <button
              onClick={() => handleStatusChange(item.id, item.type, 'cancelled')}
              className={`text-xs font-bold px-3.5 py-1.5 rounded-lg transition border ${
                item.status === 'cancelled' 
                  ? 'bg-red-600 text-white border-red-500 shadow' 
                  : 'bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white border-red-500/30'
              }`}
            >
              Annulla
            </button>
          </div>
        </div>

        <div className="space-y-2 pt-2 border-t border-slate-800/80">
          <div className="text-sm text-slate-300 flex flex-wrap items-center gap-4">
            <span>Tel: {item.customer_phone || 'N/D'}</span>
            {item.customer_email && <span>Email: {item.customer_email}</span>}
          </div>

          {item.notes ? (
            <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-800 text-sm text-amber-300">
              <span className="text-xs uppercase tracking-wider text-slate-400 font-bold block mb-1">Note:</span>
              <p className="whitespace-pre-line leading-relaxed">{item.notes}</p>
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic">Nessuna nota specificata.</p>
          )}
        </div>

        {item.type === 'order' && item.items && item.items.length > 0 && (
          <div className="bg-slate-950/60 p-3.5 rounded-lg border border-slate-800 space-y-2">
            <div className="flex justify-between items-center border-b border-slate-800/80 pb-1.5 text-xs">
              <div className="flex items-center gap-2">
                <span className="uppercase tracking-wider text-slate-400 font-bold">Comanda:</span>
                {createdAtFormatted && <span className="text-amber-400 font-medium text-xs">({createdAtFormatted})</span>}
              </div>
              {item.total_amount && <span className="text-emerald-400 font-bold text-sm">Totale: €{Number(item.total_amount).toFixed(2)}</span>}
            </div>
            <div className="divide-y divide-slate-800/40">
              {item.items.map((it, idx) => (
                <div key={idx} className="py-1.5 text-sm flex justify-between items-start">
                  <div>
                    <span className="font-semibold text-white">{it.quantity}x {it.name}</span>
                    {it.itemNote && <span className="text-slate-300 text-xs block italic">Note: {it.itemNote}</span>}
                  </div>
                  {it.price && <span className="text-slate-400 text-xs">€{(it.price * it.quantity).toFixed(2)}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col md:flex-row relative">
      
      {/* HEADER MOBILE COMPATTO */}
      <div className="md:hidden bg-slate-900 border-b border-slate-800 p-4 flex items-center justify-between sticky top-0 z-50">
        <div>
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest block">Dashboard Live</span>
          <h1 className="text-base font-black tracking-tight text-white truncate max-w-[200px]">{restaurant?.name}</h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleAudio}
            className={`p-2.5 rounded-xl border text-sm font-bold ${
              audioEnabled ? 'bg-slate-800 text-emerald-400 border-slate-700' : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
          >
            {audioEnabled ? '🔊' : '🔇'}
          </button>

          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="bg-slate-800 hover:bg-slate-700 text-white px-3.5 py-2 rounded-xl border border-slate-700 text-xs font-bold"
          >
            {isSidebarOpen ? '✕ Chiudi' : '☰ Menu'}
          </button>
        </div>
      </div>

      {isSidebarOpen && (
        <div 
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 bg-black/60 z-30 md:hidden backdrop-blur-xs transition-opacity"
        />
      )}

      {/* SIDEBAR LATERALE */}
      <aside 
        className={`w-72 md:w-72 bg-slate-900 border-r border-slate-800 p-6 flex flex-col justify-between shrink-0 transition-transform duration-300 ease-in-out fixed md:static inset-y-0 left-0 z-40 ${
          isSidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="space-y-6 pt-12 md:pt-0">
          <div className="hidden md:block">
            <span className="text-xs text-slate-400 font-bold uppercase tracking-widest block">Dashboard Live</span>
            <h1 className="text-xl font-black tracking-tight text-white mt-1 truncate">{restaurant?.name}</h1>
          </div>

          <nav className="space-y-2.5 text-sm font-semibold">
            <Link 
              href={restaurant?.slug ? `/menu/${restaurant.slug}` : '/dashboard/menu'} 
              onClick={() => setIsSidebarOpen(false)}
              className="flex items-center gap-3 p-3.5 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-200 transition-colors border border-slate-700/50"
            >
              <span>Visualizza Menu Pubblico</span>
            </Link>

            <Link 
              href="/dashboard/promotions" 
              onClick={() => setIsSidebarOpen(false)}
              className="flex items-center gap-3 p-3.5 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-200 transition-colors border border-slate-700/50"
            >
              <span>Gestione Promozioni</span>
            </Link>

            <Link 
              href="/dashboard/settings" 
              onClick={() => setIsSidebarOpen(false)}
              className="flex items-center gap-3 p-3.5 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-200 transition-colors border border-slate-700/50"
            >
              <span>Impostazioni Ristorante</span>
            </Link>
          </nav>
        </div>

        <div className="space-y-3 pt-6 border-t border-slate-800 text-sm">
          <button
            onClick={toggleAudio}
            className={`w-full py-3.5 px-4 rounded-xl font-bold border transition text-center hidden md:block ${
              audioEnabled 
                ? 'bg-slate-800 text-emerald-400 border-slate-700 hover:bg-slate-700' 
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
          >
            {audioEnabled ? '🔊 Audio Attivo' : '🔇 Audio Disattivato'}
          </button>

          <button 
            onClick={handleLogout} 
            className="w-full bg-slate-800 hover:bg-slate-700 text-red-400 font-semibold py-3.5 rounded-xl border border-slate-700 transition-colors text-center"
          >
            Esci dall'Account
          </button>
        </div>
      </aside>

      {/* CONTENUTO PRINCIPALE */}
      <main className="flex-1 p-4 sm:p-8 space-y-6 overflow-y-auto">
        
        {isAlarmPlaying && (
          <div className="bg-amber-500 text-slate-950 font-black p-4 rounded-xl shadow-lg animate-pulse flex justify-between items-center text-sm">
            <span>⚠️ CI SONO ORDINI IN ATTESA DI CONFERMA!</span>
            <button onClick={() => setIsAlarmPlaying(false)} className="bg-slate-950 text-white px-4 py-2 rounded-lg text-xs font-bold">Silenzia</button>
          </div>
        )}

        {pendingFutureDates.length > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/40 p-4 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-sm">
            <div className="flex items-center gap-2.5">
              <span className="w-3 h-3 bg-amber-500 rounded-full animate-pulse shrink-0"></span>
              <span className="font-bold text-amber-400">Ci sono ordini o prenotazioni future da confermare:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {pendingFutureDates.map((dateStr) => (
                <button
                  key={dateStr}
                  onClick={() => setSelectedDate(dateStr)}
                  className={`px-3 py-1.5 rounded-lg font-bold border transition text-xs ${
                    selectedDate === dateStr 
                      ? 'bg-amber-500 text-slate-950 border-amber-400 shadow' 
                      : 'bg-slate-900 text-amber-300 border-slate-700 hover:border-amber-500/60'
                  }`}
                  title="Clicca per visualizzare questa data"
                >
                  {dateStr}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="grid grid-cols-2 sm:flex gap-3 text-sm">
            <button
              onClick={() => setActiveTab('orders')}
              className={`px-4 py-3 rounded-xl font-bold transition-all text-center flex items-center justify-center gap-2.5 ${
                activeTab === 'orders' ? 'bg-slate-800 text-white shadow-md border border-slate-700' : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              <span>Ordini</span>
              <span className="bg-amber-500 text-slate-950 px-2.5 py-0.5 rounded-md text-xs font-black shadow-sm">
                {ordersList.filter(o => o.date === selectedDate).length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('reservations')}
              className={`px-4 py-3 rounded-xl font-bold transition-all text-center flex items-center justify-center gap-2.5 ${
                activeTab === 'reservations' ? 'bg-slate-800 text-white shadow-md border border-slate-700' : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              <span>Prenotazioni</span>
              <span className="bg-amber-500 text-slate-950 px-2.5 py-0.5 rounded-md text-xs font-black shadow-sm">
                {reservationsList.filter(r => r.date === selectedDate).length}
              </span>
            </button>
          </div>

          <div className="flex items-center justify-between sm:justify-start gap-3">
            <span className="text-sm text-slate-400 font-medium">Data:</span>
            <div className="relative">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white font-semibold focus:outline-none focus:border-slate-600"
              />
              {pendingFutureDates.length > 0 && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-amber-500 rounded-full animate-pulse border-2 border-slate-950" />
              )}
            </div>
            {selectedDate !== todayDate && (
              <button
                onClick={() => setSelectedDate(todayDate)}
                className="bg-slate-800 hover:bg-slate-700 text-sm text-slate-200 px-3.5 py-2.5 rounded-xl font-medium transition border border-slate-700"
              >
                Oggi
              </button>
            )}
          </div>
        </div>

        <div className="flex overflow-x-auto pb-2 sm:pb-0 gap-2 bg-slate-900/60 p-3 rounded-2xl border border-slate-800 text-sm no-scrollbar">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3.5 py-2.5 rounded-xl font-semibold transition-colors whitespace-nowrap flex items-center gap-2.5 ${statusFilter === 'all' ? 'bg-slate-800 text-white font-bold border border-slate-700' : 'text-slate-400 hover:text-white'}`}
          >
            <span>Tutti</span>
            <span className="text-xs font-bold bg-slate-700 text-white px-2.5 py-0.5 rounded-md">
              {dateFilteredList.length}
            </span>
          </button>
          <button
            onClick={() => setStatusFilter('pending')}
            className={`px-3.5 py-2.5 rounded-xl font-semibold transition-colors whitespace-nowrap flex items-center gap-2.5 ${statusFilter === 'pending' ? 'bg-slate-800 text-white font-bold border border-slate-700' : 'text-slate-400 hover:text-white'}`}
          >
            <span>Da Confermare</span>
            <span className="text-xs font-bold bg-amber-500 text-slate-950 px-2.5 py-0.5 rounded-md">
              {dateFilteredList.filter(i => i.status === 'pending').length}
            </span>
          </button>
          <button
            onClick={() => setStatusFilter('confirmed')}
            className={`px-3.5 py-2.5 rounded-xl font-semibold transition-colors whitespace-nowrap flex items-center gap-2.5 ${statusFilter === 'confirmed' ? 'bg-slate-800 text-white font-bold border border-slate-700' : 'text-slate-400 hover:text-white'}`}
          >
            <span>In Corso</span>
            <span className="text-xs font-bold bg-blue-600 text-white px-2.5 py-0.5 rounded-md">
              {dateFilteredList.filter(i => ['confirmed', 'preparing', 'ready'].includes(i.status)).length}
            </span>
          </button>
          <button
            onClick={() => setStatusFilter('completed')}
            className={`px-3.5 py-2.5 rounded-xl font-semibold transition-colors whitespace-nowrap flex items-center gap-2.5 ${statusFilter === 'completed' ? 'bg-slate-800 text-white font-bold border border-slate-700' : 'text-slate-400 hover:text-white'}`}
          >
            <span>Completati</span>
            <span className="text-xs font-bold bg-emerald-600 text-white px-2.5 py-0.5 rounded-md">
              {dateFilteredList.filter(i => i.status === 'completed').length}
            </span>
          </button>
          <button
            onClick={() => setStatusFilter('cancelled')}
            className={`px-3.5 py-2.5 rounded-xl font-semibold transition-colors whitespace-nowrap flex items-center gap-2.5 ${statusFilter === 'cancelled' ? 'bg-slate-800 text-white font-bold border border-slate-700' : 'text-slate-400 hover:text-white'}`}
          >
            <span>Annullati</span>
            <span className="text-xs font-bold bg-red-600 text-white px-2.5 py-0.5 rounded-md">
              {dateFilteredList.filter(i => i.status === 'cancelled').length}
            </span>
          </button>
        </div>

        {finalFilteredList.length === 0 ? (
          <div className="bg-slate-900 p-16 rounded-2xl border border-slate-800 text-center text-slate-400 text-sm">
            Nessun elemento registrato per la data del {selectedDate}.
          </div>
        ) : (
          <div className="space-y-8">
            {lunchList.length > 0 && (
              <section className="space-y-4">
                <div className="flex items-center gap-2.5 border-b border-slate-800 pb-2">
                  <span className="text-slate-300 font-extrabold text-sm uppercase tracking-wider">Pranzo</span>
                  <span className="text-sm text-slate-500 font-medium">({lunchList.length})</span>
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  {lunchList.map(renderCard)}
                </div>
              </section>
            )}

            {dinnerList.length > 0 && (
              <section className="space-y-4 pt-4">
                <div className="flex items-center gap-2.5 border-b border-slate-800 pb-2">
                  <span className="text-slate-300 font-extrabold text-sm uppercase tracking-wider">Cena</span>
                  <span className="text-sm text-slate-500 font-medium">({dinnerList.length})</span>
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  {dinnerList.map(renderCard)}
                </div>
              </section>
            )}
          </div>
        )}

      </main>

      {/* MODALE DI MODIFICA DATI */}
      {editingItem && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-2xl p-6 space-y-5 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h2 className="text-base font-bold text-amber-400">
                Modifica {editingItem.type === 'order' ? 'Ordine' : 'Prenotazione'}
              </h2>
              <button 
                onClick={() => setEditingItem(null)}
                className="text-slate-400 hover:text-white text-sm font-bold px-2 py-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-slate-400 font-semibold block">Nome Cliente</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-400 font-semibold block">Data</label>
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-400 font-semibold block">Orario</label>
                  <input
                    type="time"
                    value={editTime}
                    onChange={(e) => setEditTime(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>
              </div>

              {editingItem.type === 'reservation' && (
                <div className="space-y-1">
                  <label className="text-slate-400 font-semibold block">Numero Persone (Coperti)</label>
                  <select
                    value={editGuests}
                    onChange={(e) => setEditGuests(parseInt(e.target.value, 10))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-amber-500 cursor-pointer"
                    required
                  >
                    {[...Array(20)].map((_, i) => {
                      const num = i + 1;
                      return (
                        <option key={num} value={num} className="bg-slate-950 text-white">
                          {num} {num === 1 ? 'persona' : 'persone'}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-slate-400 font-semibold block">Commenti / Note</label>
                <textarea
                  rows={3}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="w-1/2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3 rounded-xl transition"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="w-1/2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold py-3 rounded-xl transition"
                >
                  {savingEdit ? 'Salvataggio...' : 'Salva Modifiche'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
