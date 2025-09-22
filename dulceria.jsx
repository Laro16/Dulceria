/* dulceria.jsx (versión segura)
   Si React/ReactDOM no están definidos, muestra un mensaje en #root en lugar de fallar.
   Mantiene la lógica para cargar products.xlsx / products.json y muestra la UI.
*/

(function(){
  // Si no existe React o ReactDOM, mostramos un error legible en pantalla y salimos.
  if (!window.React || !window.ReactDOM) {
    document.addEventListener('DOMContentLoaded', () => {
      const root = document.getElementById('root');
      if (root) {
        root.innerHTML = `
          <div class="max-w-2xl mx-auto p-6 text-center">
            <h2 class="text-lg font-bold text-red-600 mb-3">Error: librerías no cargaron</h2>
            <p class="text-sm text-gray-700">Revisa la consola del navegador (F12) para ver el error.<br/>
            Asegúrate de que <code>react</code> y <code>react-dom</code> estén accesibles desde los CDNs en <code>index.html</code>.</p>
            <pre id="debugConsole" class="mt-4 text-left text-xs bg-gray-100 p-3 rounded"></pre>
          </div>
        `;
        // pequeño intento de copiar el error de consola (si hay)
        const dbg = document.getElementById('debugConsole');
        try { dbg.textContent = 'React: ' + String(window.React) + '\\nReactDOM: ' + String(window.ReactDOM); } catch(e) {}
      }
    });
    return;
  }

  // Si llegamos aquí, React y ReactDOM existen
  const React = window.React;
  const ReactDOM = window.ReactDOM;

  /* ------------------ Helpers ------------------ */
  function slugify(text) {
    return String(text || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ñ/g, 'n').replace(/Ñ/g, 'n')
      .toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
  function parsePrice(v) {
    if (v == null) return 0;
    const s = String(v).trim().replace(/\s+/g, '');
    const n = parseFloat(s.replace(/[^\d.,-]/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }
  function handleImgError(e) {
    e.target.onerror = null;
    e.target.src = 'https://via.placeholder.com/600x400?text=Sin+imagen';
  }
  const moneyFmt = new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ', maximumFractionDigits: 2 });

  /* ImageWithModal (igual que antes) */
  function ImageWithModal({ src, alt, className = 'w-11/12 h-36 mx-auto', imgClass = 'object-contain' }) {
    const { useState, useEffect } = React;
    const [open, setOpen] = useState(false);
    useEffect(() => {
      function onKey(e) { if (e.key === 'Escape') setOpen(false); }
      if (open) window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [open]);

    return (
      <>
        <button onClick={(e) => { e.preventDefault(); setOpen(true); }} aria-label={`Ver imagen de ${alt}`} className={`block overflow-hidden bg-gray-100 rounded ${className}`} style={{ border: 'none', padding: 0 }}>
          <img src={src} alt={alt} loading="lazy" onError={handleImgError} className={`${imgClass} w-full h-full`} />
        </button>

        {open && (
          <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4" onClick={() => setOpen(false)}>
            <div className="max-w-[95%] max-h-[95%] overflow-auto rounded" onClick={(e) => e.stopPropagation()}>
              <div className="relative bg-black rounded">
                <button onClick={() => setOpen(false)} aria-label="Cerrar" className="absolute top-2 right-2 z-10 rounded bg-black/40 text-white p-2" style={{ backdropFilter: 'blur(2px)' }}>✕</button>
                <img src={src} alt={alt} onError={handleImgError} className="max-w-full max-h-[80vh] object-contain block mx-auto" style={{ display: 'block' }} />
              </div>
              <div className="text-center text-sm text-gray-200 mt-3">{alt}</div>
            </div>
          </div>
        )}
      </>
    );
  }

  function normalizeProduct(raw, idFallback) {
    const name = (raw.name ?? raw.Nombre ?? raw.nombre ?? '').toString().trim();
    const price = parsePrice(raw.price ?? raw.Precio ?? raw.precio ?? raw.Price);
    const description = (raw.description ?? raw.Descripcion ?? raw.descripcion ?? raw.short ?? '').toString();
    const category = (raw.category ?? raw.Categoria ?? raw.categoria ?? 'Sin categoría').toString();
    let rawImage = (raw.image ?? raw.Imagen ?? raw.imagen ?? raw.Image ?? '').toString().trim();

    let image = rawImage;
    if (!image) {
      image = `./src/${slugify(name)}.jpg`;
    } else if (/^https?:\/\//i.test(image)) {
      // usar tal cual
    } else if (image.startsWith('./') || image.startsWith('/')) {
      // usar tal cual
    } else if (image.startsWith('src/')) {
      image = `./${image}`;
    } else {
      image = `./src/${image}`;
    }

    if (!/\.[a-zA-Z0-9]{2,5}$/.test(image) && !/^https?:\/\//i.test(image)) {
      image = `${image}.jpg`;
    }

    return {
      id: raw.id ?? idFallback,
      name,
      price,
      short: description,
      description,
      category,
      image,
    };
  }

  /* Main app (usando React dentro) */
  function DulceriaApp() {
    const { useState, useMemo, useEffect } = React;

    const [products, setProducts] = useState([]);
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState('Todos');
    const [minPrice, setMinPrice] = useState(0);
    const [maxPrice, setMaxPrice] = useState(10000);
    const [visibleCount, setVisibleCount] = useState(12);

    const [cart, setCart] = useState([]);
    const [cartOpen, setCartOpen] = useState(false);

    useEffect(() => {
      let mounted = true;

      async function tryLoadXlsx() {
        try {
          // si XLSX no existe, provocará error y caerá al catch -> es aceptable
          const res = await fetch('./products.xlsx', { cache: 'no-store' });
          if (!res.ok) throw new Error('no xlsx');
          const ab = await res.arrayBuffer();
          const workbook = XLSX.read(ab, { type: 'array' });

          const preferNames = ['Products', 'products', 'Productos', 'productos', 'Sheet1'];
          let sheetName = workbook.SheetNames.find(n => preferNames.includes(n)) || workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

          const mapped = rows.map((r, i) => normalizeProduct(r, i + 1));
          if (mounted) setProducts(mapped);
          return true;
        } catch (err) {
          return false;
        }
      }

      async function tryLoadJson() {
        try {
          const res = await fetch('./products.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('no json');
          const data = await res.json();
          if (!Array.isArray(data)) return false;
          const mapped = data.map((p, i) => normalizeProduct(p, p.id ?? i + 1));
          if (mounted) setProducts(mapped);
          return true;
        } catch (err) {
          return false;
        }
      }

      (async () => {
        const okXlsx = await tryLoadXlsx();
        if (!okXlsx) await tryLoadJson();
      })();

      return () => { mounted = false; };
    }, []);

    const categories = useMemo(() => {
      const set = new Set(['Todos', ...products.map(p => p.category ?? 'Sin categoría')]);
      return Array.from(set);
    }, [products]);

    const filtered = useMemo(() => {
      const q = query.trim().toLowerCase();
      return products
        .filter(p => (category === 'Todos' ? true : (p.category ?? '') === category))
        .filter(p => (p.price ?? 0) >= Number(minPrice) && (p.price ?? 0) <= Number(maxPrice))
        .filter(p => ((p.name ?? '') + ' ' + (p.category ?? '')).toLowerCase().includes(q));
    }, [products, category, query, minPrice, maxPrice]);

    const visibleProducts = filtered.slice(0, visibleCount);

    // carrito simple
    function addToCart(product) {
      setCart(prev => {
        const found = prev.find(x => x.id === product.id);
        if (found) return prev.map(x => x.id === product.id ? { ...x, qty: x.qty + 1 } : x);
        return [...prev, { ...product, qty: 1 }];
      });
    }
    function updateQty(id, qty) { setCart(prev => prev.map(p => p.id === id ? { ...p, qty: Math.max(1, Number(qty) || 1) } : p)); }
    function removeFromCart(id) { setCart(prev => prev.filter(p => p.id !== id)); }

    const subtotal = cart.reduce((s, p) => s + (p.price || 0) * p.qty, 0);
    const taxes = +(subtotal * 0.12).toFixed(2);
    const total = +(subtotal + taxes).toFixed(2);

    function generateWhatsAppMessage() {
      if (cart.length === 0) return '';
      let lines = ['Pedido desde Dulcería:\\n'];
      cart.forEach(p => lines.push(`${p.qty} x ${p.name} - ${moneyFmt.format((p.price || 0) * p.qty)}`));
      lines.push(`\\nSubtotal: ${moneyFmt.format(subtotal)}`);
      lines.push(`Impuestos: ${moneyFmt.format(taxes)}`);
      lines.push(`Total: ${moneyFmt.format(total)}`);
      lines.push('\\nDatos de entrega: (escribe aquí tu nombre, dirección y teléfono)');
      return encodeURIComponent(lines.join('\\n'));
    }
    function openWhatsApp() {
      const text = generateWhatsAppMessage();
      if (!text) return alert('El carrito está vacío.');
      window.open(`https://wa.me/?text=${text}`, '_blank');
    }

    return (
      <div className="min-h-screen bg-gray-50 text-gray-800">
        <header className="bg-white shadow">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full overflow-hidden bg-pink-400 flex items-center justify-center">
                <img src="./src/logo.png" alt="Logo" onError={(e)=>{e.target.onerror=null; e.target.style.display='none';}} className="w-full h-full object-contain" />
                <span className="text-white font-bold select-none">D</span>
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-bold">Dulcería La Fiesta</h1>
                <p className="text-xs sm:text-sm text-gray-500">Catálogo — imágenes en <code className="text-xs">./src/</code></p>
              </div>
            </div>

            <nav className="hidden md:flex gap-3 items-center">
              {categories.map(c => (
                <button key={c} className={`px-3 py-2 rounded ${category === c ? 'bg-pink-100 text-pink-700' : 'hover:bg-gray-100'}`} onClick={() => { /* setCategory */ }}>
                  {c}
                </button>
              ))}
            </nav>

            <div className="flex items-center gap-3">
              <button onClick={() => {/* open cart */}} className="relative p-2 rounded-md bg-white hover:bg-gray-50">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4" />
                </svg>
                {cart.length > 0 && <span className="absolute -right-2 -top-2 bg-pink-600 text-white text-xs rounded-full px-1.5">{cart.length}</span>}
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-6xl mx-auto px-3 sm:px-4 py-5">
          <section className="bg-white rounded-lg p-3 sm:p-4 shadow-sm mb-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="col-span-1 md:col-span-2 flex items-center gap-2">
                <input aria-label="Buscar productos" value={query} onChange={e => setQuery(e.target.value)} className="w-full border rounded px-3 py-2 text-sm" placeholder="Buscar por nombre o categoría..." />
              </div>

              <div className="flex gap-2 items-center justify-end">
                <select value={category} onChange={e => setCategory(e.target.value)} className="border rounded px-3 py-2 text-sm">
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>

                <input type="number" min={0} value={minPrice} onChange={e => setMinPrice(e.target.value)} className="w-20 border rounded px-2 py-2 text-sm" placeholder="Min" />
                <input type="number" min={0} value={maxPrice} onChange={e => setMaxPrice(e.target.value)} className="w-20 border rounded px-2 py-2 text-sm" placeholder="Max" />

                <button onClick={() => { setQuery(''); setCategory('Todos'); setMinPrice(0); setMaxPrice(10000); setVisibleCount(12); }} className="ml-1 px-3 py-2 border rounded text-sm">Limpiar</button>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">Productos ({filtered.length})</h2>

            {visibleProducts.length === 0 ? (
              <div className="bg-white rounded-lg p-6 text-center shadow">No se encontraron productos.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {visibleProducts.map(p => (
                  <article key={p.id} className="bg-white rounded shadow-sm overflow-hidden flex flex-col">
                    <ImageWithModal src={p.image || `./src/${slugify(p.name)}.jpg`} alt={p.name} className="w-11/12 h-36 mx-auto mt-3" imgClass="object-contain" />
                    <div className="p-3 flex-1 flex flex-col">
                      <h3 className="font-semibold text-sm sm:text-base">{p.name}</h3>
                      <p className="text-xs sm:text-sm text-gray-500 flex-1">{p.short || p.description}</p>
                      <div className="mt-3 flex items-center justify-between">
                        <div className="text-base sm:text-lg font-bold">{moneyFmt.format(p.price || 0)}</div>
                        <button onClick={() => addToCart(p)} className="px-3 py-2 bg-pink-500 text-white rounded text-sm sm:text-sm">Agregar</button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}

            {visibleCount < filtered.length && (
              <div className="mt-6 text-center">
                <button onClick={() => setVisibleCount(v => v + 12)} className="px-4 py-2 border rounded">Cargar más</button>
              </div>
            )}
          </section>
        </main>

        <footer className="mt-10 py-6 text-center text-sm text-gray-500">© {new Date().getFullYear()} Dulcería La Fiesta — Hecho con cariño</footer>
      </div>
    );
  }

  // expose
  window.DulceriaApp = DulceriaApp;
})();
