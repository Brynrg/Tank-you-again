/**
 * Lightweight DOM overlay for guest name entry. Resolves with the chosen name.
 * Renders into the existing `#app` container; the canvas underneath stays put.
 */
export function promptGuestName(parent: HTMLElement): Promise<string> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.setAttribute("data-auth-overlay", "");
    overlay.style.cssText = [
      "position:fixed",
      "inset:0",
      "background:rgba(20,24,14,0.94)",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "z-index:1000",
      "color:#e8b923",
      "font-family:'Courier New',monospace",
    ].join(";");

    const card = document.createElement("form");
    card.style.cssText = [
      "background:linear-gradient(160deg,#23271b,#15170f)",
      "padding:24px 28px",
      "border-radius:4px",
      "min-width:320px",
      "box-shadow:0 8px 40px rgba(0,0,0,.7), inset 0 1px 0 #5c634755",
      "border:2px solid #5c6347",
    ].join(";");

    const title = document.createElement("h1");
    title.textContent = "TANK YOU AGAIN";
    title.style.cssText =
      "margin:0 0 4px;font-size:22px;font-weight:700;letter-spacing:2px;text-transform:uppercase;text-shadow:0 2px 0 #000";

    const sub = document.createElement("p");
    sub.textContent = "Fuel is health. Scan supplies, mine routes, deactivate rival tanks.";
    sub.style.cssText = "margin:0 0 16px;font-size:12px;color:#e8b92399";

    const label = document.createElement("label");
    label.textContent = "Callsign";
    label.style.cssText = "font-size:12px;display:block;margin-bottom:6px";

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "TankAce";
    input.maxLength = 16;
    input.minLength = 3;
    input.required = true;
    input.pattern = "[A-Za-z0-9_\\-]{3,16}";
    input.autocomplete = "off";
    input.value = suggestName();
    input.style.cssText = [
      "width:100%",
      "padding:8px 10px",
      "background:#0d0f08",
      "border:1px solid #5c6347",
      "border-radius:3px",
      "color:#e8b923",
      "font:14px 'Courier New',monospace",
      "box-sizing:border-box",
    ].join(";");

    const hint = document.createElement("div");
    hint.textContent = "3-16 chars: letters, digits, _ or -";
    hint.style.cssText = "font-size:11px;color:#e8b92377;margin-top:6px";

    const btn = document.createElement("button");
    btn.type = "submit";
    btn.textContent = "▶ DEPLOY";
    btn.style.cssText = [
      "margin-top:16px",
      "width:100%",
      "padding:11px",
      "background:linear-gradient(180deg,#5fa83a,#3c6b22)",
      "color:#0d0f08",
      "border:1px solid #2c3320",
      "border-radius:3px",
      "font:700 14px 'Courier New',monospace",
      "letter-spacing:2px",
      "text-transform:uppercase",
      "cursor:pointer",
    ].join(";");

    card.appendChild(title);
    card.appendChild(sub);
    card.appendChild(label);
    card.appendChild(input);
    card.appendChild(hint);
    card.appendChild(btn);
    overlay.appendChild(card);
    parent.appendChild(overlay);

    setTimeout(() => input.focus(), 0);

    card.addEventListener("submit", (ev) => {
      ev.preventDefault();
      const name = input.value.trim();
      if (!/^[A-Za-z0-9_-]{3,16}$/.test(name)) {
        input.style.borderColor = "#ef4444";
        return;
      }
      overlay.remove();
      resolve(name);
    });
  });
}

function suggestName(): string {
  const suffix = Math.floor(Math.random() * 9000) + 1000;
  return `Recruit${suffix}`;
}
