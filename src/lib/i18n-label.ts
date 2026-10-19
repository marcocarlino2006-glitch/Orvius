/* Only the label text changes; icons beside it (a menu caret, an arrow) are React's and must survive. */
export function setLabel(el: HTMLElement, text: string) {
  if (!el.children.length) {
    if (el.textContent !== text) el.textContent = text;
    return;
  }
  const label = [...el.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim());
  if (label) {
    if (label.textContent !== text) label.textContent = text;
  } else {
    el.prepend(document.createTextNode(text));
  }
}
