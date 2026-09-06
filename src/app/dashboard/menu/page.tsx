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

export default function MenuManagement() {
  const [restaurant, setRestaurant] = useState<any>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [newCatInput, setNewCatInput] = useState('');
  const [loading, setLoading] = useState(true);

  // Form stato
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('Antipasti');
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
    if (!user) {
      router.push('/login');
      return;
    }

    const { data: restData } = await supabase
      .from('restaurants')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!restData) {
      router.push('/onboarding');
      return;
    }

    setRestaurant(restData);
    const catList = restData.custom_categories || ["Antipasti", "Primi", "Secondi", "Pizza", "Dolci", "Bevande"];
    setCategories(catList);
    if (!catList.includes(category) && catList.length > 0) {
      setCategory(catList[0]);
    }

    const { data: prodData } = await supabase
      .from('products')
      .select('*')
      .eq('restaurant_id', restData.id)
      .order('created_at', { ascending: false });

    if (prodData) setProducts(prodData);
    setLoading(false);
  };

  useEffect(() => {
    fetchRestaurantAndProducts();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setDescription('');
    setPrice('');
    setCategory(categories[0] || 'Antipasti');
    setImageFile(null);
    setImagePreview(null);
  };

  const handleAddCategory = async () => {
    if (!newCatInput.trim() || !restaurant) return;
    const catName = newCatInput.trim();
    if (categories.includes(catName)) return;

    const updatedCategories = [...categories, catName];
    const { error } = await supabase
      .from('restaurants')
      .update({ custom_categories: updatedCategories })
      .eq('id', restaurant.id);

    if (!error) {
      setCategories(updatedCategories);
      setCategory(catName);
      setNewCatInput('');
    } else {
      alert(`Errore aggiunta categoria: ${error.message}`);
    }
  };

  const handleDeleteCategory = async (catToDelete: string) => {
    if (!confirm(`Vuoi davvero eliminare la categoria "${catToDelete}"?`)) return;

    const updatedCategories = categories.filter((c) => c !== catToDelete);
    const { error } = await supabase
      .from('restaurants')
      .update({ custom_categories: updatedCategories })
      .eq('id', restaurant.id);

    if (!error) {
      setCategories(updatedCategories);
      if (category === catToDelete && updatedCategories.length > 0) {
        setCategory(updatedCategories[0]);
      }
    } else {
      alert(`Errore eliminazione categoria: ${error.message}`);
    }
  };

  const handleEditClick = (p: Product) => {
    setEditingId(p.id);
    setName(p.name);
    setDescription(p.description || '');
    setPrice(p.price.toString());
    setCategory(p.category || categories[0] || 'Antipasti');
    setImagePreview(p.image_url);
    setImageFile(null);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
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
    if (!name || !price || !restaurant) return;
    setSaving(true);

    let imageUrl = imagePreview;
    if (imageFile) {
      const uploadedUrl = await uploadImage(imageFile);
      if (uploadedUrl) imageUrl = uploadedUrl;
    }

    const payload: any = {
      restaurant_id: restaurant.id,
      name,
      description,
      price: parseFloat(price.replace(',', '.')),
      category,
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
      alert(`Errore salvataggio: ${error.message}`);
    }
    setSaving(false);
  };

  const toggleAvailability = async (id: string, currentStatus: boolean) => {
    const { error } = await supabase
      .from('products')
      .update({ is_available: !currentStatus })
      .eq('id', id);

    if (!error) fetchRestaurantAndProducts();
  };

  const handleDeleteProduct = async (id: string) => {
    if (!confirm('Eliminare definitivamente questo piatto?')) return;
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (!error) fetchRestaurantAndProducts();
  };

  if (loading) {
    return <div className="min-h-screen bg-slate-900 text-slate-100 p-6">Caricamento menu...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Header con Nome Ristorante Dinamico */}
        <div className="flex justify-between items-center border-b border-slate-800 pb-4">
          <div>
            <span className="text-xs text-amber-500 font-bold uppercase">Gestione Carta</span>
            <h1 className="text-2xl font-bold">{restaurant?.name}</h1>
          </div>
          <Link href="/dashboard" className="text-sm text-amber-500 hover:underline">
            &larr; Torna alla Dashboard
          </Link>
        </div>

        {/* Gestione Categorie */}
        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 space-y-4">
          <h2 className="text-sm font-bold text-amber-500">Gestione Categorie Menu</h2>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Nome nuova categoria..."
              value={newCatInput}
              onChange={(e) => setNewCatInput(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded p-2.5 text-xs text-white flex-1 focus:outline-none focus:border-amber-500"
            />
            <button
              onClick={handleAddCategory}
              className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold text-xs px-4 py-2 rounded transition"
            >
              + Aggiungi Categoria
            </button>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {categories.map((cat) => (
              <div key={cat} className="flex items-center gap-2 bg-slate-900 border border-slate-700 px-3 py-1.5 rounded-lg text-xs">
                <span>{cat}</span>
                <button
                  onClick={() => handleDeleteCategory(cat)}
                  className="text-rose-400 hover:text-rose-300 font-bold ml-1"
                  title="Elimina categoria"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Form Gestione Piatto con Anteprima Immagine */}
        <form onSubmit={handleSaveProduct} className="bg-slate-800 p-6 rounded-xl border border-slate-700 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-amber-500">
              {editingId ? 'Modifica Piatto' : 'Aggiungi Nuovo Piatto'}
            </h2>
            {editingId && (
              <button type="button" onClick={resetForm} className="text-xs text-slate-400 hover:text-white underline">
                Annulla Modifica
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input
              type="text"
              placeholder="Nome Piatto"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded p-3 text-white focus:outline-none focus:border-amber-500 text-sm"
              required
            />

            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded p-3 text-white focus:outline-none focus:border-amber-500 text-sm"
            >
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            <input
              type="number"
              step="0.01"
              placeholder="Prezzo (€)"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded p-3 text-white focus:outline-none focus:border-amber-500 text-sm"
              required
            />
          </div>

          <input
            type="text"
            placeholder="Descrizione ingredienti..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded p-3 text-white focus:outline-none focus:border-amber-500 text-sm"
          />

          <div className="flex flex-col sm:flex-row items-center gap-4 pt-2">
            <div className="w-full flex items-center gap-3">
              {imagePreview ? (
                <img src={imagePreview} alt="Anteprima" className="w-12 h-12 rounded object-cover border border-amber-500" />
              ) : (
                <div className="w-12 h-12 rounded bg-slate-900 border border-slate-700 flex items-center justify-center text-[10px] text-slate-500 text-center">No Img</div>
              )}
              
              <div className="flex-1">
                <label className="block text-xs text-slate-400 mb-1">Immagine Piatto</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-slate-700 file:text-white"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full sm:w-auto bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold px-6 py-3 rounded transition text-sm whitespace-nowrap self-end"
            >
              {saving ? 'Salvataggio...' : editingId ? 'Aggiorna Piatto' : 'Aggiungi al Menu'}
            </button>
          </div>
        </form>

        {/* Lista Prodotti */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <div className="p-4 border-b border-slate-700 font-semibold flex justify-between items-center">
            <span>Prodotti in Carta ({products.length})</span>
          </div>

          {products.length === 0 ? (
            <div className="p-6 text-center text-slate-400">Nessun piatto presente nel menu.</div>
          ) : (
            <div className="divide-y divide-slate-700">
              {products.map((item) => (
                <div key={item.id} className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.name} className="w-12 h-12 rounded object-cover bg-slate-900" />
                    ) : (
                      <div className="w-12 h-12 rounded bg-slate-900 border border-slate-700 flex items-center justify-center text-xs text-slate-500">No img</div>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-lg">{item.name}</h3>
                        <span className="text-[10px] bg-slate-700 px-2 py-0.5 rounded text-amber-400">{item.category}</span>
                      </div>
                      <p className="text-sm text-slate-400">{item.description}</p>
                      <span className="text-amber-500 font-bold mt-1 inline-block">
                        € {Number(item.price).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                    <button
                      onClick={() => toggleAvailability(item.id, item.is_available ?? true)}
                      className={`px-3 py-1.5 rounded text-xs font-bold border transition ${
                        (item.is_available ?? true)
                          ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500/30'
                          : 'bg-rose-600/20 text-rose-400 border-rose-500/30'
                      }`}
                    >
                      {(item.is_available ?? true) ? 'Visibile Utente' : 'Nascosto'}
                    </button>

                    <button
                      onClick={() => handleEditClick(item)}
                      className="px-3 py-1.5 rounded text-xs font-semibold bg-slate-700 hover:bg-slate-600 text-white"
                    >
                      Modifica
                    </button>

                    <button
                      onClick={() => handleDeleteProduct(item.id)}
                      className="px-3 py-1.5 rounded text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20"
                    >
                      Elimina
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}