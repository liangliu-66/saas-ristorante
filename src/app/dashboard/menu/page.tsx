'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Product = {
  id: string
  name: string
  description: string
  price: number
  is_available?: boolean
}

export default function MenuManagement() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')

  useEffect(() => {
    fetchProducts()
  }, [])

  async function fetchProducts() {
    const { data, error } = await supabase.from('products').select('*').order('name')
    if (!error && data) setProducts(data)
    setLoading(false)
  }

  async function handleAddProduct(e: React.FormEvent) {
    e.preventDefault()
    if (!name || !price) return

    const { error } = await supabase.from('products').insert([
      {
        name,
        description,
        price: parseFloat(price),
      }
    ])

    if (!error) {
      setName('')
      setDescription('')
      setPrice('')
      fetchProducts()
    } else {
      alert('Errore durante l\'aggiunta del prodotto')
    }
  }

  async function toggleAvailability(id: string, currentStatus: boolean) {
    const { error } = await supabase
      .from('products')
      .update({ is_available: !currentStatus })
      .eq('id', id)

    if (!error) fetchProducts()
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex justify-between items-center border-b border-slate-800 pb-4">
          <h1 className="text-2xl font-bold">Gestione Menu</h1>
          <a href="/dashboard" className="text-sm text-sky-400 hover:underline">
            &larr; Torna alla Dashboard Ordini
          </a>
        </div>

        {/* Form Aggiunta Prodotto */}
        <form onSubmit={handleAddProduct} className="bg-slate-800 p-6 rounded-xl border border-slate-700 space-y-4">
          <h2 className="text-lg font-semibold text-sky-400">Aggiungi Nuovo Piatto</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input
              type="text"
              placeholder="Nome Piatto"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded p-2 text-white"
              required
            />
            <input
              type="number"
              step="0.01"
              placeholder="Prezzo (€)"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded p-2 text-white"
              required
            />
            <input
              type="text"
              placeholder="Descrizione (opzionale)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded p-2 text-white"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-sky-600 hover:bg-sky-500 font-bold py-2 rounded transition"
          >
            Aggiungi al Menu
          </button>
        </form>

        {/* Lista Prodotti */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <div className="p-4 border-b border-slate-700 font-semibold">Prodotti in Carta</div>
          {loading ? (
            <div className="p-6 text-center text-slate-400">Caricamento menu...</div>
          ) : (
            <div className="divide-y divide-slate-700">
              {products.map((item) => (
                <div key={item.id} className="p-4 flex items-center justify-between hover:bg-slate-750">
                  <div>
                    <h3 className="font-semibold text-lg">{item.name}</h3>
                    <p className="text-sm text-slate-400">{item.description}</p>
                    <span className="text-sky-400 font-bold mt-1 inline-block">
                      € {item.price.toFixed(2)}
                    </span>
                  </div>
                  <button
                    onClick={() => toggleAvailability(item.id, item.is_available ?? true)}
                    className={`px-4 py-2 rounded text-sm font-bold ${
                      (item.is_available ?? true)
                        ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-rose-600/20 text-rose-400 border border-rose-500/30'
                    }`}
                  >
                    {(item.is_available ?? true) ? 'Disponibile' : 'Esaurito'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
