/* dulceria.jsx - versión compatible Babel standalone */
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
      <div className="bg-pink-600 text-white text-xs font-semibold px-3 py-1 rounded-r-md shadow-lg">{text || 'PROMO'}</div>
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
      <button onClick={e => { e.preventDefault(); setOpen(true); }} className={`block overflow-hidden bg-gray-50 rounded ${className}`} style={{ border: 'none', padding: 0 }}>
        <img src={src} alt={alt} onError={handleImgError} className={`${imgClass} w-full h-full`} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80 p-4" onClick={() => setOpen(false)}>
          <div className="max-w-[95%] max-h-[95%] overflow-auto rounded" onClick={e => e.stopPropagation()}>
            <div className="relative bg-black rounded">
              <button onClick={() => setOpen(false)} className="absolute top-2 right-2 z-10 bg-black/40 text-white p-2 rounded">✕</button>
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
  const name = (raw.name || raw.Nombre || raw.nombre || '').toString().trim();
  const price = parsePrice(raw.price || raw.Precio || raw.precio || 0);
  const description = (raw.description || raw.Descripcion || raw.descripcion || raw.short || '').toString();
  const category = (raw.category || raw.Categoria || raw.categoria || 'Sin categoría').toString();
  const promo = parsePrice(raw.promo || raw.Promo || 0);
  const promoEnd = (raw.promoEnd || raw['fecha promo'] || '').toString();
  let image = raw.image || raw.Imagen || `./src/${slugify(name)}.jpg`;
  if (!/^https?:\/\//i.test(image) && !image.startsWith('./') && !image.startsWith('/')) image = `./src/${image}`;
  if (!/\.[a-zA-Z0-9]{2,5}$/.test(image) && !/^https?:\/\//i.test(image)) image += '.jpg';

  return { id: raw.id || idFallback, name, price, short: description, description, category, image, promo: promo > 0 ? promo : null, promoEnd };
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

    async function tryLoadJson() {
      try {
        const res = await fetch('./products.json', { cache: 'no-store' });
        if (!res.ok) throw new Error('No JSON');
        const data = await res.json();
        const mapped = data.map((p,i)=>normalizeProduct(p,p.id||i+1));
        if(mounted) setProducts(mapped);
      } catch(e){
        console.warn('No se cargaron productos', e);
        if(mounted) setProducts([]);
      }
    }

    tryLoadJson();

    return () => mounted = false;
  }, []);

  /* ---------- Filtered / Sorted ---------- */
  const categories = useMemo(() => ['Todos', ...Array.from(new Set(products.map(p=>p.category)))], [products]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return products.filter(p => (category==='Todos' || p.category===category) &&
      (p.name.toLowerCase().includes(q) || (p.short||'').toLowerCase().includes(q))
    );
  }, [products, query, category]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    if(order==='price-asc') arr.sort((a,b)=>(a.promo||a.price)-(b.promo||b.price));
    else if(order==='price-desc') arr.sort((a,b)=>(b.promo||b.price)-(a.promo||a.price));
    else if(order==='promo') arr.sort((a,b)=>((b.promo?0:1)-(a.promo?0:1)));
    return arr;
  }, [filtered, order]);

  const totalPages = Math.max(1, Math.ceil(sorted.length/perPage));
  const visible = sorted.slice((page-1)*perPage, page*perPage);

  /* ---------- Cart Functions ---------- */
  function addToCart(p){
    setCart(prev=>{
      const found = prev.find(x=>x.id===p.id);
      if(found) return prev.map(x=>x.id===p.id?{...x, qty:x.qty+1}:x);
      return [...prev,{...p, qty:1}];
    });
  }

  function updateQty(id, qty){ setCart(prev=>prev.map(p=>p.id===id?{...p, qty:Math.max(1, Number(qty)||1)}:p)); }
  function removeFromCart(id){ setCart(prev=>prev.filter(p=>p.id!==id)); }

  const subtotal = cart.reduce((s,p)=>s+(p.promo||p.price)*p.qty,0);
  const taxes = +(subtotal*0.12).toFixed(2);
  const total = +(subtotal+taxes).toFixed(2);

  /* ---------- WhatsApp ---------- */
  function openWhatsApp() {
    if(cart.length===0) return alert('Carrito vacío');
    let lines = ['Pedido desde Dulcería:\n'];
    cart.forEach(p=>lines.push(`${p.qty} x ${p.name} - ${moneyFmt.format((p.promo||p.price)*p.qty)}`));
    lines.push(`Subtotal: ${moneyFmt.format(subtotal)}`);
    lines.push(`Impuestos: ${moneyFmt.format(taxes)}`);
    lines.push(`Total: ${moneyFmt.format(total)}`);
    lines.push('\nDatos de entrega...');
    window.open('https://wa.me/?text='+encodeURIComponent(lines.join('\n')),'_blank');
  }

  /* ---------- Render ---------- */
  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      <header className="bg-pink-500 text-white p-4 text-center font-bold text-lg">Dulcería La Fiesta</header>
      <main className="max-w-6xl mx-auto p-4">
        <input className="border px-2 py-1 w-full mb-4" placeholder="Buscar..." value={query} onChange={e=>{setQuery(e.target.value);setPage(1)}} />
        <select value={category} onChange={e=>{setCategory(e.target.value);setPage(1)}} className="border px-2 py-1 mb-4">
          {categories.map(c=><option key={c}>{c}</option>)}
        </select>
        <select value={order} onChange={e=>setOrder(e.target.value)} className="border px-2 py-1 mb-4 ml-2">
          <option value="default">Recomendado</option>
          <option value="price-asc">Precio asc</option>
          <option value="price-desc">Precio desc</option>
          <option value="promo">Promoción</option>
        </select>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {visible.map(p=>(
            <div key={p.id} className="bg-white rounded p-2 shadow relative">
              {p.promo && <BadgePromo />}
              <ImageWithModal src={p.image} alt={p.name} />
              <div className="font-bold truncate mt-2">{p.name}</div>
              <div className="text-sm text-gray-500 line-through">{p.promo?moneyFmt.format(p.price):''}</div>
              <div className="text-lg font-bold text-pink-600">{p.promo?moneyFmt.format(p.promo):moneyFmt.format(p.price)}</div>
              <button className="mt-2 w-full bg-pink-600 text-white py-1 rounded" onClick={()=>addToCart(p)}>Agregar</button>
            </div>
          ))}
        </div>

        <div className="mt-4 flex justify-between items-center">
          <button disabled={page<=1} onClick={()=>setPage(page-1)} className="px-3 py-1 border rounded">Anterior</button>
          <span>{page} / {totalPages}</span>
          <button disabled={page>=totalPages} onClick={()=>setPage(page+1)} className="px-3 py-1 border rounded">Siguiente</button>
        </div>
      </main>

      <div className={`fixed top-0 right-0 h-full w-80 bg-white shadow-xl transform ${cartOpen?'translate-x-0':'translate-x-full'} transition-transform`}>
        <div className="p-4 border-b flex justify-between">
          <h3 className="font-bold">Carrito</h3>
          <button onClick={()=>setCartOpen(false)}>Cerrar</button>
        </div>
        <div className="p-4 space-y-2 overflow-auto" style={{maxHeight:'calc(100%-160px)'}}>
          {cart.length===0?'No hay productos':cart.map(p=>(
            <div key={p.id} className="flex items-center justify-between">
              <div>{p.name} x {p.qty}</div>
              <button onClick={()=>removeFromCart(p.id)} className="text-red-500">X</button>
            </div>
          ))}
        </div>
        <div className="p-4 border-t">
          <div className="flex justify-between"><span>Subtotal</span><span>{moneyFmt.format(subtotal)}</span></div>
          <div className="flex justify-between"><span>Impuestos</span><span>{moneyFmt.format(taxes)}</span></div>
          <div className="flex justify-between font-bold"><span>Total</span><span>{moneyFmt.format(total)}</span></div>
          <button onClick={openWhatsApp} className="w-full mt-2 bg-green-600 text-white py-1 rounded">WhatsApp</button>
        </div>
      </div>
    </div>
  );
}

window.DulceriaApp = DulceriaApp;
