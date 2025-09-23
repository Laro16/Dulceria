/* dulceria.jsx
   Actualizado:
   - Se rediseñó el control de cantidad y el botón "Agregar" como un grupo compacto para solucionar el desbordamiento en vistas de 2 columnas.
*/

const { useState, useMemo, useEffect } = React;

// Helper para el efecto de dulces
function triggerConfetti() {
  if (window.confetti) {
    window.confetti({
      particleCount: 80,
      spread: 60,
      origin: { y: 0.7 },
      shapes: ['circle', 'square'],
      colors: ['#f472b6', '#ec4899', '#db2777', '#ffffff', '#fed7aa']
    });
  }
}

/* Helpers */
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

/* Image + modal */
function ImageWithModal({ src, alt, className = 'w-[72%] max-w-[220px] h-36 mx-auto', imgClass = 'object-contain' }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') setOpen(false); }
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        onClick={(e) => { e.preventDefault(); setOpen(true); }}
        aria-label={`Ver imagen de ${alt}`}
        className={`block overflow-hidden bg-gray-100 rounded ${className}`}
        style={{ border: 'none', padding: 0 }}
      >
        <img src={src} alt={alt} loading="lazy" onError={handleImgError} className={`${imgClass} w-full h-full`} />
      </button>

      {open && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80 p-4" onClick={() => setOpen(false)}>
          <div className="max-w-[95%] max-h-[95%] overflow-auto rounded" onClick={(e) => e.stopPropagation()}>
            <div className="relative bg-black rounded">
              <button onClick={() => setOpen(false)} aria-label="Cerrar" className="absolute top-2 right-2 z-10 rounded bg-black/40 text-white p-2" style={{ backdropFilter: 'blur(2px)' }}>✕</button>
              <img src={src} alt={alt} onError={handleImgError} className="max-w-full max-h-[80vh] object-contain block mx-auto" />
            </div>
            <div className="text-center text-sm text-gray-200 mt-3">{alt}</div>
          </div>
        </div>
      )}
    </>
  );
}

/* Normaliza producto */
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
    // url completa
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

