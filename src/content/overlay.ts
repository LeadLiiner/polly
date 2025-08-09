const id = "__polly_overlay";
if (!document.getElementById(id)) {
  const el = document.createElement("div");
  el.id = id;
  Object.assign(el.style, {
    position: "fixed",
    top: "8px",
    right: "8px",
    zIndex: "2147483647",
    padding: "6px 10px",
    background: "rgba(220,0,0,0.9)",
    color: "#fff",
    font: "12px/1.4 system-ui, sans-serif",
    borderRadius: "6px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.35)"
  });
  el.textContent = "Polly: Recording…";
  document.documentElement.appendChild(el);
}
