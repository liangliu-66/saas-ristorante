'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  image_url: string | null;
  is_available: boolean;
}

export default function DashboardPage() {
  const [restaurant, setRestaurant] = useState<any>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // Form stato nuovo/modifica prodotto
  const [editingId, setEditingId] = useState<string | null>(null);
  const [prodName, setProdName] = useState('');
  const [prodDesc, setProdDesc] = useState('');
  const [prodPrice, setProdPrice] = useState('');
  const [prodCategory, setProdCategory] = useState('Antipasti');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const fetchRestaurantAndProducts = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }

    const { data: restData } = await supabase
      .from('restaurants')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!restData) { router.push('/onboarding'); return; }

    setRestaurant(restData);

    const { data: prodData } = await supabase
      .from('products')
      .select('*')
      .eq('restaurant_id', restData.id)
      .order('created_at', { ascending: false });

    if (prodData) setProducts(prodData);
    setLoading(false);
  };

  useEffect(() => { fetchRestaurantAndProducts(); }, []);

  const resetForm = () => {
    setEditingId(null);
    setProdName('');
    setProdDesc('');
    setProdPrice('');
    setProdCategory('Antipasti');
    setImageFile(null);
    setImagePreview(null);
  };

  const handleEditClick = (p: Product) => {
    setEditingId(p.id);
    setProdName(p.name);
    setProdDesc(p.description || '');
    setProdPrice(p.price.toString());
    setProdCategory(p.category || 'Antipasti');
    setImagePreview(p.image_url);
    setImageFile(null);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file)); // Anteprima istantanea
    }
  };

  const uploadImage = async (file: File) => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${restaurant.id}/${Date.now()}.${fileExt}`;
    
    const { error: uploadError } = await supabase.storage
      .from('restaurant-media')
      .upload(fileName, file, { upsert: true });

    if (uploadError) {
      console.error('Errore upload immagine:', uploadError);
      return null;
    }

    const { data } = supabase.storage.from('restaurant-media').getPublicUrl(fileName);
    return data.publicUrl;
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prodName || !prodPrice) return;
    setSaving(true);

    let imageUrl = imagePreview;

    if (imageFile) {
      const uploadedUrl = await uploadImage(imageFile);
      if (uploadedUrl) imageUrl = uploadedUrl;
    }

    const payload: any = {
      restaurant_id: restaurant.id,
      name: prodName,
      description: prodDesc,
      price: parseFloat(prodPrice),
      category: prodCategory,
      image_url: imageUrl,
    };

    let error;
    if (editingId) {
      const res = await supabase.from('products').update(payload).eq('id', editingId);
      error = res.error;
    } else {
      const res = await supabase.from('products').insert([payload]);
      error = res.error;
    }

    if (!error) {
      resetForm();
      fetchRestaurantAndProducts();
    } else {
      alert(`Errore durante il salvataggio: ${error.message}`);
    }
    setSaving(false);
  };

  const toggleAvailability = async (p: Product) => {
    const { error } = await supabase
      .from('products')
      .update({ is_available: !p.is_available })
      .eq('id', p.id);

    if (!error) {
      setProducts(products.map(item => item.id === p.id ? { ...item, is_available: !item.is_available } : item));
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (!confirm('Eliminare questo piatto dal menu?')) return;
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (!error) {
      setProducts(products.filter((p) => p.id !== id));
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (loading) return <div className="p-8 text-white bg-slate-900 min-h-screen">Caricamento...</div>;

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Header */}
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-800 p-6 rounded-xl border border-slate-700 gap-4">
  <div>
    <span className="text-xs text-amber-500 font-semibold uppercase tracking-wider">Locale Attivo</span>
    <h1 className="text-2xl font-bold">{restaurant?.name}</h1>
    <p className="text-slate-400 text-xs mt-1">
      URL Menu: <a href={`/menu/${restaurant?.slug}`} target="_blank" className="text-amber-500 hover:underline">/menu/{restaurant?.slug}</a>
    </p>
  </div>

  <div className="flex flex-wrap gap-3">
    <Link href="/dashboard/orders" className="bg-amber-500 hover:bg-amber-600 text-slate-900 text-sm font-bold px-4 py-2 rounded-lg transition-colors">
      🔔 Ordini Live
    </Link>
    <Link href="/dashboard/settings" className="bg-slate-700 hover:bg-slate-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
      Bacheca & Orari
    </Link>
    <button onClick={handleLogout} className="bg-red-500/10 hover:bg-red-500/20 text-red-400 text-sm font-semibold px-4 py-2 rounded-lg border border-red-500/20 transition-colors">
      Esci
    </button>
  </div>
</header>

        {/* Form Gestore con Anteprima Immagine */}
        <section className="bg-slate-800 p-6 rounded-xl border border-slate-700 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold">{editingId ? 'Modifica Piatto' : 'Aggiungi un Nuovo Piatto'}</h2>
            {editingId && (
              <button onClick={resetForm} className="text-xs text-amber-500 underline">Annulla Modifica</button>
            )}
          </div>
          
          <form onSubmit={handleSaveProduct} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <input
                type="text"
                placeholder="Nome Piatto"
                value={prodName}
                onChange={(e) => setProdName(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm focus:outline-none focus:border-amber-500"
                required
              />

              <select
                value={prodCategory}
                onChange={(e) => setProdCategory(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm focus:outline-none focus:border-amber-500"
              >
                <option value="Antipasti">Antipasti</option>
                <option value="Primi">Primi</option>
                <option value="Secondi">Secondi</option>
                <option value="Pizza">Pizza</option>
                <option value="Dolci">Dolci</option>
                <option value="Bevande">Bevande</option>
              </select>

              <input
                type="number"
                step="0.01"
                placeholder="Prezzo (€)"
                value={prodPrice}
                onChange={(e) => setProdPrice(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm focus:outline-none focus:border-amber-500"
                required
              />
            </div>

            <input
              type="text"
              placeholder="Descrizione ingredienti..."
              value={prodDesc}
              onChange={(e) => setProdDesc(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm focus:outline-none focus:border-amber-500"
            />

            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="w-full flex items-center gap-3">
                {imagePreview ? (
                  <img src={imagePreview} alt="Anteprima" className="w-14 h-14 rounded-lg object-cover border border-amber-500/50" />
                ) : (
                  <div className="w-14 h-14 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center text-[10px] text-slate-500 text-center p-1">No Anteprima</div>
                )}
                
                <div className="flex-1">
                  <label className="block text-xs text-slate-400 mb-1">Carica Immagine Piatto</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-slate-700 file:text-white"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full sm:w-auto bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold px-6 py-3 rounded-lg transition-colors whitespace-nowrap self-end"
              >
                {saving ? 'Salvataggio...' : editingId ? 'Aggiorna Piatto' : 'Aggiungi Piatto'}
              </button>
            </div>
          </form>
        </section>

        {/* Lista Piatti Gestore */}
        <section className="bg-slate-800 p-6 rounded-xl border border-slate-700 space-y-4">
          <h2 className="text-lg font-bold">Menu del Locale ({products.length} piatti)</h2>

          {products.length === 0 ? (
            <p className="text-slate-400 text-sm">Nessun piatto inserito.</p>
          ) : (
            <div className="divide-y divide-slate-700">
              {products.map((item) => (
                <div key={item.id} className="py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div className="flex items-center gap-4">
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.name} className="w-12 h-12 rounded-lg object-cover bg-slate-900" />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-slate-900 flex items-center justify-center text-xs text-slate-500">No img</div>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold">{item.name}</h3>
                        <span className="text-[10px] bg-slate-700 px-2 py-0.5 rounded text-amber-400">{item.category}</span>
                      </div>
                      <p className="text-xs text-slate-400">{item.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-0 border-slate-700/50 pt-2 sm:pt-0">
                    <span className="font-bold text-amber-500">€{Number(item.price).toFixed(2)}</span>
                    
                    <button
                      onClick={() => toggleAvailability(item)}
                      className={`text-xs px-2 py-1 rounded font-semibold transition-colors ${item.is_available ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}
                    >
                      {item.is_available ? 'In Menu' : 'Nascosto in IU'}
                    </button>

                    <button onClick={() => handleEditClick(item)} className="text-xs bg-slate-700 hover:bg-slate-600 px-2 py-1 rounded">Modifica</button>
                    <button onClick={() => handleDeleteProduct(item.id)} className="text-xs bg-red-500/10 text-red-400 hover:bg-red-500/20 px-2 py-1 rounded border border-red-500/20">Elimina</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>
    </div>
  );
}