/* App principal */
function DulceriaApp() {
  const [products, setProducts] = useState([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Todos');
  const [minPrice, setMinPrice] = useState(0);
  const [maxPrice, setMaxPrice] = useState(10000);
  const [visibleCount, setVisibleCount] = useState(12);

  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);

  const [quantities, setQuantities] = useState({});

  const [logoVisible, setLogoVisible] = useState(true);
  const [cartImgVisible, setCartImgVisible] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function tryLoadXlsx() {
      try {
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

  function handleQuantityChange(productId, qty) {
    const newQty = Math.max(1, Number(qty) || 1);
    setQuantities(prev => ({ ...prev, [productId]: newQty }));
  }

  function incrementQuantity(productId) {
    const currentQty = quantities[productId] || 1;
    handleQuantityChange(productId, currentQty + 1);
  }

  function decrementQuantity(productId) {
    const currentQty = quantities[productId] || 1;
    handleQuantityChange(productId, currentQty - 1);
  }

  function addToCart(product, qtyToAdd) {
    setCart(prev => {
      const found = prev.find(x => x.id === product.id);
      if (found) {
        return prev.map(x => x.id === product.id ? { ...x, qty: x.qty + qtyToAdd } : x);
      }
      return [...prev, { ...product, qty: qtyToAdd }];
    });
  }
  function updateQty(id, qty) { setCart(prev => prev.map(p => p.id === id ? { ...p, qty: Math.max(1, Number(qty) || 1) } : p)); }
  function removeFromCart(id) { setCart(prev => prev.filter(p => p.id !== id)); }

  const subtotal = cart.reduce((s, p) => s + (p.price || 0) * p.qty, 0);
  const taxes = +(subtotal * 0.12).toFixed(2);
  const total = +(subtotal + taxes).toFixed(2);

  function generateWhatsAppMessage() {
    if (cart.length === 0) return '';
    let lines = ['Pedido desde Dulcería:\n'];
    cart.forEach(p => lines.push(`${p.qty} x ${p.name} - ${moneyFmt.format((p.price || 0) * p.qty)}`));
    lines.push(`\nSubtotal: ${moneyFmt.format(subtotal)}`);
    lines.push(`Impuestos: ${moneyFmt.format(taxes)}`);
    lines.push(`Total: ${moneyFmt.format(total)}`);
    lines.push('\nDatos de entrega: (escribe aquí tu nombre, dirección y teléfono)');
    return encodeURIComponent(lines.join('\n'));
  }
  function openWhatsApp() {
    const text = generateWhatsAppMessage();
    if (!text) return alert('El carrito está vacío.');
    window.open(`https://wa.me/?text=${text}`, '_blank');
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      {/* Header fijo */}
      <header className="bg-white shadow sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-3 flex items-center justify-between gap-2">
          
          <a href="./" className="flex items-center gap-2 sm:gap-3 min-w-0 flex-shrink-0 no-underline text-current">
            <div className="flex-shrink-0">
              <img
                src="./src/logo.png"
                alt="Dulcería La Fiesta"
                onLoad={() => setLogoVisible(true)}
                onError={(e) => { setLogoVisible(false); e.target.style.display = 'none'; }}
                className="h-10 sm:h-12 object-contain"
                style={{ display: logoVisible ? 'block' : 'none' }}
              />
            </div>
            {!logoVisible && (
              <div className="text-xl font-bold select-none">Dulcería La Fiesta</div>
            )}
            <div className="truncate hidden sm:block">
              <div className="text-sm sm:text-lg font-semibold truncate">La Fiesta</div>
              <div className="text-xs text-gray-500 truncate">Dulces y sorpresas</div>
            </div>
          </a>

          <nav className="flex-grow min-w-0 md:hidden">
            <div className="flex items-center overflow-x-auto whitespace-nowrap scrollbar-hide">
              {categories.map(c => (
                <button key={c} className={`px-3 py-2 rounded text-sm flex-shrink-0 ${category === c ? 'bg-pink-100 text-pink-700' : 'hover:bg-gray-100'}`} onClick={() => { setCategory(c); triggerConfetti(); }}>
                  {c}
                </button>
              ))}
            </div>
          </nav>

          <div className="flex items-center gap-3 flex-shrink-0">
            <nav className="hidden md:flex gap-3 items-center mr-2">
              {categories.map(c => (
                <button key={c} className={`px-3 py-2 rounded ${category === c ? 'bg-pink-100 text-pink-700' : 'hover:bg-gray-100'}`} onClick={() => { setCategory(c); triggerConfetti(); }}>
                  {c}
                </button>
              ))}
            </nav>
            <button onClick={() => setCartOpen(true)} className="relative p-2 rounded-md bg-white hover:bg-gray-50" aria-label="Abrir carrito">
              <img
                src="./src/carrito.png"
                alt="Carrito"
                onLoad={() => setCartImgVisible(true)}
                onError={(e) => { setCartImgVisible(false); e.target.style.display = 'none'; }}
                className="h-6 w-6 object-contain"
                style={{ display: cartImgVisible ? 'block' : 'none' }}
              />
              {!cartImgVisible && (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4" />
                </svg>
              )}
              {cart.length > 0 && <span className="absolute -right-2 -top-2 bg-pink-600 text-white text-xs rounded-full px-1.5">{cart.length}</span>}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-3 sm:px-4 py-4" style={{ paddingTop: 8 }}>
        <section className="bg-white rounded-lg p-3 sm:p-4 shadow-sm mb-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="col-span-1 md:col-span-2 flex items-center gap-2">
              <input aria-label="Buscar productos" value={query} onChange={e => setQuery(e.target.value)} className="w-full border rounded px-3 py-2 text-sm" placeholder="Buscar por nombre o categoría..." />
            </div>
            <div className="flex gap-2 items-center justify-end">
              <select value={category} onChange={e => setCategory(e.target.value)} className="border rounded px-3 py-2 text-sm">
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-3">Productos ({filtered.length})</h2>
          {visibleProducts.length === 0 ? (
            <div className="bg-white rounded-lg p-6 text-center shadow">No se encontraron productos.</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {visibleProducts.map(p => (
                <article key={p.id} className="bg-white rounded shadow-sm overflow-hidden flex flex-col">
                  <ImageWithModal src={p.image || `./src/${slugify(p.name)}.jpg`} alt={p.name} className="w-[72%] max-w-[220px] h-36 mx-auto mt-3" imgClass="object-contain" />
                  <div className="p-3 flex-1 flex flex-col">
                    <h3 className="font-semibold text-sm sm:text-base truncate">{p.name}</h3>
                    <p className="text-xs sm:text-sm text-gray-500 flex-1">{p.short || p.description}</p>
                    
                    <div className="mt-3 space-y-2">
                      <div className="text-base sm:text-lg font-bold">{moneyFmt.format(p.price || 0)}</div>
                      
                      {/* INICIO DE LA CORRECCIÓN */}
                      <div className="flex justify-end">
                        <div className="flex items-stretch">
                          <div className="flex items-center border border-gray-300 rounded-l-md">
                             <button onClick={() => decrementQuantity(p.id)} className="px-1.5 text-lg leading-none">-</button>
                             <input
                               type="text"
                               inputMode="numeric"
                               aria-label={`Cantidad para ${p.name}`}
                               value={quantities[p.id] || 1}
                               onChange={(e) => handleQuantityChange(p.id, e.target.value)}
                               className="w-8 text-center border-none text-sm bg-transparent"
                             />
                             <button onClick={() => incrementQuantity(p.id)} className="px-1.5 text-lg leading-none">+</button>
                          </div>
                          <button onClick={() => { addToCart(p, quantities[p.id] || 1); triggerConfetti(); }} className="px-2 py-1 bg-pink-500 text-white rounded-r-md text-sm border border-pink-500">
                            Agregar
                          </button>
                        </div>
                      </div>
                      {/* FIN DE LA CORRECCIÓN */}

                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
          {visibleCount < filtered.length && (
            <div className="mt-6 text-center">
              <button onClick={() => { setVisibleCount(v => v + 12); triggerConfetti(); }} className="px-4 py-2 border rounded">Cargar más</button>
            </div>
          )}
        </section>
      </main>

      {/* Carrito lateral */}
      <div className={`fixed top-0 right-0 h-full w-full md:w-96 bg-white shadow-xl transform ${cartOpen ? 'translate-x-0' : 'translate-x-full'} transition-transform`} style={{ zIndex: 60 }}>
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="text-lg font-bold">Tu carrito</h3>
          <div className="flex items-center gap-2">
            <button onClick={() => setCart([])} className="text-sm text-red-500">Vaciar</button>
            <button onClick={() => setCartOpen(false)} className="px-2 py-1 border rounded">Cerrar</button>
          </div>
        </div>
        <div className="p-4 space-y-4 overflow-auto" style={{ maxHeight: 'calc(100% - 220px)' }}>
          {cart.length === 0 ? (
            <div className="text-center text-gray-500">No hay productos en el carrito.</div>
          ) : (
            cart.map(p => (
              <div key={p.id} className="flex items-center gap-3">
                <ImageWithModal src={p.image || `./src/${slugify(p.name)}.jpg`} alt={p.name} className="w-20 h-16" imgClass="object-contain" />
                <div className="flex-1">
                  <div className="font-semibold text-sm truncate">{p.name}</div>
                  <div className="text-xs text-gray-500">{moneyFmt.format(p.price || 0)}</div>
                </div>
                <div className="flex items-center gap-2">
                  <input type="number" value={p.qty} min={1} onChange={e => updateQty(p.id, e.target.value)} className="w-16 border rounded px-2 py-1 text-sm" />
                  <button onClick={() => removeFromCart(p.id)} className="text-sm text-red-500">Eliminar</button>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="p-4 border-t">
          <div className="flex justify-between mb-2"><span>Subtotal</span><span>{moneyFmt.format(subtotal)}</span></div>
          <div className="flex justify-between mb-2"><span>Impuestos</span><span>{moneyFmt.format(taxes)}</span></div>
          <div className="flex justify-between font-bold text-lg mb-4"><span>Total</span><span>{moneyFmt.format(total)}</span></div>
          <button onClick={() => { openWhatsApp(); triggerConfetti(); }} className="w-full px-4 py-3 bg-green-600 text-white rounded mb-2 text-sm">Ordenar por WhatsApp</button>
        </div>
      </div>

      <footer className="mt-8 sm:mt-10 py-6 text-center text-sm text-gray-500">© {new Date().getFullYear()} Dulcería La Fiesta — Hecho con cariño</footer>
    </div>
  );
}

// export
window.DulceriaApp = DulceriaApp;
