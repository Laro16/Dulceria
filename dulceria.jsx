const { useState, useMemo, useEffect } = React;

/* ---------- Helpers ---------- */
function slugify(text){
  return String(text||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .replace(/ñ/g,'n').replace(/Ñ/g,'n')
    .toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}

function parsePrice(v){
  if(v==null) return 0;
  const s = String(v).trim().replace(/\s+/g,'');
  const n = parseFloat(s.replace(/[^\d.,-]/g,'').replace(',', '.'));
  return Number.isFinite(n)?n:0;
}

function handleImgError(e){ e.target.onerror=null; e.target.src='https://via.placeholder.com/200x150?text=Sin+imagen'; }

const moneyFmt = new Intl.NumberFormat('es-GT',{ style:'currency', currency:'GTQ', maximumFractionDigits:2 });

/* ---------- Badge Promo ---------- */
function BadgePromo({text}){ return (<div className="absolute left-0 top-0 -translate-x-2 -translate-y-2"><div className="bg-pink-600 text-white text-xs font-semibold px-3 py-1 rounded-r-md shadow-lg">{text||'PROMO'}</div></div>);}

/* ---------- Image Modal ---------- */
function ImageWithModal({src, alt, className='w-[68%] max-w-[200px] h-36 mx-auto', imgClass='object-contain'}){
  const [open,setOpen] = useState(false);
  useEffect(()=>{
    function onKey(e){ if(e.key==='Escape') setOpen(false); }
    if(open) window.addEventListener('keydown',onKey);
    return ()=>window.removeEventListener('keydown',onKey);
  },[open]);
  return (<>
    <button onClick={e=>{e.preventDefault();setOpen(true);}} className={`block overflow-hidden bg-gray-50 rounded ${className}`} style={{border:'none',padding:0}}>
      <img src={src} alt={alt} onError={handleImgError} className={`${imgClass} w-full h-full`} />
    </button>
    {open && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80 p-4" onClick={()=>setOpen(false)}>
        <div className="max-w-[95%] max-h-[95%] overflow-auto rounded" onClick={e=>e.stopPropagation()}>
          <div className="relative bg-black rounded">
            <button onClick={()=>setOpen(false)} className="absolute top-2 right-2 z-10 bg-black/40 text-white p-2 rounded">✕</button>
            <img src={src} alt={alt} onError={handleImgError} className="max-w-full max-h-[80vh] object-contain block mx-auto"/>
          </div>
          <div className="text-center text-sm text-gray-200 mt-3">{alt}</div>
        </div>
      </div>
    )}
  </>);
}

/* ---------- Normalize Product ---------- */
function normalizeProduct(raw,idFallback){
  const name=(raw.name||raw.Nombre||raw.nombre||'').toString().trim();
  const price=parsePrice(raw.price||raw.Precio||raw.precio||0);
  const description=(raw.description||raw.Descripcion||raw.descripcion||raw.short||'').toString();
  const category=(raw.category||raw.Categoria||raw.categoria||'Sin categoría').toString();
  const promo=parsePrice(raw.promo||raw.Promo||0);
  const promoEnd=(raw.promoEnd||raw['fecha promo']||'').toString();
  let image=raw.image||raw.Imagen||`./src/${slugify(name)}.jpg`;
  if(!/^https?:\/\//i.test(image)&&!image.startsWith('./')&&!image.startsWith('/')) image=`./src/${image}`;
  if(!/\.[a-zA-Z0-9]{2,5}$/.test(image)&&!/^https?:\/\//i.test(image)) image+= '.jpg';
  return {id:raw.id||idFallback,name,price,short:description,description,category,image,promo:promo>0?promo:null,promoEnd};
}

/* ---------- App Principal ---------- */
function DulceriaApp(){
  const [products,setProducts]=useState([]);
  const [query,setQuery]=useState('');
  const [category,setCategory]=useState('Todos');
  const [order,setOrder]=useState('default');
  const [page,setPage]=useState(1);
  const perPage=20;
  const [cart,setCart]=useState([]);
  const [cartOpen,setCartOpen]=useState(false);

  /* ---------- Load Products ---------- */
  useEffect(()=>{
    let mounted=true;
    async function tryLoadXlsx(){
      try{
        const res=await fetch('./products.xlsx',{cache:'no-store'});
        if(!res.ok) throw new Error('no xlsx');
        const ab=await res.arrayBuffer();
        const wb=XLSX.read(ab,{type:'array'});
        const sheetName=wb.SheetNames[0];
        const rows=XLSX.utils.sheet_to_json(wb.Sheets[sheetName],{defval:''});
        const mapped=rows.map((r,i)=>normalizeProduct(r,r.id||i+1));
        if(mounted) setProducts(mapped);
      }catch(err){ tryLoadJson(); }
    }
    async function tryLoadJson(){
      try{
        const res=await fetch('./products.json',{cache:'no-store'});
        if(!res.ok) throw new Error('no json');
        const data=await res.json();
        if(!Array.isArray(data)) throw new Error('not array');
        const mapped=data.map((p,i)=>normalizeProduct(p,p.id||i+1));
        if(mounted) setProducts(mapped);
      }catch(err){ if(mounted) setProducts([]); console.warn('No products loaded',err); }
    }
    tryLoadXlsx();
    return ()=>mounted=false;
  },[]);

  /* ---------- Filter / Sort ---------- */
  const categories=useMemo(()=>['Todos',...Array.from(new Set(products.map(p=>p.category)))], [products]);
  const filtered=useMemo(()=>{
    const q=query.toLowerCase();
    return products.filter(p=>(category==='Todos'||p.category===category)&&((p.name||'').toLowerCase().includes(q)||((p.short||'').toLowerCase().includes(q))));
  }, [products,query,category]);

  const sorted=useMemo(()=>{
    const arr=[...filtered];
    if(order==='price-asc') arr.sort((a,b)=>(a.promo||a.price)-(b.promo||b.price));
    else if(order==='price-desc') arr.sort((a,b)=>(b.promo||b.price)-(a.promo||a.price));
    else if(order==='promo') arr.sort((a,b)=>((b.promo?0:1)-(a.promo?0:1)));
    return arr;
  }, [filtered,order]);

  const totalPages=Math.max(1,Math.ceil(sorted.length/perPage));
  const visible=sorted.slice((page-1)*perPage,page*perPage);

  /* ---------- Cart ---------- */
  function addToCart(p){ setCart(prev=>{ const f=prev.find(x=>x.id===p.id); if(f) return prev.map(x=>x.id===p.id?{...x,qty:x.qty+1}:x); return [...prev,{...p,qty:1}];}); }
  function updateQty(id,qty){ setCart(prev=>prev.map(p=>p.id===id?{...p,qty:Math.max(1,Number(qty)||1)}:p)); }
  function removeFromCart(id){ setCart(prev=>prev.filter(p=>p.id!==id)); }

  const subtotal=cart.reduce((s,p)=>s+(p.promo||p.price)*p.qty,0);
  const taxes=+(subtotal*0.12).toFixed(2);
  const total=+(subtotal+taxes).toFixed(2);

  function openWhatsApp(){
    if(cart.length===0) return alert('Carrito vacío');
    let lines=['Pedido desde Dulcería:\n'];
    cart.forEach(p=>lines.push(`${p.qty} x ${p.name} - ${moneyFmt.format((p.promo||p.price)*p.qty)}`));
    lines.push(`Subtotal: ${moneyFmt.format(subtotal)}`);
    lines.push(`Impuestos: ${moneyFmt.format(taxes)}`);
    lines.push(`Total: ${moneyFmt.format
