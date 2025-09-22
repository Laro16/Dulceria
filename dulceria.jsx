/* dulceria.jsx
   Versión preparada para ejecutarse con Babel standalone en el navegador.
   Usa React global (React, ReactDOM) y Tailwind desde CDN.
   - Carga productos desde products.json (si existe) o desde un .xlsx que suba el usuario.
   - Si no hay imagen para un producto intenta ./src/<slug-del-nombre>.jpg (o .png/.jpeg si prefieres renombrar).
*/

const { useState, useMemo, useEffect } = React;

/** Helpers **/
function slugify(text) {
  return String(text)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // quitar acentos
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-') // reemplaza todo lo no alfanum por guion
    .replace(/^-+|-+$/g, '');
}

function parsePrice(v) {
  if (v == null) return 0;
  const n = parseFloat(String(v).toString().replace(/[^\d.,-]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/** Componente principal **/
function DulceriaApp() {
  // Productos de ejemplo (fallback)
  const initialProducts = [
    { id: 1, category: "Sorpresas", name: "Caja Sorpresa Pequeña", price: 25.0, image: "./src/caja-sorpresa-pequena.jpg", short: "Caja con 6 dulces sorpresa." },
    { id: 2, category: "Sorpresas", name: "Sorpresa Fiesta", price: 45.0, image: "./src/sorpresa-fiesta.jpg", short: "Sorpresa temática para fiestas." },
    { id: 3, category: "Invitaciones", name: "Invitación Unicornio", price: 2.5, image: "./src/invitacion-unicornio.jpg", short: "Invitación impresa con sobre." },
    { id: 4, category: "Invitaciones", name: "Invitación Niño", price: 2.0, image: "./src/invitacion-nino.jpg", short: "Invitación colorida para niños." },
    { id: 5, category: "Decoración", name: "Guirnalda de papel", price: 12.0, image: "./src/guirnalda-de-papel.jpg", short: "Guirnalda personalizada (2m)." },
  ];

  const [products, setProducts] = useState(initialProducts);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Todos");
  const [minPrice, setMinPrice] = useState(0);
  const [maxPrice, setMaxPrice] = useState(10000);
  const [visibleCount, setVisibleCount] = useState(12);

  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);

  // Intentamos cargar products.json (opcional)
  useEffect(() => {
    fetch('./products.json')
      .then(res => {
        if (!res.ok) throw new Error('no products.json');
        return res.json();
      })
      .then(data => {
        const mapped = (Array.isArray(data) ? data : []).map((p, i) => normalizeProduct(p, i + 1));
        if (mapped.length) setProducts(mapped);
      })
      .catch(() => {
        // No existe products.json -> quedamos con initialProducts
      });
  }, []);

  // Normaliza/garantiza campos de producto y resuelve ruta de imagen por defecto
  function normalizeProduct(raw, idFallback) {
    const name = raw.name ?? raw.Nombre ?? raw.nombre ?? '';
    const price = parsePrice(raw.price ?? raw.Precio ?? raw.precio ?? raw.Price);
    const description = raw.description ?? raw.Descripcion ?? raw.descripcion ?? raw.Descripción ?? raw.short ?? '';
    const category = raw.category ?? raw.Categoria ?? raw.categoria ?? 'Sin categoría';
    const rawImage = (raw.image ?? raw.Imagen ?? raw.imagen ?? '').toString().trim();

    // Si la celda image contiene una URL absoluta la usamos tal cual.
    // Si contiene un nombre de archivo (sin path) o está vacía, construimos ./src/<slug>.ext (preferimos .jpg)
    let image = rawImage;
    if (!image) {
      image = `./src/${slugify(name)}.jpg`;
    } else if (!/^https?:\/\//i.test(image) && !image.startsWith('./') && !image.startsWith('/')) {
      // si es un nombre simple como "miimagen.jpg" o "miimagen" -> lo convertimos a ./src/...
      image = `./src/${image}`;
      // si no tiene extensión, agregar .jpg por defecto
      if (!/\.[a-zA-Z0-9]{2,5}$/.test(image)) image += '.jpg';
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

  // Parsear archivo XLSX (cuando el usuario sube)
  async function handleXlsxFile(file) {
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      const mapped = rows.map((r, i) => normalizeProduct(r, i + 1));
      setProducts(mapped);
      alert(`Se cargaron ${mapped.length} productos desde el archivo.`);
    } catch (err) {
      console.error(err);
      alert('Error leyendo el archivo .xlsx. Asegúrate que sea válido.');
    }
  }

  // Manejar input file (creamos un input oculto o usamos uno en la UI)
  function handleFileInputChange(e) {
    const file = e.target.files?.[0];
    if (file) handleXlsxFile(file);
    e.target.value = '';
  }

  // Filtrado y paginación
  const categories = useMemo(() => {
    const set = new Set(['Todos', ...products.map(p => p.category ?? 'Sin categoría')]);
    return Array.from(set);
  }, [products]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products
      .filter((p) => (category === "Todos" ? true : (p.category ?? '') === category))
      .filter((p) => (p.price ?? 0) >= Number(minPrice) && (p.price ?? 0) <= Number(maxPrice))
      .filter((p) => (p.name + ' ' + (p.category ?? '')).toLowerCase().includes(q));
  }, [products, category, query, minPrice, maxPrice]);

  const visibleProducts = filtered.slice(0, visibleCount);

  // Carrito (igual que antes)
  function addToCart(product) {
    setCart((prev) => {
      const found = prev.find((x) => x.id === product.id);
      if (found) return prev.map((x) => (x.id === product.id ? { ...x, qty: x.qty + 1 } : x));
      return [...prev, { ...product, qty: 1 }];
    });
  }

  function updateQty(id, qty) {
    setCart((prev) => prev.map((p) => (p.id === id ? { ...p, qty: Math.max(1, Number(qty) || 1) } : p)));
  }

  function removeFromCart(id) {
    setCart((prev) => prev.filter((p) => p.id !== id));
  }

  const subtotal = cart.reduce((s, p) => s + (p.price || 0) * p.qty, 0);
  const taxes = +(subtotal * 0.12).toFixed(2); // 12% ejemplo
  const total = +(subtotal + taxes).toFixed(2);

  function generateWhatsAppMessage() {
    if (cart.length === 0) return "";
    let lines = ["Pedido desde Dulcería:\n"];
    cart.forEach((p) => {
      lines.push(`${p.qty} x ${p.name} - $${(p.price * p.qty).toFixed(2)}`);
    });
    lines.push(`\nSubtotal: $${subtotal.toFixed(2)}`);
    lines.push(`Impuestos: $${taxes.toFixed(2)}`);
    lines.push(`Total: $${total.toFixed(2)}`);
    lines.push("\nDatos de entrega: (escribe aquí tu nombre, dirección y teléfono)");

    return encodeURIComponent(lines.join("\n"));
  }

  function openWhatsApp() {
    const text = generateWhatsAppMessage();
    if (!text) return alert("El carrito está vacío.");
    const url = `https://wa.me/?text=${text}`;
    window.open(url, "_blank");
  }

  // Handler de error de imagen -> pone placeholder
  function handleImgError(e) {
    e.target.onerror = null;
    e.target.src = 'https://via.placeholder.com/300x200?text=Sin+imagen';
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      <header className="bg-white shadow">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-pink-400 rounded-full flex items-center justify-center text-white font-bold">D</div>
            <div>
              <h1 className="text-xl font-bold">Dulcería La Fiesta</h1>
              <p className="text-sm text-gray-500">Dulces, sorpresas y decoración para tus eventos</p>
            </div>
          </div>

          <nav className="hidden md:flex gap-4 items-center">
            {categories.map((c) => (
              <button
                key={c}
                className={`px-3 py-2 rounded ${category === c ? "bg-pink-100 text-pink-700" : "hover:bg-gray-100"}`}
                onClick={() => setCategory(c)}
              >
                {c}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            {/* Input para subir el Excel */}
            <label className="px-3 py-2 border rounded cursor-pointer bg-white text-sm">
              Subir Excel
              <input id="xlsxInput" type="file" accept=".xlsx,.xls" onChange={handleFileInputChange} className="hidden" />
            </label>

            <a href="./products-template.xlsx" download className="px-3 py-2 border rounded bg-gray-50 text-sm">Plantilla .xlsx</a>

            <button onClick={() => setCartOpen(true)} className="relative">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4" />
              </svg>
              {cart.length > 0 && (
                <span className="absolute -right-2 -top-2 bg-pink-600 text-white text-xs rounded-full px-1.5">{cart.length}</span>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <section className="bg-white rounded-lg p-4 shadow-sm mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="col-span-1 md:col-span-2 flex items-center gap-2">
              <input
                aria-label="Buscar productos"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full border rounded px-3 py-2"
                placeholder="Buscar por nombre o categoría..."
              />
            </div>

            <div className="flex gap-2 items-center">
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="border rounded px-3 py-2">
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>

              <input type="number" min={0} value={minPrice} onChange={(e) => setMinPrice(e.target.value)} className="w-20 border rounded px-2 py-2" placeholder="Min" />
              <input type="number" min={0} value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} className="w-20 border rounded px-2 py-2" placeholder="Max" />

              <button onClick={() => { setQuery(""); setCategory("Todos"); setMinPrice(0); setMaxPrice(10000); setVisibleCount(12); }} className="ml-2 px-3 py-2 border rounded">Limpiar</button>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">Productos ({filtered.length})</h2>

          {visibleProducts.length === 0 ? (
            <div className="bg-white rounded-lg p-6 text-center shadow">No se encontraron productos.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {visibleProducts.map((p) => (
                <article key={p.id} className="bg-white rounded shadow-sm overflow-hidden flex flex-col">
                  <img
                    src={p.image || `./src/${slugify(p.name)}.jpg`}
                    alt={p.name}
                    onError={handleImgError}
                    className="w-full h-40 object-cover"
                  />
                  <div className="p-3 flex-1 flex flex-col">
                    <h3 className="font-semibold">{p.name}</h3>
                    <p className="text-sm text-gray-500 flex-1">{p.short || p.description}</p>
                    <div className="mt-3 flex items-center justify-between">
                      <div className="text-lg font-bold">${(p.price || 0).toFixed(2)}</div>
                      <button onClick={() => addToCart(p)} className="px-3 py-1 bg-pink-500 text-white rounded">Agregar al carrito</button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          {visibleCount < filtered.length && (
            <div className="mt-6 text-center">
              <button onClick={() => setVisibleCount((v) => v + 12)} className="px-4 py-2 border rounded">Cargar más</button>
            </div>
          )}
        </section>
      </main>

      <div className={`fixed top-0 right-0 h-full w-full md:w-96 bg-white shadow-xl transform ${cartOpen ? "translate-x-0" : "translate-x-full"} transition-transform`}>
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="text-lg font-bold">Tu carrito</h3>
          <div className="flex items-center gap-2">
            <button onClick={() => { setCart([]); }} className="text-sm text-red-500">Vaciar</button>
            <button onClick={() => setCartOpen(false)} className="px-2 py-1 border rounded">Cerrar</button>
          </div>
        </div>

        <div className="p-4 space-y-4 overflow-auto" style={{ maxHeight: 'calc(100% - 220px)' }}>
          {cart.length === 0 ? (
            <div className="text-center text-gray-500">No hay productos en el carrito.</div>
          ) : (
            cart.map((p) => (
              <div key={p.id} className="flex items-center gap-3">
                <img src={p.image || `./src/${slugify(p.name)}.jpg`} alt={p.name} onError={handleImgError} className="w-16 h-12 object-cover rounded" />
                <div className="flex-1">
                  <div className="font-semibold">{p.name}</div>
                  <div className="text-sm text-gray-500">${(p.price || 0).toFixed(2)}</div>
                </div>
                <div className="flex items-center gap-2">
                  <input type="number" value={p.qty} min={1} onChange={(e) => updateQty(p.id, e.target.value)} className="w-16 border rounded px-2 py-1" />
                  <button onClick={() => removeFromCart(p.id)} className="text-sm text-red-500">Eliminar</button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-4 border-t">
          <div className="flex justify-between mb-2"><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
          <div className="flex justify-between mb-2"><span>Impuestos</span><span>${taxes.toFixed(2)}</span></div>
          <div className="flex justify-between font-bold text-lg mb-4"><span>Total</span><span>${total.toFixed(2)}</span></div>

          <button onClick={openWhatsApp} className="w-full px-4 py-2 bg-green-600 text-white rounded mb-2">Ordenar por WhatsApp</button>
          <button onClick={() => alert('Aquí podrías agregar checkout tradicional')} className="w-full px-4 py-2 border rounded">Checkout tradicional</button>
        </div>
      </div>

      <footer className="mt-10 py-6 text-center text-sm text-gray-500">© {new Date().getFullYear()} Dulcería La Fiesta — Hecho con cariño</footer>
    </div>
  );
}

// Exponer en el scope global para que render.js pueda usarlo
window.DulceriaApp = DulceriaApp;
