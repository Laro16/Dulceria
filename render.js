// render.js
const rootEl = document.getElementById('root');
if(rootEl && window.ReactDOM && window.DulceriaApp){
  const root = ReactDOM.createRoot(rootEl);
  root.render(React.createElement(window.DulceriaApp));
}else{
  console.error('Render error: falta ReactDOM o DulceriaApp');
}
