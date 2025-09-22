/* dulceria.jsx
   Actualizado: header con fondo, 20 productos por página, sin filtros de precio,
   ordenamiento (precio asc/desc/promoción), promo desde Excel (promo, fecha final de promo).
   Mantiene: carga automática products.xlsx | products.json, ImageWithModal, carrito, móvil.
*/

const { useState, useMemo, useEffect } = React;

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

/* ------------------ Image + Modal ------------------ */
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
              <button onClick={() => setOpen(false)} aria-label="Cerrar" className="absolute top-2 right-2 z-10 rounded bg-black/40 text-white p-2">✕</button>
              <img src={src} alt={alt} onError={handleImgError} className="max-w-full max-h-[80vh] object-contain block mx-auto" />
            </div>
            <div className="text-center text-sm text-gray-200 mt-3">{alt}</div>
          </div>
        </div>
      )}
    </>
  );
}

/* ------------------ Normalización de producto (ahora con promo) ------------------ */
function normalizeProduct(raw, idFallback) {
  const name = (raw.name ?? raw.Nombre ?? raw.nombre ?? '').toString().trim();
  const price = parsePrice(raw.price ?? raw.Precio ?? raw.precio ?? raw.Price);
  const description = (raw.description ?? raw.Descripcion ?? raw.descripcion ?? raw.short ?? '').toString();
  const category = (raw.category ?? raw.Categoria ?? raw.categoria ?? 'Sin categoría').toString();

  // promo price: puede venir en varias columnas: promo, Promo, promo_price
  const promoRaw = (raw.promo ?? raw.Promo ?? raw.PROMO ?? raw.promo_price ?? raw['promo price'] ?? raw['promo_price'] ?? '').toString().trim();
  const promo = promoRaw ? parsePrice(promoRaw) : null;

  // promo end date (texto libre) - varias variantes de nombres
  const promoEndRaw = (
    raw['fecha final de promo'] ??
    raw['fecha_final_de_promo'] ??
    raw['promo_end'] ??
    raw['promoFecha'] ??
    raw['fecha promo'] ??
    raw['fecha_promocion'] ??
    raw['fecha'] ??
    raw['promo_end_date'] ??
    ''
  ).toString().trim();
  const promoEnd = promoEndRaw || '';

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
    promo: promo && promo > 0 ? promo : null, // null si no hay promo válida
    promoEnd, // texto libre
  };
}

