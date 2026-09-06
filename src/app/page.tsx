'use client';

import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col font-sans selection:bg-amber-500 selection:text-slate-900">
      {/* Header / Navbar */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-black text-xl tracking-tight">
            <span className="bg-amber-500 text-slate-900 px-2 py-0.5 rounded-lg text-sm font-extrabold">SaaS</span>
            <span>Menuvibes</span>
          </div>
          <div className="flex items-center gap-4">
            <Link 
              href="/login" 
              className="text-sm font-medium text-slate-300 hover:text-white transition-colors"
            >
              Accedi
            </Link>
            <Link 
              href="/onboarding" 
              className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold px-4 py-2 rounded-lg text-sm transition-colors"
            >
              Crea Locale
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 px-6 max-w-5xl mx-auto text-center space-y-6">
        <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full text-amber-400 text-xs font-semibold">
          ✨ La piattaforma digitale per la ristorazione moderna
        </div>
        <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-tight">
          Il Menu Digitale che <br className="hidden sm:inline" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-amber-600">
            Aumenta gli Ordini
          </span> d'Asporto e Delivery.
        </h1>
        <p className="text-slate-400 text-base sm:text-lg max-w-2xl mx-auto leading-relaxed">
          Offri ai tuoi clienti un’esperienza simile alle grandi piattaforme di delivery. Menu QR Code, gestione asporto, consegne e prenotazione tavoli senza commissioni per ordine.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <Link
            href="/onboarding"
            className="w-full sm:w-auto bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold px-8 py-4 rounded-xl text-base transition-colors shadow-lg shadow-amber-500/10"
          >
            Inizia Ora Gratis
          </Link>
          <a
            href="/menu/nomsushivibes"
            target="_blank"
            className="w-full sm:w-auto bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold px-8 py-4 rounded-xl text-base transition-colors flex items-center justify-center gap-2"
          >
            <span>📱 Vedi Demo Live</span>
            <span className="text-xs text-amber-500">(/menu/nomsushivibes)</span>
          </a>
        </div>
      </section>

      {/* Funzionalità */}
      <section className="py-16 bg-slate-800/50 border-y border-slate-800 px-6">
        <div className="max-w-6xl mx-auto space-y-12">
          <div className="text-center space-y-2">
            <h2 className="text-2xl sm:text-3xl font-bold">Tutto ciò di cui ha bisogno il tuo Locale</h2>
            <p className="text-slate-400 text-sm">Un'unica suite per gestire la sala, l'asporto e la consegna a domicilio.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 space-y-3">
              <div className="w-10 h-10 bg-amber-500/10 text-amber-500 rounded-xl flex items-center justify-center font-bold text-lg">🥡</div>
              <h3 className="font-bold text-lg">Asporto & Delivery</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                I clienti scelgono i piatti, impostano l'orario di ritiro o la consegna e ti inviano l'ordine in batch direttamente.
              </p>
            </div>

            <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 space-y-3">
              <div className="w-10 h-10 bg-amber-500/10 text-amber-500 rounded-xl flex items-center justify-center font-bold text-lg">📅</div>
              <h3 className="font-bold text-lg">Prenotazione Tavoli</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Gestisci le richieste di prenotazione sala con indicazione di orario, numero commensali e note per richieste speciali.
              </p>
            </div>

            <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 space-y-3">
              <div className="w-10 h-10 bg-amber-500/10 text-amber-500 rounded-xl flex items-center justify-center font-bold text-lg">🕒</div>
              <h3 className="font-bold text-lg">Orari Differenziati</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Imposta orari indipendenti per la sala, per il ritiro d'asporto e per le consegne a domicilio secondo le tue esigenze.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Piani & Prezzi */}
      <section className="py-20 px-6 max-w-5xl mx-auto space-y-12">
        <div className="text-center space-y-2">
          <h2 className="text-2xl sm:text-3xl font-bold">Piani Trasparenti, Zero Commissioni</h2>
          <p className="text-slate-400 text-sm">Nessuna percentuale sugli ordini. Mantieni il 100% dei tuoi incassi.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
          {/* Piano Base */}
          <div className="bg-slate-800/60 p-8 rounded-2xl border border-slate-700 space-y-6 flex flex-col justify-between">
            <div className="space-y-4">
              <div>
                <h3 className="font-bold text-xl">Menu Digitale</h3>
                <p className="text-slate-400 text-xs">Ideale per la consultazione al tavolo</p>
              </div>
              <div className="text-3xl font-black">€19 <span className="text-xs text-slate-400 font-normal">/ mese</span></div>
              <ul className="space-y-2 text-sm text-slate-300">
                <li className="flex items-center gap-2">✓ Menu QR Code illimitato</li>
                <li className="flex items-center gap-2">✓ Caricamento immagini piatti</li>
                <li className="flex items-center gap-2">✓ Categorie e allergeni</li>
                <li className="flex items-center gap-2">✓ Slug personalizzato e stabile</li>
              </ul>
            </div>
            <Link href="/onboarding" className="block text-center bg-slate-700 hover:bg-slate-600 font-bold p-3 rounded-xl transition-colors text-sm">
              Attiva Piano Base
            </Link>
          </div>

          {/* Piano Pro */}
          <div className="bg-slate-800 p-8 rounded-2xl border-2 border-amber-500 space-y-6 flex flex-col justify-between relative shadow-xl shadow-amber-500/5">
            <div className="absolute -top-3 right-6 bg-amber-500 text-slate-900 text-[10px] font-black uppercase px-3 py-1 rounded-full">
              Consigliato
            </div>
            <div className="space-y-4">
              <div>
                <h3 className="font-bold text-xl">Full Takeaway & Delivery</h3>
                <p className="text-slate-400 text-xs">La soluzione completa per vendere online</p>
              </div>
              <div className="text-3xl font-black text-amber-500">€39 <span className="text-xs text-slate-400 font-normal">/ mese</span></div>
              <ul className="space-y-2 text-sm text-slate-300">
                <li className="flex items-center gap-2">✓ Tutto il piano Menu Digitale</li>
                <li className="flex items-center gap-2">✓ Carrello e ordini in batch</li>
                <li className="flex items-center gap-2">✓ Gestione Asporto e Delivery</li>
                <li className="flex items-center gap-2">✓ Gestione Prenotazione Tavoli</li>
                <li className="flex items-center gap-2">✓ Orari differenziati gestibili</li>
              </ul>
            </div>
            <Link href="/onboarding" className="block text-center bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold p-3 rounded-xl transition-colors text-sm">
              Inizia la Prova Gratuita
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-800 py-8 px-6 text-center text-xs text-slate-500">
        <p>© 2026 Menuvibes SaaS. Tutti i diritti riservati.</p>
      </footer>
    </div>
  );
}