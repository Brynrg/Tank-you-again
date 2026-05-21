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
      "background:rgba(11,11,20,0.92)",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "z-index:1000",
      "color:#facc15",
      "font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif",
    ].join(";");

    const card = document.createElement("form");
    card.style.cssText = [
      "background:#13131f",
      "padding:24px 28px",
      "border-radius:8px",
      "min-width:300px",
      "box-shadow:0 8px 40px rgba(0,0,0,.6)",
      "border:1px solid #facc1533",
    ].join(";");

    const title = document.createElement("h1");
    title.textContent = "Tank You Again";
    title.style.cssText = "margin:0 0 4px;font-size:20px;font-weight:700";

    const sub = document.createElement("p");
    sub.textContent = "Fuel is health. Scan supplies, mine routes, deactivate rival tanks.";
    sub.style.cssText = "margin:0 0 16px;font-size:13px;color:#facc1599";

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
      "background:#0b0b14",
      "border:1px solid #facc1555",
      "border-radius:4px",
      "color:#facc15",
      "font:14px system-ui",
      "box-sizing:border-box",
    ].join(";");

    const hint = document.createElement("div");
    hint.textContent = "3-16 chars: letters, digits, _ or -";
    hint.style.cssText = "font-size:11px;color:#facc1577;margin-top:6px";

    const btn = document.createElement("button");
    btn.type = "submit";
    btn.textContent = "Deploy →";
    btn.style.cssText = [
      "margin-top:14px",
      "width:100%",
      "padding:10px",
      "background:linear-gradient(135deg,#facc15,#f97316)",
      "color:#0b0b14",
      "border:0",
      "border-radius:4px",
      "font:600 14px system-ui",
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
