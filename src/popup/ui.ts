export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: any = {}, ...children: (Node|string)[]) {
  const e = document.createElement(tag);
  Object.assign(e, attrs);
  for (const c of children) e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return e;
}
