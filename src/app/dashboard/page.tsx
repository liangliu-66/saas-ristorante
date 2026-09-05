'use client'

import { useEffect, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'

interface Order {
  id: string
  created_at: string
  table_number: string
  items: any[]
  total_amount: number
  status: 'pending' | 'preparing' | 'completed' | 'cancelled'
}

export default function Dashboard() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const fetchOrders = async () => {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })

    if (!error && data) {
      setOrders(data as Order[])
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchOrders()

    const channel = supabase
      .channel('orders-changes')
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

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const updateOrderStatus = async (orderId: string, status: string) => {
    await supabase.from('orders').update({ status }).eq('id', orderId)
    fetchOrders()
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8 border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-3xl font-bold">Dashboard Ordini</h1>
            <p className="text-slate-400 text-sm">Gestione in tempo reale</p>
          </div>
          <button
            onClick={handleLogout}
            className="bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-500/30 px-4 py-2 rounded-lg text-sm transition-colors"
          >
            Esci (Logout)
          </button>
        </div>

        {loading ? (
          <p className="text-slate-400">Caricamento ordini...</p>
        ) : orders.length === 0 ? (
          <p className="text-slate-400">Nessun ordine presente.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {orders.map((order) => (
              <div
                key={order.id}
                className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4"
              >
                <div className="flex justify-between items-start border-b border-slate-700 pb-3">
                  <div>
                    <h2 className="text-xl font-bold text-amber-500">
                      Tavolo {order.table_number}
                    </h2>
                    <span className="text-xs text-slate-400">
                      {new Date(order.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                      order.status === 'pending'
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        : order.status === 'preparing'
                        ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                        : order.status === 'completed'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-slate-700 text-slate-400'
                    }`}
                  >
                    {order.status}
                  </span>
                </div>

                <div className="space-y-2 text-sm text-slate-300">
                  {order.items?.map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between">
                      <span>
                        {item.quantity}x {item.name}
                      </span>
                      <span className="text-slate-400">
                        €{(item.price * item.quantity).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="border-t border-slate-700 pt-3 flex justify-between items-center">
                  <span className="font-bold text-lg">
                    Totale: €{Number(order.total_amount).toFixed(2)}
                  </span>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => updateOrderStatus(order.id, 'preparing')}
                    className="flex-1 bg-blue-600 hover:bg-blue-500 text-xs py-2 rounded font-medium transition-colors"
                  >
                    In Preparazione
                  </button>
                  <button
                    onClick={() => updateOrderStatus(order.id, 'completed')}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-xs py-2 rounded font-medium transition-colors"
                  >
                    Completato
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