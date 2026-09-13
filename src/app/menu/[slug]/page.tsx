'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface CategoryItem {
  id: string;
  name: string;
  display_order?: number;
}

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  category?: string;
  category_id?: string | null;
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
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOwnerView, setIsOwnerView] = useState(false);

  // Stato carrello e checkout pubblico
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [orderType, setOrderType] = useState<'takeaway' | 'delivery'>('takeaway');
  const [pickupTime, setPickupTime] = useState('');
  const [generalNotes, setGeneralNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);

  // Stato pannello admin (Gestione Categorie)
  const [newCatInput, setNewCatInput] = useState('');
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatName, setEditingCatName] = useState('');
  const [showTrashView, setShowTrashView] = useState(false);

  // Stato Aggiunta Nuovo Piatto (Top Admin)
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newSelectedCatId, setNewSelectedCatId] = useState<string>('');
  const [newImageFile, setNewImageFile] = useState<File | null>(null);
  const [newImagePreview, setNewImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Stato Modifica Inline Piatto
  const [inlineEditingProdId, setInlineEditingProdId] = useState<string | null>(null);
  const [editProdName, setEditProdName] = useState('');
  const [editProdDesc, setEditProdDesc] = useState('');
  const [editProdPrice, setEditProdPrice] = useState('');
  const [editProdCatId, setEditProdCatId] = useState('');
  const [editProdImageFile, setEditProdImageFile] = useState<File | null>(null);
  const [editProdImagePreview, setEditProdImagePreview] = useState<string | null>(null);

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

        if (restData.order_time_slots && restData.order_time_slots.length > 0) {
          setPickupTime(restData.order_time_slots[0]);
        }
      }
      
      setLoading(false);
    };

    init();
  }, [slug, supabase]);

  const fetchPublicData = async (restaurantId: string) => {
    const { data: catData } = await supabase
      .from('categories')
      .select('id, name, display_order')
      .eq('restaurant_id', restaurantId)
      .order('display_order', { ascending: true });

    const catList: CategoryItem[] = catData && catData.length > 0 
      ? catData.filter(c => c.name !== 'TRASH') 
      : [{ id: 'default', name: 'Antipasti' }];
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
      .select('id, name, display_order')
      .eq('restaurant_id', restaurantId)
      .order('display_order', { ascending: true });

    let cats: CategoryItem[] = catData || [];
    
    // Assicura l'esistenza della categoria TRASH per l'admin
    if (!cats.some(c => c.name === 'TRASH')) {
      const { data: trashIns } = await supabase
        .from('categories')
        .insert([{ restaurant_id: restaurantId, name: 'TRASH', display_order: 999 }])
        .select()
        .single();
      if (trashIns) cats.push(trashIns);
    }

    setCategories(cats);
    const nonTrash = cats.filter(c => c.name !== 'TRASH');
    if (nonTrash.length > 0 && !newSelectedCatId) {
      setNewSelectedCatId(nonTrash[0].id);
    }

    const { data: prodData } = await supabase
      .from('products')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false });

    if (prodData) setProducts(prodData);
  };

  const getAvailableTimeSlots = () => {
    const customSlots = restaurant?.order_time_slots;
    if (customSlots && Array.isArray(customSlots) && customSlots.length > 0) {
      return customSlots.sort();
    }
    return [];
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
  const deliveryFee = orderType === 'delivery' ? Math.max(0, Number(restaurant?.delivery_fee) || 0) : 0;
  const finalTotal = totalAmount + deliveryFee;

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (cart.length === 0 || !restaurant) return;
    if (!customerName || !customerPhone || !customerEmail || !pickupTime) {
      alert('Compila tutti i campi obbligatori, compreso l\'orario.');
      return;
    }

    setSubmitting(true);
    const todayDate = new Date().toISOString().split('T')[0];

    const orderPayload = {
      restaurant_id: restaurant.id,
      customer_name: customerName,
      customer_phone: customerPhone,
      customer_email: customerEmail,
      order_type: orderType,
      items: cart,
      total_amount: finalTotal,
      pickup_date: todayDate,
      pickup_time: pickupTime,
      notes: [generalNotes, deliveryFee > 0 ? `[Consegna €${deliveryFee.toFixed(2)}]` : ''].filter(Boolean).join(' '),
      status: 'pending',
    };

    const { data: insertedOrder, error } = await supabase
      .from('orders')
      .insert([orderPayload])
      .select()
      .single();

    if (!error && insertedOrder) {
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
            totalAmount: finalTotal,
            items: cart,
          }),
        });
      } catch (err) {
        console.error('Errore invio email automatica:', err);
      }

      setOrderSuccess(true);
      setCart([]);
    } else {
      alert(`Errore invio ordine: ${error?.message}`);
      setSubmitting(false);
    }
  };

  const handleAddCategory = async () => {
    if (!newCatInput.trim() || !restaurant) return;
    const catName = newCatInput.trim();
    if (categories.some(c => c.name.toLowerCase() === catName.toLowerCase())) return;

    const { data, error } = await supabase
      .from('categories')
      .insert([{ restaurant_id: restaurant.id, name: catName, display_order: categories.length }])
      .select()
      .single();

    if (!error && data) {
      const updated = [...categories, data];
      setCategories(updated);
      setNewSelectedCatId(data.id);
      setNewCatInput('');
    } else {
      alert(`Errore aggiunta categoria: ${error?.message}`);
    }
  };

  // ELIMINAZIONE CATEGORIA CON SPOSTAMENTO DEI PIATTI IN TRASH
  const handleDeleteCategory = async (catId: string, catName: string) => {
    if (catName === 'TRASH') {
      alert('Non puoi eliminare la categoria TRASH.');
      return;
    }
    if (!confirm(`Vuoi davvero eliminare la categoria "${catName}"? I piatti associati verranno spostati in TRASH.`)) return;

    let trashCat = categories.find((c) => c.name === 'TRASH');
    if (!trashCat) {
      const { data: tData } = await supabase
        .from('categories')
        .insert([{ restaurant_id: restaurant.id, name: 'TRASH', display_order: 999 }])
        .select()
        .single();
      if (tData) {
        trashCat = tData;
        setCategories((prev) => [...prev, tData]);
      }
    }

    if (trashCat) {
      await supabase
        .from('products')
        .update({ category_id: trashCat.id, category: 'TRASH' })
        .eq('category_id', catId);
    }

    const { error } = await supabase.from('categories').delete().eq('id', catId);

    if (!error) {
      fetchAdminData(restaurant.id);
    } else {
      alert(`Errore eliminazione categoria: ${error.message}`);
    }
  };

  const handleUpdateCategory = async (catId: string) => {
    if (!editingCatName.trim()) return;
    const { error } = await supabase
      .from('categories')
      .update({ name: editingCatName.trim() })
      .eq('id', catId);

    if (!error) {
      setCategories(categories.map((c) => c.id === catId ? { ...c, name: editingCatName.trim() } : c));
      setEditingCatId(null);
      setEditingCatName('');
    } else {
      alert(`Errore aggiornamento: ${error.message}`);
    }
  };

  const handleMoveCategoryOrder = async (index: number, direction: 'up' | 'down') => {
    const nonTrash = categories.filter((c) => c.name !== 'TRASH');
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= nonTrash.length) return;

    const temp = nonTrash[index];
    nonTrash[index] = nonTrash[targetIndex];
    nonTrash[targetIndex] = temp;

    const trashCat = categories.find((c) => c.name === 'TRASH');
    const updatedAll = trashCat ? [...nonTrash, trashCat] : nonTrash;

    setCategories(updatedAll);

    for (let i = 0; i < updatedAll.length; i++) {
      await supabase.from('categories').update({ display_order: i }).eq('id', updatedAll[i].id);
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

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newPrice || !restaurant) return;
    setSaving(true);

    let imageUrl = newImagePreview;
    if (newImageFile) {
      const uploadedUrl = await uploadImage(newImageFile);
      if (uploadedUrl) imageUrl = uploadedUrl;
    }

    const selectedCatObj = categories.find(c => c.id === newSelectedCatId);

    const payload = {
      restaurant_id: restaurant.id,
      name: newName,
      description: newDesc,
      price: parseFloat(newPrice.replace(',', '.')),
      category_id: newSelectedCatId || null,
      category: selectedCatObj ? selectedCatObj.name : null,
      image_url: imageUrl,
      is_available: true,
    };

    const { error } = await supabase.from('products').insert([payload]);

    if (!error) {
      setNewName('');
      setNewDesc('');
      setNewPrice('');
      setNewImageFile(null);
      setNewImagePreview(null);
      fetchAdminData(restaurant.id);
    } else {
      alert(`Errore: ${error.message}`);
    }
    setSaving(false);
  };

  // SALVATAGGIO MODIFICA INLINE PIATTO
  const handleSaveInlineEdit = async (productId: string) => {
    let imageUrl = editProdImagePreview;
    if (editProdImageFile) {
      const uploadedUrl = await uploadImage(editProdImageFile);
      if (uploadedUrl) imageUrl = uploadedUrl;
    }

    const selectedCatObj = categories.find(c => c.id === editProdCatId);

    const payload = {
      name: editProdName,
      description: editProdDesc,
      price: parseFloat(editProdPrice.replace(',', '.')),
      category_id: editProdCatId || null,
      category: selectedCatObj ? selectedCatObj.name : null,
      image_url: imageUrl,
    };

    const { error } = await supabase.from('products').update(payload).eq('id', productId);

    if (!error) {
      setInlineEditingProdId(null);
      fetchAdminData(restaurant.id);
    } else {
      alert(`Errore aggiornamento piatto: ${error.message}`);
    }
  };

  const toggleAvailability = async (id: string, currentStatus: boolean) => {
    const { error } = await supabase
      .from('products')
      .update({ is_available: !currentStatus })
      .eq('id', id);

    if (!error && restaurant) fetchAdminData(restaurant.id);
  };

  const handleDeleteProduct = async (id: string) => {
    if (!confirm('Eliminare definitivamente questo piatto?')) return;
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
            onClick={() => {
              setOrderSuccess(false);
              setSubmitting(false);
            }}
            className="bg-amber-500 text-slate-900 font-bold px-6 py-2 rounded-lg text-xs"
          >
            Fai un altro ordine
          </button>
        </div>
      </div>
    );
  }

  const isOrderingDisabled = restaurant.takeaway_enabled === false && restaurant.delivery_enabled === false;

  // --- VISTA CLIENTE ---
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
              const catProducts = products.filter((p) => {
                if (p.category_id) return p.category_id === cat.id;
                return (p.category || '').trim().toLowerCase() === cat.name.trim().toLowerCase();
              });
              if (catProducts.length === 0) return null;

              return (
                <div key={cat.id} className="space-y-3">
                  <h2 className="text-sm font-bold text-amber-500 uppercase tracking-wider border-b border-slate-800 pb-1">{cat.name}</h2>
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

                        {!isOrderingDisabled && (
                          <button
                            onClick={() => addToCart(product)}
                            className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold text-xs px-4 py-2 rounded-lg whitespace-nowrap transition"
                          >
                            Aggiungi
                          </button>
                        )}
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

              <div className="border-t border-slate-700 pt-3 space-y-1 text-sm">
                {deliveryFee > 0 && (
                  <div className="flex justify-between text-xs text-slate-300">
                    <span>Consegna a domicilio:</span>
                    <span className="font-mono">€ {deliveryFee.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold">
                  <span>Totale:</span>
                  <span className="text-emerald-400 font-mono">€ {finalTotal.toFixed(2)}</span>
                </div>
              </div>

              <form onSubmit={handleCheckout} className="space-y-4 pt-2">
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Nome e cognome *</label>
                    <input
                      type="text"
                      required
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Inserisci il tuo nome e cognome"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Numero di telefono *</label>
                    <input
                      type="tel"
                      required
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="Inserisci il numero di telefono"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Email *</label>
                    <input
                      type="email"
                      required
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      placeholder="Inserisci la tua email"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Modalità di ordine</label>
                    {isOrderingDisabled ? (
                      <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-lg text-center font-bold text-[11px] uppercase tracking-wide">
                        ASPORTO NON DISPONIBILE SU QUESTA PIATTAFORMA
                      </div>
                    ) : (
                      <select
                        value={orderType}
                        onChange={(e) => setOrderType(e.target.value as 'takeaway' | 'delivery')}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs text-white focus:outline-none focus:border-amber-500"
                      >
                        {restaurant.takeaway_enabled !== false && <option value="takeaway">Ritiro in sede (Asporto)</option>}
                        {restaurant.delivery_enabled !== false && <option value="delivery">Consegna a domicilio</option>}
                      </select>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Orario di ritiro/consegna *</label>
                    <select
                      required
                      value={pickupTime}
                      onChange={(e) => setPickupTime(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs text-white focus:outline-none focus:border-amber-500"
                    >
                      <option value="" disabled>Seleziona un orario</option>
                      {getAvailableTimeSlots().map((slot: string) => (
                        <option key={slot} value={slot}>{slot}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Note</label>
                  <textarea
                    placeholder="Note generali (opzionale)"
                    value={generalNotes}
                    onChange={(e) => setGeneralNotes(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                    rows={2}
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting || isOrderingDisabled}
                  className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-900 font-bold p-3 rounded-lg text-xs transition uppercase tracking-wider"
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
    <div className="min-h-screen bg-slate-900 text-white p-4 sm:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        
        <header className="flex justify-between items-center bg-slate-800 p-5 rounded-xl border border-slate-700">
          <div>
            <span className="text-[10px] text-amber-500 font-bold uppercase tracking-widest">Gestione Carta</span>
            <h1 className="text-xl font-black">{restaurant?.name}</h1>
          </div>
          <Link href="/dashboard" className="bg-slate-700 hover:bg-slate-600 text-xs text-white font-semibold px-3 py-2 rounded-lg transition-colors">
            Torna alla Dashboard
          </Link>
        </header>

        {/* GESTIONE CATEGORIE CON PULSANTE TRASH E RIORDINO */}
        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 space-y-4">
          <div className="flex justify-between items-center border-b border-slate-700 pb-2">
            <h2 className="text-sm font-bold text-amber-500 uppercase">Gestione Categorie Menu</h2>
            <button
              onClick={() => setShowTrashView(!showTrashView)}
              className={`text-xs px-3 py-1.5 rounded font-bold border transition ${
                showTrashView ? 'bg-amber-500 text-slate-900 border-amber-500' : 'bg-slate-900 text-amber-400 border-slate-700 hover:bg-slate-700'
              }`}
            >
              🗑️ Categoria TRASH
            </button>
          </div>

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

          <div className="space-y-2 pt-1">
            {categories.filter(c => c.name !== 'TRASH').map((cat, index, arr) => (
              <div key={cat.id} className="flex items-center justify-between bg-slate-900 border border-slate-700 px-3 py-2 rounded-lg text-xs font-semibold">
                {editingCatId === cat.id ? (
                  <div className="flex items-center gap-2 flex-1 mr-2">
                    <input
                      type="text"
                      value={editingCatName}
                      onChange={(e) => setEditingCatName(e.target.value)}
                      className="bg-slate-800 border border-amber-500 rounded p-1 text-white flex-1 text-xs"
                    />
                    <button onClick={() => handleUpdateCategory(cat.id)} className="bg-emerald-600 text-white px-2.5 py-1 rounded font-bold">Salva</button>
                    <button onClick={() => setEditingCatId(null)} className="bg-slate-700 text-white px-2.5 py-1 rounded">Annulla</button>
                  </div>
                ) : (
                  <span className="text-white">{cat.name}</span>
                )}

                {editingCatId !== cat.id && (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleMoveCategoryOrder(index, 'up')}
                      disabled={index === 0}
                      className="bg-slate-800 hover:bg-slate-700 disabled:opacity-30 p-1 rounded text-[10px]"
                      title="Sposta su"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => handleMoveCategoryOrder(index, 'down')}
                      disabled={index === arr.length - 1}
                      className="bg-slate-800 hover:bg-slate-700 disabled:opacity-30 p-1 rounded text-[10px]"
                      title="Sposta giù"
                    >
                      ▼
                    </button>
                    <button
                      onClick={() => { setEditingCatId(cat.id); setEditingCatName(cat.name); }}
                      className="bg-slate-700 hover:bg-slate-600 text-amber-400 px-2.5 py-1 rounded font-bold"
                    >
                      Modifica
                    </button>
                    <button
                      onClick={() => handleDeleteCategory(cat.id, cat.name)}
                      className="bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 px-2.5 py-1 rounded font-bold"
                      title="Elimina categoria"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* FORM AGGIUNTA NUOVO PIATTO (NON VISIBILE SE SI È IN VISTA TRASH) */}
        {!showTrashView && (
          <form onSubmit={handleAddProduct} className="bg-slate-800 p-6 rounded-xl border border-slate-700 space-y-4">
            <h2 className="text-lg font-semibold text-amber-500">Aggiungi Nuovo Piatto</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <input
                type="text"
                placeholder="Nome Piatto"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-white text-xs focus:outline-none focus:border-amber-500"
                required
              />

              <select
                value={newSelectedCatId}
                onChange={(e) => setNewSelectedCatId(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-white text-xs focus:outline-none focus:border-amber-500"
              >
                {categories.filter(c => c.name !== 'TRASH').map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

              <input
                type="number"
                step="0.01"
                placeholder="Prezzo (€)"
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-white text-xs focus:outline-none focus:border-amber-500"
                required
              />
            </div>

            <input
              type="text"
              placeholder="Descrizione (opzionale)"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white text-xs focus:outline-none focus:border-amber-500"
            />

            <div className="flex flex-col sm:flex-row items-center gap-4 pt-2">
              <div className="w-full flex items-center gap-3">
                {newImagePreview ? (
                  <img src={newImagePreview} alt="Anteprima" className="w-12 h-12 rounded object-cover border border-amber-500" />
                ) : (
                  <div className="w-12 h-12 rounded bg-slate-900 border border-slate-700 flex items-center justify-center text-[10px] text-slate-500 text-center">No Img</div>
                )}
                
                <div className="flex-1">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) { setNewImageFile(file); setNewImagePreview(URL.createObjectURL(file)); }
                    }}
                    className="w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-slate-700 file:text-white"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full sm:w-auto bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold px-6 py-3 rounded-lg transition text-xs whitespace-nowrap self-end"
              >
                {saving ? 'Salvataggio...' : 'Aggiungi al Menu'}
              </button>
            </div>
          </form>
        )}

        {/* LISTA CATEGORIE E PIATTI CON MODIFICA INLINE */}
        <div className="space-y-6">
          {categories
            .filter((cat) => showTrashView ? cat.name === 'TRASH' : cat.name !== 'TRASH')
            .map((cat) => {
              const catProducts = products.filter((p) => {
                if (p.category_id) return p.category_id === cat.id;
                return (p.category || '').trim().toLowerCase() === cat.name.trim().toLowerCase();
              });

              if (catProducts.length === 0 && !showTrashView) return null;

              return (
                <div key={cat.id} className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden space-y-1">
                  <div className="p-4 bg-slate-800/80 border-b border-slate-700 font-bold text-amber-400 text-sm uppercase tracking-wider flex justify-between">
                    <span>{cat.name === 'TRASH' ? '🗑️ Categoria TRASH (Piatti Orfani)' : cat.name}</span>
                    <span className="text-xs text-slate-400">({catProducts.length} piatti)</span>
                  </div>

                  <div className="divide-y divide-slate-700/60">
                    {catProducts.map((item) => {
                      const isInlineEditing = inlineEditingProdId === item.id;

                      return (
                        <div key={item.id} className="p-4 space-y-3">
                          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                            <div className="flex items-center gap-4">
                              {item.image_url ? (
                                <img src={item.image_url} alt={item.name} className="w-12 h-12 rounded object-cover bg-slate-900 border border-slate-700" />
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

                            <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end text-xs">
                              <button
                                onClick={() => toggleAvailability(item.id, item.is_available ?? true)}
                                className={`px-3 py-1.5 rounded font-bold border transition ${
                                  (item.is_available ?? true)
                                    ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500/30'
                                    : 'bg-rose-600/20 text-rose-400 border-rose-500/30'
                                }`}
                              >
                                {(item.is_available ?? true) ? 'Visibile' : 'Nascosto'}
                              </button>

                              <button
                                onClick={() => {
                                  if (isInlineEditing) {
                                    setInlineEditingProdId(null);
                                  } else {
                                    setInlineEditingProdId(item.id);
                                    setEditProdName(item.name);
                                    setEditProdDesc(item.description || '');
                                    setEditProdPrice(item.price.toString());
                                    setEditProdCatId(item.category_id || cat.id);
                                    setEditProdImagePreview(item.image_url);
                                    setEditProdImageFile(null);
                                  }
                                }}
                                className="px-3 py-1.5 rounded font-semibold bg-slate-700 hover:bg-slate-600 text-white"
                              >
                                {isInlineEditing ? 'Chiudi' : 'Modifica'}
                              </button>

                              <button
                                onClick={() => handleDeleteProduct(item.id)}
                                className="px-3 py-1.5 rounded font-semibold bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20"
                              >
                                Elimina
                              </button>
                            </div>
                          </div>

                          {/* FORM DI MODIFICA INLINE SUBITO SOTTO IL PIATTO */}
                          {isInlineEditing && (
                            <div className="bg-slate-900 border border-amber-500/40 p-4 rounded-xl space-y-3 text-xs mt-3">
                              <span className="font-bold text-amber-400 block uppercase text-[10px]">Modifica Piatto</span>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <input
                                  type="text"
                                  placeholder="Nome Piatto"
                                  value={editProdName}
                                  onChange={(e) => setEditProdName(e.target.value)}
                                  className="bg-slate-800 border border-slate-700 rounded p-2.5 text-white text-xs"
                                />
                                <select
                                  value={editProdCatId}
                                  onChange={(e) => setEditProdCatId(e.target.value)}
                                  className="bg-slate-800 border border-slate-700 rounded p-2.5 text-white text-xs"
                                >
                                  {categories.map((c) => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                  ))}
                                </select>
                                <input
                                  type="number"
                                  step="0.01"
                                  placeholder="Prezzo (€)"
                                  value={editProdPrice}
                                  onChange={(e) => setEditProdPrice(e.target.value)}
                                  className="bg-slate-800 border border-slate-700 rounded p-2.5 text-white text-xs"
                                />
                              </div>
                              <input
                                type="text"
                                placeholder="Descrizione"
                                value={editProdDesc}
                                onChange={(e) => setEditProdDesc(e.target.value)}
                                className="w-full bg-slate-800 border border-slate-700 rounded p-2.5 text-white text-xs"
                              />
                              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) { setEditProdImageFile(file); setEditProdImagePreview(URL.createObjectURL(file)); }
                                  }}
                                  className="text-slate-400 text-xs w-full"
                                />
                                <div className="flex gap-2 w-full sm:w-auto justify-end">
                                  <button
                                    type="button"
                                    onClick={() => setInlineEditingProdId(null)}
                                    className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded font-bold text-xs"
                                  >
                                    Annulla
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleSaveInlineEdit(item.id)}
                                    className="bg-amber-500 hover:bg-amber-600 text-slate-900 px-4 py-2 rounded font-bold text-xs whitespace-nowrap"
                                  >
                                    Salva Modifiche
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}