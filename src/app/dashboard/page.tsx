'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Order = {
  id: string
  customer_name: string
  customer_phone: string
  total_amount: number
  status: 'pending' | 'in_preparation' | 'completed'
  created_at: string
}

export default function Dashboard() {
  const [orders, setOrders] = useState<Order[]>([])
  const [filter, setFilter] = useState<'all' | 'pending' | 'in_preparation' | 'completed'>('all')

  useEffect(() => {
    fetchOrders()

    const channel = supabase
      .channel('realtime_orders')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => fetchOrders()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  async function fetchOrders() {
    const { data } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })

    if (data) setOrders(data)
  }

  async function updateStatus(id: string, newStatus: Order['status']) {
    await supabase.from('orders').update({ status: newStatus }).eq('id', id)
    fetchOrders()
  }

  async function deleteOrder(id: string) {
    if (!confirm('Sei sicuro di voler eliminare questo ordine?')) return
    await supabase.from('orders').delete().eq('id', id)
    fetchOrders()
  }

  const filteredOrders = orders.filter((o) => (filter === 'all' ? true : o.status === filter))

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Navigation Bar */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-slate-800 p-4 rounded-xl border border-slate-700 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Dashboard Ristoratore</h1>
            <p className="text-xs text-slate-400">Gestione in tempo reale degli ordini e del menu</p>
          </div>
          <div className="flex gap-3">
            <a
              href="/dashboard"
              className="px-4 py-2 bg-sky-600 text-white rounded-lg font-semibold text-sm shadow"
            >
              Ordini Live
            </a>
            <a
              href="/dashboard/menu"
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg font-semibold text-sm transition"
            >
              Gestione Menu &rarr;
            </a>
          </div>
        </div>

        {/* Status Filters */}
        <div className="flex gap-2 border-b border-slate-800 pb-3 overflow-x-auto">
          {[
            { key: 'all', label: 'Tutti' },
            { key: 'pending', label: 'In Arrivo' },
            { key: 'in_preparation', label: 'In Preparazione' },
            { key: 'completed', label: 'Completati' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key as any)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                filter === tab.key
                  ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-750'
              }`}
            >
              {tab.label} ({orders.filter((o) => (tab.key === 'all' ? true : o.status === tab.key)).length})
            </button>
          ))}
        </div>

        {/* Orders Grid */}
        {filteredOrders.length === 0 ? (
          <div className="bg-slate-800/50 rounded-xl p-12 text-center text-slate-500 border border-slate-800">
            Nessun ordine trovato in questa sezione.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredOrders.map((order) => (
              <div
                key={order.id}
                className="bg-slate-800 border border-slate-700 rounded-xl p-5 flex flex-col justify-between shadow-md"
              >
                <div className="space-y-3">
                  <div className="flex justify-between items-start">
                    <span className="text-xs font-mono text-slate-400">
                      {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span
                      className={`text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${
                        order.status === 'pending'
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : order.status === 'in_preparation'
                          ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                          : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      }`}
                    >
                      {order.status === 'pending' ? 'In Arrivo' : order.status === 'in_preparation' ? 'In Preparazione' : 'Completato'}
                    </span>
                  </div>

                  <div>
                    <h3 className="font-bold text-lg text-white">{order.customer_name}</h3>
                    <p className="text-sm text-slate-400">{order.customer_phone}</p>
                  </div>

                  <div className="pt-2 border-t border-slate-700/60 flex justify-between items-center">
                    <span className="text-sm text-slate-400">Totale:</span>
                    <span className="text-xl font-extrabold text-sky-400">€ {order.total_amount.toFixed(2)}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-5 pt-3 border-t border-slate-700/60 flex flex-col gap-2">
                  {order.status === 'pending' && (
                    <button
                      onClick={() => updateStatus(order.id, 'in_preparation')}
                      className="w-full bg-sky-600 hover:bg-sky-500 text-white font-bold py-2 rounded-lg text-sm transition"
                    >
                      Accetta & Prepara
                    </button>
                  )}

                  {order.status === 'in_preparation' && (
                    <button
                      onClick={() => updateStatus(order.id, 'completed')}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 rounded-lg text-sm transition"
                    >
                      Segna Come Pronto
                    </button>
                  )}

                  <button
                    onClick={() => deleteOrder(order.id)}
                    className="w-full text-xs text-rose-400 hover:text-rose-300 py-1 transition"
                  >
                    Elimina Ordine
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