/* ------------------ App principal ------------------ */
function DulceriaApp() {
  // products cargados
  const [products, setProducts] = useState([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Todos');

  // orden: 'default' | 'price-asc' | 'price-desc' | 'promo'
  const [order, setOrder] = useState('default');

  // paginación
  const perPage = 20;
  const [page, setPage] = useState(1);

  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);

  // intentamos cargar products.xlsx o products.json al iniciar
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

  // categorías dinámicas
  const categories = useMemo(() => {
    const set = new Set(['Todos', ...products.map(p => p.category ?? 'Sin categoría')]);
    return Array.from(set);
  }, [products]);

  // filtrado por búsqueda y categoría
  const filteredBase = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter(p => {
      const matchesCategory = category === 'Todos' ? true : (p.category ?? '') === category;
      const matchesQuery = (p.name + ' ' + (p.category ?? '') + ' ' + (p.short ?? '')).toLowerCase().includes(q);
      return matchesCategory && matchesQuery;
    });
  }, [products, category, query]);

  // ordenamiento
  const filteredSorted = useMemo(() => {
    const arr = [...filteredBase];
    if (order === 'price-asc') {
      arr.sort((a, b) => ( (a.promo ?? a.price) - (b.promo ?? b.price) ));
    } else if (order === 'price-desc') {
      arr.sort((a, b) => ( (b.promo ?? b.price) - (a.promo ?? a.price) ));
    } else if (order === 'promo') {
      // promos primero, ordenadas por precio de promo asc; luego el resto por precio normal asc
      arr.sort((a, b) => {
        const aHas = a.promo ? 0 : 1;
        const bHas = b.promo ? 0 : 1;
        if (aHas !== bHas) return aHas - bHas;
        if (a.promo && b.promo) return a.promo - b.promo;
        return (a.price ?? 0) - (b.price ?? 0);
      });
    }
    return arr;
  }, [filteredBase, order]);

  // paginado
  const totalPages = Math.max(1, Math.ceil(filteredSorted.length / perPage));
  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [totalPages]); // reset page if totalPages changed

  const visibleProducts = useMemo(() => {
    const start = (page - 1) * perPage;
    return filteredSorted.slice(start, start + perPage);
  }, [filteredSorted, page]);

  // carrito
  function addToCart(product) {
    setCart(prev => {
      const found = prev.find(x => x.id === product.id);
      if (found) return prev.map(x => x.id === product.id ? { ...x, qty: x.qty + 1 } : x);
      return [...prev, { ...product, qty: 1 }];
    });
  }
  function updateQty(id, qty) { setCart(prev => prev.map(p => p.id === id ? { ...p, qty: Math.max(1, Number(qty) || 1) } : p)); }
  function removeFromCart(id) { setCart(prev => prev.filter(p => p.id !== id)); }

  const subtotal = cart.reduce((s, p) => s + (p.promo ?? p.price || 0) * p.qty, 0);
  const taxes = +(subtotal * 0.12).toFixed(2);
  const total = +(subtotal + taxes).toFixed(2);

  function generateWhatsAppMessage() {
    if (cart.length === 0) return '';
    let lines = ['Pedido desde Dulcería:\n'];
    cart.forEach(p => {
      const unit = p.promo ?? p.price ?? 0;
      lines.push(`${p.qty} x ${p.name} - ${moneyFmt.format(unit * p.qty)}`);
    });
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

  // paginación handlers
  function goPrev() { setPage(p => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function goNext() { setPage(p => Math.min(totalPages, p + 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function goTo(n) { setPage(Math.max(1, Math.min(totalPages, n))); window.scrollTo({ top: 0, behavior: 'smooth' }); }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      {/* Header fijo con color de fondo */}
      <header className="sticky top-0 z-50" style={{ background: 'linear-gradient(90deg,#ff7ab6,#ffb3d5)' }}>
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex-shrink-0">
              <img src="./src/logo.png" alt="Dulcería La Fiesta" onError={(e)=>{e.target.style.display='none';}} className="h-12 sm:h-14 object-contain" />
            </div>
            <div className="truncate">
              <div className="text-lg sm:text-xl font-bold text-white truncate">Dulcería La Fiesta</div>
              <div className="text-xs text-white/90 truncate">Dulces y sorpresas</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* select ordenar (visible en mobile también) */}
            <label className="sr-only">Ordenar</label>
            <select value={order} onChange={(e)=>{ setOrder(e.target.value); setPage(1); }} className="text-sm rounded px-2 py-1">
              <option value="default">Orden: recomendado</option>
              <option value="price-asc">Precio: más bajo</option>
              <option value="price-desc">Precio: más alto</option>
              <option value="promo">Promociones</option>
            </select>

            {/* carrito (icono) */}
            <button onClick={() => setCartOpen(true)} className="relative p-2 rounded-md bg-white/80 hover:bg-white" aria-label="Abrir carrito">
              <img src="./src/carrito.png" alt="Carrito" onError={(e)=>{ e.target.style.display='none'; }} className="h-6 w-6 object-contain" />
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4" />
              </svg>
              {cart.length > 0 && <span className="absolute -right-2 -top-2 bg-pink-600 text-white text-xs rounded-full px-1.5">{cart.length}</span>}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-3 sm:px-4 py-4">
        <section className="bg-white rounded-lg p-3 sm:p-4 shadow-sm mb-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="col-span-1 md:col-span-2 flex items-center gap-2">
              <input aria-label="Buscar productos" value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} className="w-full border rounded px-3 py-2 text-sm" placeholder="Buscar por nombre o categoría..." />
            </div>

            <div className="flex gap-2 items-center justify-end">
              <select value={category} onChange={e => { setCategory(e.target.value); setPage(1); }} className="border rounded px-3 py-2 text-sm">
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>

              <button onClick={() => { setQuery(''); setCategory('Todos'); setOrder('default'); setPage(1); }} className="ml-1 px-3 py-2 border rounded text-sm">Limpiar</button>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">Productos ({filteredSorted.length})</h2>

          {visibleProducts.length === 0 ? (
            <div className="bg-white rounded-lg p-6 text-center shadow">No se encontraron productos.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {visibleProducts.map(p => (
                <article key={p.id} className="bg-white rounded shadow-sm overflow-hidden flex flex-col">
                  <ImageWithModal src={p.image || `./src/${slugify(p.name)}.jpg`} alt={p.name} className="w-[72%] max-w-[220px] h-36 mx-auto mt-3" imgClass="object-contain" />
                  <div className="p-3 flex-1 flex flex-col">
                    <h3 className="font-semibold text-sm sm:text-base truncate">{p.name}</h3>
                    <p className="text-xs sm:text-sm text-gray-500 flex-1">{p.short || p.description}</p>

                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex flex-col">
                        {p.promo ? (
                          <>
                            <div className="text-sm text-gray-400 line-through">{moneyFmt.format(p.price || 0)}</div>
                            <div className="text-lg font-bold text-pink-600">{moneyFmt.format(p.promo)}</div>
                            {p.promoEnd && <div className="text-xs text-gray-500">Precio promo (válida hasta {p.promoEnd})</div>}
                          </>
                        ) : (
                          <div className="text-lg font-bold">{moneyFmt.format(p.price || 0)}</div>
                        )}
                      </div>

                      <button onClick={() => addToCart(p)} className="px-3 py-2 bg-pink-500 text-white rounded text-sm">Agregar</button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          {/* paginación */}
          <div className="mt-6 flex items-center justify-between">
            <div className="text-sm text-gray-600">Página {page} de {totalPages}</div>
            <div className="flex items-center gap-2">
              <button onClick={goPrev} disabled={page === 1} className="px-3 py-1 border rounded text-sm disabled:opacity-50">Prev</button>
              <button onClick={goNext} disabled={page === totalPages} className="px-3 py-1 border rounded text-sm disabled:opacity-50">Next</button>
            </div>
          </div>
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
                  <div className="text-xs text-gray-500">{moneyFmt.format(p.promo ?? p.price ?? 0)}</div>
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

          <button onClick={openWhatsApp} className="w-full px-4 py-3 bg-green-600 text-white rounded mb-2 text-sm">Ordenar por WhatsApp</button>
          <button onClick={() => alert('Aquí podrías agregar checkout tradicional')} className="w-full px-4 py-2 border rounded text-sm">Checkout tradicional</button>
        </div>
      </div>

      <footer className="mt-8 sm:mt-10 py-6 text-center text-sm text-gray-500">© {new Date().getFullYear()} Dulcería La Fiesta — Hecho con cariño</footer>
    </div>
  );
}

window.DulceriaApp = DulceriaApp;
