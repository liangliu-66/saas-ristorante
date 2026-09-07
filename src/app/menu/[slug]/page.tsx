'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useParams, useRouter } from 'next/navigation';
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

interface CartItem extends Product {
  quantity: number;
  itemNote?: string;
}

export default function MenuPage() {
  const params = useParams();
  const slug = params?.slug as string;
  const router = useRouter();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [restaurant, setRestaurant] = useState<any>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOwnerView, setIsOwnerView] = useState(false);

  // Stato carrello e checkout pubblico
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState(''); // <-- STATO EMAIL AGGIUNTO
  const [orderType, setOrderType] = useState<'takeaway' | 'delivery'>('takeaway');
  const [pickupTime, setPickupTime] = useState('19:30');
  const [generalNotes, setGeneralNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);

  // Stato pannello admin (se proprietario)
  const [newCatInput, setNewCatInput] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: restData } = await supabase
            .from('restaurants')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle();

          if (restData && (!slug || restData.slug === slug)) {
            setRestaurant(restData);
            setIsOwnerView(true);
            await fetchAdminData(restData.id);
            setLoading(false);
            return;
          }
        }
      }

      if (slug) {
        const { data: restData, error: restError } = await supabase
          .from('restaurants')
          .select('*')
          .eq('slug', slug)
          .maybeSingle();

        if (restError || !restData) {
          setLoading(false);
          return;
        }

        setRestaurant(restData);
        setIsOwnerView(false);
        await fetchPublicData(restData.id);
      }
      
      setLoading(false);
    };

    init();
  }, [slug, supabase]);

  const fetchPublicData = async (restaurantId: string) => {
    const { data: catData } = await supabase
      .from('categories')
      .select('*')
      .eq('restaurant_id', restaurantId);

    const catList = catData && catData.length > 0 
      ? catData.map((c: any) => c.name) 
      : ["Antipasti", "Primi", "Secondi", "Pizza", "Dolci", "Bevande"];
    setCategories(catList);

    const { data: prodData } = await supabase
      .from('products')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('is_available', true);

    if (prodData) setProducts(prodData);
  };

  const fetchAdminData = async (restaurantId: string) => {
    const { data: catData } = await supabase
      .from('categories')
      .select('*')
      .eq('restaurant_id', restaurantId);

    const catList = catData && catData.length > 0 
      ? catData.map((c: any) => c.name) 
      : ["Antipasti", "Primi", "Secondi", "Pizza", "Dolci", "Bevande"];
      
    setCategories(catList);
    setCategory(catList[0] || 'Antipasti');

    const { data: prodData } = await supabase
      .from('products')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false });

    if (prodData) setProducts(prodData);
  };

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        return prev.map((item) => 
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart((prev) => {
      return prev.map((item) => {
        if (item.id === id) {
          const newQty = item.quantity + delta;
          return newQty > 0 ? { ...item, quantity: newQty } : null;
        }
        return item;
      }).filter(Boolean) as CartItem[];
    });
  };

  const totalAmount = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0 || !restaurant) return;
    if (!customerName || !customerPhone || !customerEmail) {
      alert('Inserisci nome, telefono ed email per procedere.');
      return;
    }

    setSubmitting(true);
    const todayDate = new Date().toISOString().split('T')[0];

    const orderPayload = {
      restaurant_id: restaurant.id,
      customer_name: customerName,
      customer_phone: customerPhone,
      customer_email: customerEmail, // <-- SALVATAGGIO EMAIL NEL DB
      order_type: orderType,
      items: cart,
      total_amount: totalAmount,
      pickup_date: todayDate,
      pickup_time: pickupTime,
      notes: generalNotes,
      status: 'pending',
    };

    const { data: insertedOrder, error } = await supabase
      .from('orders')
      .insert([orderPayload])
      .select()
      .single();

    if (!error && insertedOrder) {
      // Chiamata immediata a Resend per l'email di ricezione ordine
      try {
        await fetch('/api/notify-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: insertedOrder.id,
            customerPhone: customerPhone,
            customerEmail: customerEmail,
            customerName: customerName,
            newStatus: 'pending',
            orderType: orderType,
            pickupTime: pickupTime,
            type: 'order',
            restaurantName: restaurant?.name,
            totalAmount: totalAmount,
          }),
        });
      } catch (err) {
        console.error('Errore invio email automatica:', err);
      }

      setOrderSuccess(true);
      setCart([]);
    } else {
      alert(`Errore invio ordine: ${error?.message}`);
    }
    setSubmitting(false);
  };

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

    const { error } = await supabase
      .from('categories')
      .insert([{ restaurant_id: restaurant.id, name: catName }]);

    if (!error) {
      const updated = [...categories, catName];
      setCategories(updated);
      setCategory(catName);
      setNewCatInput('');
    } else {
      alert(`Errore aggiunta categoria: ${error.message}`);
    }
  };

  const handleDeleteCategory = async (catToDelete: string) => {
    if (!confirm(`Vuoi davvero eliminare la categoria "${catToDelete}"?`)) return;

    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('restaurant_id', restaurant.id)
      .eq('name', catToDelete);

    if (!error) {
      const updated = categories.filter((c) => c !== catToDelete);
      setCategories(updated);
      if (category === catToDelete && updated.length > 0) {
        setCategory(updated[0]);
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
    setCategory(p.category || categories[0]);
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

    if (uploadError) return null;
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
      fetchAdminData(restaurant.id);
    } else {
      alert(`Errore: ${error.message}`);
    }
    setSaving(false);
  };

  const toggleAvailability = async (id: string, currentStatus: boolean) => {
    const { error } = await supabase
      .from('products')
      .update({ is_available: !currentStatus })
      .eq('id', id);

    if (!error && restaurant) fetchAdminData(restaurant.id);
  };

  const handleDeleteProduct = async (id: string) => {
    if (!confirm('Eliminare questo piatto dal menu?')) return;
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (!error && restaurant) fetchAdminData(restaurant.id);
  };

  if (loading) return <div className="p-8 text-white bg-slate-900 min-h-screen text-xs">Caricamento...</div>;

  if (!restaurant) {
    return (
      <div className="p-8 text-white bg-slate-900 min-h-screen text-center space-y-4">
        <h1 className="text-xl font-bold">Ristorante non trovato</h1>
        <p className="text-xs text-slate-400">Verifica l'indirizzo del menu.</p>
      </div>
    );
  }

  if (!isOwnerView && orderSuccess) {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-6 flex items-center justify-center">
        <div className="bg-slate-800 p-8 rounded-xl border border-slate-700 text-center space-y-4 max-w-md w-full">
          <h2 className="text-xl font-bold text-amber-500">Ordine Inviato con Successo!</h2>
          <p className="text-xs text-slate-300">
            Il ristorante ha ricevuto il tuo ordine. Ti abbiamo inviato una conferma all'indirizzo <strong>{customerEmail}</strong>.
          </p>
          <button
            onClick={() => setOrderSuccess(false)}
            className="bg-amber-500 text-slate-900 font-bold px-6 py-2 rounded-lg text-xs"
          >
            Fai un altro ordine
          </button>
        </div>
      </div>
    );
  }

  if (!isOwnerView) {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-4 sm:p-6 pb-24">
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 text-center space-y-2">
            <h1 className="text-2xl font-black text-amber-400">{restaurant.name}</h1>
            <p className="text-xs text-slate-400">{restaurant.description || 'Menu digitale e ordini d\'asporto'}</p>
          </div>

          <div className="space-y-6">
            {categories.map((cat) => {
              const catProducts = products.filter((p) => (p.category || 'Antipasti') === cat);
              if (catProducts.length === 0) return null;

              return (
                <div key={cat} className="space-y-3">
                  <h2 className="text-sm font-bold text-amber-500 uppercase tracking-wider border-b border-slate-800 pb-1">{cat}</h2>
                  <div className="grid grid-cols-1 gap-3">
                    {catProducts.map((product) => (
                      <div key={product.id} className="bg-slate-800/80 p-4 rounded-xl border border-slate-700 flex justify-between items-center gap-4">
                        <div className="flex items-center gap-3">
                          {product.image_url && (
                            <img src={product.image_url} alt={product.name} className="w-14 h-14 rounded-lg object-cover bg-slate-900" />
                          )}
                          <div>
                            <h3 className="font-bold text-sm">{product.name}</h3>
                            <p className="text-xs text-slate-400">{product.description}</p>
                            <span className="text-amber-400 font-mono font-bold text-xs mt-1 block">€ {Number(product.price).toFixed(2)}</span>
                          </div>
                        </div>

                        <button
                          onClick={() => addToCart(product)}
                          className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold text-xs px-4 py-2 rounded-lg whitespace-nowrap transition"
                        >
                          Aggiungi
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {cart.length > 0 && (
            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 space-y-4 sticky bottom-4 shadow-xl">
              <h2 className="text-sm font-bold text-amber-500 uppercase tracking-wider">Riepilogo Ordine</h2>
              
              <div className="divide-y divide-slate-700/60 max-h-48 overflow-y-auto">
                {cart.map((item) => (
                  <div key={item.id} className="py-2 flex justify-between items-center text-xs">
                    <div>
                      <span className="font-semibold">{item.name}</span>
                      <span className="text-slate-400 block">€ {item.price.toFixed(2)} cad.</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => updateQuantity(item.id, -1)} className="bg-slate-700 px-2 py-1 rounded">-</button>
                      <span className="font-bold font-mono">{item.quantity}</span>
                      <button onClick={() => updateQuantity(item.id, 1)} className="bg-slate-700 px-2 py-1 rounded">+</button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-slate-700 pt-3 flex justify-between font-bold text-sm">
                <span>Totale:</span>
                <span className="text-emerald-400 font-mono">€ {totalAmount.toFixed(2)}</span>
              </div>

              <form onSubmit={handleCheckout} className="space-y-3 pt-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    required
                    placeholder="Il tuo nome *"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                  <input
                    type="tel"
                    required
                    placeholder="Numero di telefono *"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                {/* CAMPO EMAIL OBBLIGATORIO AGGIUNTO NEL FORM */}
                <input
                  type="email"
                  required
                  placeholder="Indirizzo Email (per la conferma) *"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs text-white focus:outline-none focus:border-amber-500"
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <select
                    value={orderType}
                    onChange={(e) => setOrderType(e.target.value as 'takeaway' | 'delivery')}
                    className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="takeaway">Ritiro in sede (Asporto)</option>
                    <option value="delivery">Consegna a domicilio</option>
                  </select>

                  <input
                    type="time"
                    value={pickupTime}
                    onChange={(e) => setPickupTime(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <textarea
                  placeholder="Note generali (opzionale)"
                  value={generalNotes}
                  onChange={(e) => setGeneralNotes(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs text-white focus:outline-none focus:border-amber-500"
                  rows={2}
                />

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold p-3 rounded-lg text-xs transition uppercase tracking-wider"
                >
                  {submitting ? 'Invio in corso...' : 'Conferma ed Invia Ordine'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- VISTA GESTIONE MENU (ADMIN) ---
  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex justify-between items-center border-b border-slate-800 pb-4">
          <div>
            <span className="text-xs text-amber-500 font-bold uppercase">Gestione Carta</span>
            <h1 className="text-2xl font-bold">{restaurant?.name}</h1>
          </div>
          <Link href="/dashboard" className="text-sm bg-slate-800 hover:bg-slate-700 text-amber-500 font-bold px-4 py-2 rounded-xl">
            ← Torna alla Dashboard
          </Link>
        </div>

        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 space-y-4">
          <h2 className="text-sm font-bold text-amber-500">Gestione Categorie Menu</h2>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Crea nuova categoria..."
              value={newCatInput}
              onChange={(e) => setNewCatInput(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white flex-1 focus:outline-none focus:border-amber-500"
            />
            <button
              onClick={handleAddCategory}
              className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold text-xs px-4 py-2 rounded-lg whitespace-nowrap transition"
            >
              + Aggiungi Categoria
            </button>
          </div>

          <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-700/60">
            {categories.map((cat) => (
              <div key={cat} className="flex items-center gap-2 bg-slate-900 border border-slate-700 px-3 py-1.5 rounded-lg text-xs font-semibold">
                <span className="text-white">{cat}</span>
                <button
                  onClick={() => handleDeleteCategory(cat)}
                  className="text-rose-400 hover:text-rose-200 font-bold ml-1 px-1 transition"
                  title="Elimina categoria"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

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
              className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-white text-xs focus:outline-none focus:border-amber-500"
              required
            />

            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-white text-xs focus:outline-none focus:border-amber-500"
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
              className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-white text-xs focus:outline-none focus:border-amber-500"
              required
            />
          </div>

          <input
            type="text"
            placeholder="Descrizione (opzionale)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white text-xs focus:outline-none focus:border-amber-500"
          />

          <div className="flex flex-col sm:flex-row items-center gap-4 pt-2">
            <div className="w-full flex items-center gap-3">
              {imagePreview ? (
                <img src={imagePreview} alt="Anteprima" className="w-12 h-12 rounded object-cover border border-amber-500" />
              ) : (
                <div className="w-12 h-12 rounded bg-slate-900 border border-slate-700 flex items-center justify-center text-[10px] text-slate-500 text-center">No Img</div>
              )}
              
              <div className="flex-1">
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
              className="w-full sm:w-auto bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold px-6 py-3 rounded-lg transition text-xs whitespace-nowrap self-end"
            >
              {saving ? 'Salvataggio...' : editingId ? 'Aggiorna Piatto' : 'Aggiungi al Menu'}
            </button>
          </div>
        </form>

        <div className="space-y-6">
          {categories.map((catName) => {
            const catProducts = products.filter((p) => (p.category || 'Antipasti') === catName);
            if (catProducts.length === 0) return null;

            return (
              <div key={catName} className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden space-y-1">
                <div className="p-4 bg-slate-800/80 border-b border-slate-700 font-bold text-amber-400 text-sm uppercase tracking-wider flex justify-between">
                  <span>{catName}</span>
                  <span className="text-xs text-slate-400">({catProducts.length} piatti)</span>
                </div>

                <div className="divide-y divide-slate-700/60">
                  {catProducts.map((item) => (
                    <div key={item.id} className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        {item.image_url ? (
                          <img src={item.image_url} alt={item.name} className="w-12 h-12 rounded object-cover bg-slate-900" />
                        ) : (
                          <div className="w-12 h-12 rounded bg-slate-900 border border-slate-700 flex items-center justify-center text-xs text-slate-500">No img</div>
                        )}
                        <div>
                          <h3 className="font-semibold text-base">{item.name}</h3>
                          <p className="text-xs text-slate-400">{item.description}</p>
                          <span className="text-amber-500 font-bold text-xs mt-0.5 inline-block">
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
                          {(item.is_available ?? true) ? 'Visibile' : 'Nascosto'}
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
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}