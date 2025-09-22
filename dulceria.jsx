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
function ImageWithModal({ src, alt }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') setOpen(false); }
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        onClick={e => { e.preventDefault(); setOpen(true); }}
        className="block overflow-hidden bg-gray-50 rounded w-[72%] max-w-[220px] h-36 mx-auto"
        style={{ border: 'none', padding: 0 }}
        aria-label={`Ver imagen de ${alt}`}
      >
        <img src={src} alt={alt} onError={handleImgError} className="object-contain w-full h-full" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80 p-2 sm:p-4"
          onClick={() => setOpen(false)}
        >
          <div className="max-w-[95%] max-h-[95%] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="relative">
              <button
                onClick={() => setOpen(false)}
                className="absolute top-2 right-2 z-10 bg-black/40 text-white p-2 rounded"
              >✕</button>
              <img src={src} alt={alt} onError={handleImgError} className="w-full max-h-[90vh] object-contain mx-auto rounded" />
              <div className="text-center text-sm text-gray-200 mt-2">{alt}</div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------- Normalize Product ---------- */
function normalizeProduct(raw, idFallback) {
  const name = (raw.name ?? raw.Nombre ?? raw.nombre ?? '').toString().trim();
  const price = parsePrice(raw.price ?? raw.Precio ?? raw.precio ?? 0);
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

  function goPrev() { setPage(p => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function goNext() { setPage(p => Math.min(totalPages, p + 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }

  /* ---------- Render ---------- */
  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 relative">
      {/* Header */}
      <header className="sticky top-0 z-50 shadow-sm bg-gradient-to-r from-pink-500 via-pink-400 to-rose-200">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0 cursor-pointer" onClick={() => window.location.reload()}>
            <img src="./src/logo.png" alt="Dulcería La Fiesta" className="h-12 sm:h-14 object-contain" onError={e => e.target.style.display = 'none'} />
            <div className="truncate text-white">
              <div className="text-lg sm:text-xl font-bold leading-tight">Dulcería La Fiesta</div>
              <div className="text-xs sm:text-sm opacity-90">Dulces y sorpresas</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select value={order} onChange={e => { setOrder(e.target.value); setPage(1); }} className="text-sm rounded px-2 py-1 bg-white/90">
              <option value="default">Orden: recomendado</option>
              <option value="price-asc">Precio: más bajo</option>
              <option value="price-desc">Precio: más alto</option>
              <option value="promo">Promociones</option>
            </select>
            <button onClick={() => setCartOpen(true)} className="relative p-2 rounded-md bg-white/90 hover:bg-white" aria-label="Abrir carrito">
              <img src="./src/carrito.png" alt="Carrito" className="h-6 w-6 object-contain" onError={e => e.target.style.display = 'none'} />
              {cart.length > 0 && <span className="absolute -right-1 -top-1 bg-pink-600 text-white text-xs rounded-full px-1">{cart.length}</span>}
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-6xl mx-auto px-3 sm:px-4 py-4">
        {/* Categorías y búsqueda */}
        <div className="flex flex-col sm:flex-row gap-2 mb-4 items-center justify-between">
          <select value={category} onChange={e => { setCategory(e.target.value); setPage(1); }} className="rounded px-2 py-1 bg-white/90 w-full sm:w-auto">
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input
            type="text"
            placeholder="Buscar productos..."
            value={query}
            onChange={e => { setQuery(e.target.value); setPage(1); }}
            className="rounded px-2 py-1 w-full sm:w-64 mt-2 sm:mt-0"
          />
        </div>

        {/* Productos */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {visible.map(p => (
            <div key={p.id} className="bg-white rounded shadow-sm p-2 flex flex-col relative">
              {p.promo && <BadgePromo text="PROMO" />}
              <ImageWithModal src={p.image} alt={p.name} />
              <div className="mt-2 text-sm font-semibold">{p.name}</div>
              <div className="text-xs text-gray-600">{p.short}</div>
              <div className="mt-1 text-sm font-bold text-pink-600">{moneyFmt.format(p.promo ?? p.price)}</div>
              <button onClick={() => addToCart(p)} className="mt-2 bg-pink-500 text-white rounded px-2 py-1 text-sm hover:bg-pink-600">
                Agregar
              </button>
            </div>
          ))}
        </div>

        {/* Paginación */}
        <div className="flex justify-center gap-2 mt-4 flex-wrap">
          <button onClick={goPrev} disabled={page===1} className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50">Anterior</button>
          <span className="px-2 py-1 text-sm">Página {page} / {totalPages}</span>
          <button onClick={goNext} disabled={page===totalPages} className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50">Siguiente</button>
        </div>
      </main>

      {/* Botón WhatsApp fijo */}
      <button
        onClick={openWhatsApp}
        className="fixed bottom-4 right-4 z-50 bg-green-500 hover:bg-green-600 text-white px-4 py-3 rounded-full shadow-lg flex items-center gap-2"
      >
        <img src="https://img.icons8.com/ios-filled/24/ffffff/whatsapp.png" alt="WhatsApp" />
        Pedido
      </button>

      {/* Carrito modal */}
      {cartOpen && (
        <div
          className="fixed inset-0 z-50 bg-black bg-opacity-60 flex justify-end"
          onClick={() => setCartOpen(false)}
        >
          <div className="bg-white w-80 max-w-full h-full p-4 flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-2">
              <div className="font-bold text-lg">Carrito</div>
              <button onClick={() => setCartOpen(false)} className="text-gray-600 hover:text-gray-900">✕</button>
            </div>
            <div className="flex-1 overflow-auto">
              {cart.length === 0 && <div className="text-gray-500 text-sm">Carrito vacío</div>}
              {cart.map(p => (
                <div key={p.id} className="flex items-center justify-between mb-2 border-b pb-1">
                  <div>
                    <div className="text-sm font-semibold">{p.name}</div>
                    <div className="text-xs text-gray-600">{moneyFmt.format(p.promo ?? p.price)}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <input type="number" min="1" value={p.qty} onChange={e => updateQty(p.id, e.target.value)} className="w-12 text-sm border rounded px-1 py-0.5" />
                    <button onClick={() => removeFromCart(p.id)} className="text-red-500 hover:text-red-700 text-sm">✕</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 border-t pt-2">
              <div className="flex justify-between text-sm"><span>Subtotal</span><span>{moneyFmt.format(subtotal)}</span></div>
              <div className="flex justify-between text-sm"><span>Impuestos</span><span>{moneyFmt.format(taxes)}</span></div>
              <div className="flex justify-between font-bold text-sm"><span>Total</span><span>{moneyFmt.format(total)}</span></div>
            </div>
            <button onClick={openWhatsApp} className="mt-3 w-full bg-green-500 hover:bg-green-600 text-white py-2 rounded">Pedir por WhatsApp</button>
          </div>
        </div>
      )}
    </div>
  );
}
