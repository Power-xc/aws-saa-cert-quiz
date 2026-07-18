/** Get an element by id, asserting its presence and type. */
export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing required element: #${id}`);
  return el as T;
}

export function show(el: HTMLElement): void {
  el.classList.remove('hidden');
}

export function hide(el: HTMLElement): void {
  el.classList.add('hidden');
}

export function toggle(el: HTMLElement, visible: boolean): void {
  el.classList.toggle('hidden', !visible);
}
