/* dulceria.jsx - versión corregida */

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
  e.target.src = 'https://via.placeholder.com/800x600?text=Sin+imagen';
}

const moneyFmt = new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ', maximumFractionDigits: 2 });

/* ---------- Presentational Components ---------- */
function BadgePromo({ text = 'PROMO' }) {
  return (
    <div className="absolute left-0 top-0 -translate-x-2 -translate-y-2">
      <div className="bg-pink-600 text-white text-xs font-semibold px-3 py-1 rounded-r-md shadow-lg">
        {text}
      </div>
    </div>
  );
}

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
        aria-label={`Ver imagen de ${alt}`}
        className={`block overflow-hidden bg-gray-50 rounded ${className} border border-gray-100`}
        style={{ border: 'none', padding: 0 }}
      >
        <img src={src} alt={alt} loading="lazy" onError={handleImgError} className={`${imgClass} w-full h-full`} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80 p-4"
          onClick={() => setOpen(false)}
        >
          <div className="max-w-[95%] max-h-[95%] overflow-auto rounded" onClick={(e) => e.stopPropagation()}>
            <div className="relative bg-black rounded">
              <button
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
                className="absolute top-2 right-2 z-10 rounded bg-black/40 text-white p-2"
                style={{ backdropFilter: 'blur(2px)' }}
              >
                ✕
              </button>
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

  const promoRaw = (raw.promo ?? raw.Promo ?? raw.PROMO ?? raw.promo_price ?? raw['promo price'] ?? raw['promo_price'] ?? '').toString().trim();
  const promo = promoRaw ? parsePrice(promoRaw) : null;

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
  let image = rawImage || `./src/${slugify(name)}.jpg`;
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
    promo: promo && promo > 0 ? promo : null,
    promoEnd,
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
        if (!res.ok) throw new Error('No XLSX');
        const ab = await res.arrayBuffer();
        const workbook = XLSX.read(ab, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
        const mapped = rows.map((r, i) => normalizeProduct(r, i + 1));
        if (mounted) setProducts(mapped);
        return true;
      } catch (e) { return false; }
    }

    async function tryLoadJson() {
      try {
        const res = await fetch('./products.json', { cache: 'no-store' });
        if (!res.ok) throw new Error('No JSON');
        const data = await res.json();
        if (!Array.isArray(data)) return false;
        const mapped = data.map((p, i) => normalizeProduct(p, p.id ?? i + 1));
        if (mounted) setProducts(mapped);
        return true;
      } catch (e) { return false; }
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

  const filteredBase = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter(p => {
      const matchesCategory = category === 'Todos' ? true : (p.category ?? '') === category;
      const matchesQuery = (p.name + ' ' + (p.category ?? '') + ' ' + (p.short ?? '')).toLowerCase().includes(q);
      return matchesCategory && matchesQuery;
    });
  }, [products, category, query]);

  const filteredSorted = useMemo(() => {
    const arr = [...filteredBase];
    if (order === 'price-asc') arr.sort((a,b)=>((a.promo??a.price)-(b.promo??b.price)));
    else if (order==='price-desc') arr.sort((a,b)=>((b.promo??b.price)-(a.promo??a.price)));
    else if (order==='promo') arr.sort((a,b)=>{
      const aHas = a.promo ? 0 : 1;
      const bHas = b.promo ? 0 : 1;
      if(aHas!==bHas) return aHas-bHas;
      if(a.promo&&b.promo) return a.promo-b.promo;
      return (a.price??0)-(b.price??0);
    });
    return arr;
  }, [filteredBase, order]);

  const totalPages = Math.max(1, Math.ceil(filteredSorted.length / perPage));
  useEffect(()=>{ if(page>totalPages) setPage(1); }, [totalPages]);

  const visibleProducts = useMemo(()=>{
    const start = (page-1)*perPage;
    return filteredSorted.slice(start, start+perPage);
  }, [filteredSorted, page]);

  const subtotal = cart.reduce((s,p)=>s+(p.promo??p.price||0)*p.qty,0);
  const taxes = +(subtotal*0.12).toFixed(2);
  const total = +(subtotal+taxes).toFixed(2);

  function addToCart(product) {
    setCart(prev=>{
      const found = prev.find(x=>x.id===product.id);
      if(found) return prev.map(x=>x.id===product.id ? {...x, qty:x.qty+1}:x);
      return [...prev, {...product, qty:1}];
    });
  }

  function updateQty(id, qty){ setCart(prev=>prev.map(p=>p.id===id?{...p, qty:Math.max(1, Number(qty)||1)}:p)); }
  function removeFromCart(id){ setCart(prev=>prev.filter(p=>p.id!==id)); }

  function generateWhatsAppMessage() {
    if(cart.length===0) return '';
    let lines = ['Pedido desde Dulcería:\n'];
    cart.forEach(p=>{ lines.push(`${p.qty} x ${p.name} - ${moneyFmt.format((p.promo??p.price||0)*p.qty)}`); });
    lines.push(`\nSubtotal: ${moneyFmt.format(subtotal)}`);
    lines.push(`Impuestos: ${moneyFmt.format(taxes)}`);
    lines.push(`Total: ${moneyFmt.format(total)}`);
    lines.push('\nDatos de entrega: (escribe aquí tu nombre, dirección y teléfono)');
    return encodeURIComponent(lines.join('\n'));
  }

  function openWhatsApp() {
    const text = generateWhatsAppMessage();
    if(!text) return alert('El carrito está vacío.');
    window.open(`https://wa.me/?text=${text}`, '_blank');
  }

  /* ---------- UI ---------- */
  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      <header className="sticky top-0 z-50 shadow-sm">
        <div className="bg-gradient-to-r from-pink-500 via-pink-400 to-rose-200">
          <div className="max-w-6xl mx-auto px-3 sm:px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-4 min-w-0">
              <img src="./src/logo.png" alt="Dulcería La Fiesta" onError={e=>{e.target.style.display='none'}} className="h-12 sm:h-14 object-contain" />
              <div className="truncate text-white">
                <div className="text-lg sm:text-xl font-bold leading-tight">Dulcería La Fiesta</div>
                <div className="text-xs sm:text-sm opacity-90">Dulces y sorpresas</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <select aria-label="Ordenar productos" value={order} onChange={e=>{setOrder(e.target.value);setPage(1)}} className="text-sm rounded px-2 py-1 bg-white/90">
                <option value="default">Orden: recomendado</option>
                <option value="price-asc">Precio: más bajo</option>
                <option value="price-desc">Precio: más alto</option>
                <option value="promo">Promociones</option>
              </select>

              <button onClick={()=>setCartOpen(true)} className="relative p-2 rounded-md bg-white/90 hover:bg-white" aria-label="Abrir carrito">
                <img src="./src/carrito.png" alt="Carrito" onError={e=>{e.target.style.display='none'}} className="h-6 w-6 object-contain" />
                {cart.length>0 && <span className="absolute -right-2 -top-2 bg-pink-600 text-white text-xs rounded-full px-1.5">{cart.length}</span>}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-3 sm:px-4 py-4">
        {/* Search / Category */}
        <section className="bg-white rounded-lg p-3 sm:p-4 shadow-sm mb-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              aria-label="Buscar productos"
              value={query}
              onChange={e=>{setQuery(e.target.value);setPage(1)}}
              className="w-full border rounded px-3 py-2 text-sm shadow-sm md:col-span-2"
              placeholder="Buscar por nombre, categoría o descripción..."
            />

            <div className="flex gap-2 items-center justify-end">
              <select value={category} onChange={e=>{setCategory(e.target.value);setPage(1)}} className="border rounded px-3 py-2 text-sm">
                {categories.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
              <button onClick={()=>{setQuery('');setCategory('Todos');setOrder('default');setPage(1)}} className="ml-1 px-3 py-2 border rounded text-sm">Limpiar</button>
            </div>
          </div>
        </section>

        {/* Productos */}
        <section>
          {visibleProducts.length===0 ?
            <div className="bg-white rounded-lg p-8 text-center shadow">
              <div className="text-gray-400 text-lg mb-3">No se encontraron productos</div>
              <div className="text-sm text-gray-500">Revisa tu archivo <code>products.xlsx</code> o la carpeta <code>src/</code> con imágenes.</div>
            </div>
          :
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {visibleProducts.map(p=>(
                <article key={p.id} className="relative bg-white rounded-lg shadow-sm hover:shadow-lg transition transform hover:-translate-y-1">
                  {p.promo && <BadgePromo />}
                  <div className="p-4 flex flex-col h-full">
                    <ImageWithModal src={p.image} alt={p.name} className="w-[72%] max-w-[220px] h-36 mx-auto" />
                    <h3 className="font-semibold text-sm sm:text-base truncate mt-3">{p.name}</h3>
                    <p className="text-xs sm:text-sm text-gray-500 mb-3 line-clamp-2">{p.short||p.description}</p>
                    <div className="mt-auto flex items-center justify-between">
                      <div className="flex flex-col">
                        {p.promo ?
                          <>
                            <div className="text-sm text-gray-400 line-through">{moneyFmt.format(p.price||0)}</div>
                            <div className="text-lg font-extrabold text-pink-600">{moneyFmt.format(p.promo)}</div>
                            {p.promoEnd && <div className="text-xs text-gray-500 mt-1">Promo válida hasta {p.promoEnd}</div>}
                          </>
                        :
                          <div className="text-lg font-bold">{moneyFmt.format(p.price||0)}</div>
                        }
                      </div>
                      <button onClick={()=>addToCart(p)} className="ml-3 px-3 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded text-sm">Agregar</button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          }
        </section>
      </main>

      <footer className="mt-8 sm:mt-10 py-6 text-center text-sm text-gray-500">© {new Date().getFullYear()} Dulcería La Fiesta</footer>
    </div>
  );
}

/* expose */
window.DulceriaApp = DulceriaApp;
