const { useState, useMemo, useEffect } = React;

/* ---------- Helpers ---------- */
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
  e.target.src = 'https://via.placeholder.com/200x150?text=Sin+imagen';
}

const moneyFmt = new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ', maximumFractionDigits: 2 });

/* ---------- Badge Promo ---------- */
function BadgePromo({ text }) {
  return (
    <div className="absolute left-0 top-0 -translate-x-2 -translate-y-2">
      <div className="bg-pink-600 text-white text-xs font-semibold px-3 py-1 rounded-r-md shadow-lg">
        {text || 'PROMO'}
      </div>
    </div>
  );
}

/* ---------- Image Modal ---------- */
function ImageWithModal({ src, alt, className = 'w-[68%] max-w-[200px] h-36 mx-auto', imgClass = 'object-contain' }) {
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
        className={`block overflow-hidden bg-gray-50 rounded ${className}`}
        style={{ border: 'none', padding: 0 }}
        aria-label={`Ver imagen de ${alt}`}
      >
        <img src={src} alt={alt} onError={handleImgError} className={`${imgClass} w-full h-full`} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80 p-4"
          onClick={() => setOpen(false)}
        >
          <div className="max-w-[95%] max-h-[95%] overflow-auto rounded" onClick={(e) => e.stopPropagation()}>
            <div className="relative bg-black rounded">
              <button
                onClick={() => setOpen(false)}
                className="absolute top-2 right-2 z-10 bg-black/40 text-white p-2 rounded"
              >✕</button>
              <img src={src} alt={alt} onError={handleImgError} className="max-w-full max-h-[80vh] object-contain block mx-auto" />
            </div>
            <div className="text-center text-sm text-gray-200 mt-3">{alt}</div>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------- Normalize Product ---------- */
function normalizeProduct(raw, idFallback) {
  const name = (raw.name ?? raw.Nombre ?? raw.nombre ?? '').toString().trim();
  const price = parsePrice(raw.price ?? raw.Precio ?? raw.precio ?? raw.Price);
  const description = (raw.description ?? raw.Descripcion ?? raw.descripcion ?? raw.short ?? '').toString();
  const category = (raw.category ?? raw.Categoria ?? raw.categoria ?? 'Sin categoría').toString();
  const promo = parsePrice(raw.promo ?? raw.Promo ?? 0);
  const promoEnd = (raw.promoEnd ?? raw['fecha promo'] ?? '').toString();

  let image = raw.image ?? raw.Imagen ?? `./src/${slugify(name)}.jpg`;
  if (!/^https?:\/\//i.test(image) && !image.startsWith('./') && !image.startsWith('/')) image = `./src/${image}`;
  if (!/\.[a-zA-Z0-9]{2,5}$/.test(image) && !/^https?:\/\//i.test(image)) image += '.jpg';

  return {
    id: raw.id ?? idFallback,
    name,
    price,
    short: description,
    description,
    category,
    image,
    promo: promo > 0 ? promo : null,
    promoEnd
  };
}

/* ---------- App Principal ---------- */
function DulceriaApp() {
  const [products, setProducts] = useState([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Todos');
  const [order, setOrder] = useState('default');
  const [page, setPage] = useState(1);
  const perPage = 20;

  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);

  /* ---------- Load Products ---------- */
  useEffect(() => {
    let mounted = true;

    async function tryLoadXlsx() {
      try {
        const res = await fetch('./products.xlsx', { cache: 'no-store' });
        if (!res.ok) throw new Error('no xlsx');
        const ab = await res.arrayBuffer();
        const wb = XLSX.read(ab, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        const mapped = rows.map((r, i) => normalizeProduct(r, r.id ?? i + 1));
        if (mounted) setProducts(mapped);
      } catch { tryLoadJson(); }
    }

    async function tryLoadJson() {
      try {
        const res = await fetch('./products.json', { cache: 'no-store' });
        if (!res.ok) throw new Error('no json');
        const data = await res.json();
        if (!Array.isArray(data)) throw new Error('not array');
        const mapped = data.map((p, i) => normalizeProduct(p, p.id ?? i + 1));
        if (mounted) setProducts(mapped);
      } catch (err) { if (mounted) setProducts([]); console.warn('No products loaded', err); }
    }

    tryLoadXlsx();
    return () => mounted = false;
  }, []);

  /* ---------- Filter / Sort ---------- */
  const categories = useMemo(() => ['Todos', ...Array.from(new Set(products.map(p => p.category)))], [products]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return products.filter(p =>
      (category === 'Todos' || p.category === category) &&
      ((p.name || '').toLowerCase().includes(q) || ((p.short || '').toLowerCase().includes(q)))
    );
  }, [products, query, category]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (order === 'price-asc') arr.sort((a, b) => (a.promo ?? a.price) - (b.promo ?? b.price));
    else if (order === 'price-desc') arr.sort((a, b) => (b.promo ?? b.price) - (a.promo ?? a.price));
    else if (order === 'promo') arr.sort((a, b) => ((b.promo ? 0 : 1) - (a.promo ? 0 : 1)));
    return arr;
  }, [filtered, order]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / perPage));
  const visible = sorted.slice((page - 1) * perPage, page * perPage);

  /* ---------- Cart ---------- */
  function addToCart(p) { setCart(prev => { const f = prev.find(x => x.id === p.id); if (f) return prev.map(x => x.id === p.id ? { ...x, qty: x.qty + 1 } : x); return [...prev, { ...p, qty: 1 }]; }); }
  function updateQty(id, qty) { setCart(prev => prev.map(p => p.id === id ? { ...p, qty: Math.max(1, Number(qty) || 1) } : p)); }
  function removeFromCart(id) { setCart(prev => prev.filter(p => p.id !== id)); }

  const subtotal = cart.reduce((s, p) => s + (p.promo ?? p.price) * p.qty, 0);
  const taxes = +(subtotal * 0.12).toFixed(2);
  const total = +(subtotal + taxes).toFixed(2);

  function generateWhatsAppMessage() {
    if (cart.length === 0) return '';
    const lines = ['Pedido desde Dulcería:\n'];
    cart.forEach(p => lines.push(`${p.qty} x ${p.name} - ${moneyFmt.format((p.promo ?? p.price) * p.qty)}`));
    lines.push(`\nSubtotal: ${moneyFmt.format(subtotal)}`);
    lines.push(`Impuestos: ${moneyFmt.format(taxes)}`);
    lines.push(`Total: ${moneyFmt.format(total)}`);
    lines.push('\nDatos de entrega: (escribe aquí tu nombre, dirección y teléfono)');
    return encodeURIComponent(lines.join('\n'));
  }

  function openWhatsApp() {
    const text = generateWhatsAppMessage();
    if (!text) return alert('El carrito está vacío');
    window.open(`https://wa.me/?text=${text}`, '_blank');
  }

  /* ---------- Pagination ---------- */
  function goPrev() { setPage(p => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function goNext() { setPage(p => Math.min(totalPages, p + 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }

  /* ---------- UI ---------- */
  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      {/* Header */}
      <header className="sticky top-0 z-50 shadow-sm">
        <div className="bg-gradient-to-r from-pink-500 via-pink-400 to-rose-200">
          <div className="max-w-6xl mx-auto px-3 sm:px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-4 min-w-0">
              <div className="flex-shrink-0">
                <img src="./src/logo.png" alt="Dulcería La Fiesta" onError={e => { e.target.style.display = 'none'; }} className="h-12 sm:h-14 object-contain" />
              </div>
              <div className="truncate text-white">
                <div className="text-lg sm:text-xl font-bold leading-tight">Dulcería La Fiesta</div>
                <div className="text-xs sm:text-sm opacity-90">Dulces y sorpresas</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <select aria-label="Ordenar productos" value={order} onChange={e => { setOrder(e.target.value); setPage(1); }} className="text-sm rounded px-2 py-1 bg-white/90">
                <option value="default">Orden: recomendado</option>
                <option value="price-asc">Precio: más bajo</option>
                <option value="price-desc">Precio: más alto</option>
                <option value="promo">Promociones</option>
              </select>

              <button onClick={() => setCartOpen(true)} className="relative p-2 rounded-md bg-white/90 hover:bg-white" aria-label="Abrir carrito">
                <img src="./src/carrito.png" alt="Carrito" onError={e => { e.target.style.display = 'none'; }} className="h-6 w-6 object-contain" />
                {cart.length > 0 && <span className="absolute -right-2 -top-2 bg-pink-600 text-white text-xs rounded-full px-1.5">{cart.length}</span>}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-6xl mx-auto px-3 sm:px-4 py-4">
        {/* Search / Filter */}
        <section className="bg-white rounded-lg p-3 sm:p-4 shadow-sm mb-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="col-span-1 md:col-span-2">
              <input
                aria-label="Buscar productos"
                value={query}
                onChange={e => { setQuery(e.target.value); setPage(1); }}
                className="w-full border rounded px-3 py-2 text-sm shadow-sm"
                placeholder="Buscar por nombre, categoría o descripción..."
              />
            </div>
            <div className="flex gap-2 items-center justify-end">
              <select value={category} onChange={e => { setCategory(e.target.value); setPage(1); }} className="border rounded px-3 py-2 text-sm">
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <button onClick={() => { setQuery(''); setCategory('Todos'); setOrder('default'); setPage(1); }} className="ml-1 px-3 py-2 border rounded text-sm">Limpiar</button>
            </div>
          </div>
        </section>

        {/* Products */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Productos</h2>
            <div className="text-sm text-gray-600">Mostrando {Math.min(sorted.length, (page - 1) * perPage + 1)}–{Math.min(sorted.length, page * perPage)} de {sorted.length}</div>
          </div>

          {visible.length === 0 ? (
            <div className="bg-white rounded-lg p-8 text-center shadow">
              <div className="text-gray-400 text-lg mb-3">No se encontraron productos</div>
              <div className="text-sm text-gray-500">Revisa tu archivo <code>products.xlsx</code> o la carpeta <code>src/</code> con imágenes.</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {visible.map(p => (
                <article key={p.id} className="relative bg-white rounded-lg shadow-sm hover:shadow-lg transition transform hover:-translate-y-1 focus-within:shadow-lg">
                  {p.promo && <BadgePromo />}
                  <div className="p-4 flex flex-col h-full">
                    <div className="mb-3">
                      <ImageWithModal src={p.image} alt={p.name} className="w-[72%] max-w-[220px] h-36 mx-auto" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-sm sm:text-base truncate mb-1">{p.name}</h3>
                      <p className="text-xs sm:text-sm text-gray-500 mb-3 line-clamp-2">{p.short || p.description}</p>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex flex-col">
                        {p.promo ? (
                          <>
                            <div className="text-sm text-gray-400 line-through">{moneyFmt.format(p.price)}</div>
                            <div className="text-lg font-extrabold text-pink-600">{moneyFmt.format(p.promo)}</div>
                            {p.promoEnd && <div className="text-xs text-gray-500 mt-1">Promo válida hasta {p.promoEnd}</div>}
                          </>
                        ) : (
                          <div className="text-lg font-bold">{moneyFmt.format(p.price)}</div>
                        )}
                      </div>
                      <button onClick={() => addToCart(p)} className="ml-3 inline-flex items-center px-3 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded shadow-sm text-sm">Agregar</button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          {/* Pagination */}
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-sm text-gray-600">Página {page} / {totalPages}</div>
            <div className="flex items-center gap-2">
              <button onClick={goPrev} disabled={page===1} className="px-3 py-2 border rounded disabled:opacity-50">Anterior</button>
              <div className="hidden sm:flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .slice(Math.max(0, page - 3), Math.min(totalPages, page + 2))
                  .map(n => (
                    <button key={n} onClick={() => setPage(n)} className={`px-3 py-2 rounded ${n===page ? 'bg-pink-600 text-white' : 'border bg-white'}`}>{n}</button>
                  ))}
              </div>
              <button onClick={goNext} disabled={page===totalPages} className="px-3 py-2 border rounded disabled:opacity-50">Siguiente</button>
            </div>
          </div>
        </section>
      </main>

      {/* Carrito lateral */}
      <div className={`fixed top-0 right-0 h-full w-full md:w-96 bg-white shadow-xl transform ${cartOpen ? 'translate-x-0' : 'translate-x-full'} transition-transform`} style={{ zIndex: 1000 }}>
        <div className="p-4 flex justify-between items-center border-b">
          <h2 className="text-lg font-semibold">Carrito ({cart.length})</h2>
          <button onClick={() => setCartOpen(false)} className="text-gray-500 hover:text-gray-700">✕</button>
        </div>
        <div className="p-4 overflow-y-auto h-[calc(100%-160px)]">
          {cart.length === 0 ? (
            <div className="text-gray-400 text-center mt-10">Carrito vacío</div>
          ) : (
            <ul className="space-y-3">
              {cart.map(p => (
                <li key={p.id} className="flex items-center justify-between border rounded p-2">
                  <div className="flex items-center gap-2">
                    <img src={p.image} alt={p.name} onError={handleImgError} className="w-12 h-12 object-contain" />
                    <div>
                      <div className="font-semibold text-sm">{p.name}</div>
                      <div className="text-xs text-gray-500">{moneyFmt.format(p.promo ?? p.price)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <input type="number" min="1" value={p.qty} onChange={e => updateQty(p.id, e.target.value)} className="w-12 text-center border rounded text-sm" />
                    <button onClick={() => removeFromCart(p.id)} className="text-red-500 hover:text-red-700 text-sm">✕</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        {cart.length > 0 && (
          <div className="p-4 border-t">
            <div className="mb-3 text-sm">
              <div>Subtotal: {moneyFmt.format(subtotal)}</div>
              <div>Impuestos: {moneyFmt.format(taxes)}</div>
              <div className="font-semibold">Total: {moneyFmt.format(total)}</div>
            </div>
            <button onClick={openWhatsApp} className="w-full bg-green-500 hover:bg-green-600 text-white font-semibold py-2 rounded">Enviar pedido por WhatsApp</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Expose ---------- */
window.DulceriaApp = DulceriaApp;
