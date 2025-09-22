// render.js
// Monta el componente en #root usando React 18
const rootEl = document.getElementById('root');
if (rootEl) {
  const root = ReactDOM.createRoot(rootEl);
  root.render(React.createElement(window.DulceriaApp));
}
