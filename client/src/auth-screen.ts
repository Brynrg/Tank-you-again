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
      "background:rgba(3,7,6,0.94)",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "z-index:1000",
      "color:#9fffce",
      "font-family:'Courier New',monospace",
      // Keep the card clear of notches / home indicator on phones.
      "padding:max(16px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left))",
      "box-sizing:border-box",
    ].join(";");

    // Vector Front chrome: a void-dark card with a thin phosphor-glow border —
    // the same stroke+glow language as the in-game HUD, no solid steel panel.
    const card = document.createElement("form");
    card.style.cssText = [
      "background:radial-gradient(120% 140% at 50% 0%,#0a1512,#050a08)",
      "padding:24px 28px",
      "border-radius:2px",
      // Responsive: fill small screens, cap on large ones.
      "width:min(360px,100%)",
      "box-sizing:border-box",
      "box-shadow:0 0 0 1px rgba(57,255,138,0.35), 0 0 28px rgba(57,255,138,0.12), 0 8px 40px rgba(0,0,0,.7)",
      "border:1px solid rgba(57,255,138,0.5)",
    ].join(";");

    const title = document.createElement("h1");
    title.textContent = "TANK YOU AGAIN";
    title.style.cssText =
      "margin:0 0 4px;font-size:22px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#39ff8a;text-shadow:0 0 12px rgba(57,255,138,0.55)";

    const sub = document.createElement("p");
    sub.textContent = "Fuel is health. Scan supplies, mine routes, deactivate rival tanks.";
    sub.style.cssText = "margin:0 0 16px;font-size:12px;color:#9fffce99";

    const label = document.createElement("label");
    label.textContent = "Callsign";
    label.style.cssText = "font-size:12px;display:block;margin-bottom:6px;color:#9fffcecc";

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "TankAce";
    input.maxLength = 16;
    input.minLength = 3;
    input.required = true;
    input.pattern = "[A-Za-z0-9_\\-]{3,16}";
    input.autocomplete = "off";
    input.autocapitalize = "off";
    input.spellcheck = false;
    input.value = suggestName();
    input.style.cssText = [
      "width:100%",
      // ≥44px tall target; 16px font stops iOS Safari from auto-zooming on focus.
      "padding:11px 12px",
      "background:#040807",
      "border:1px solid rgba(57,255,138,0.4)",
      "border-radius:2px",
      "color:#9fffce",
      "font:16px 'Courier New',monospace",
      "box-sizing:border-box",
    ].join(";");

    const hint = document.createElement("div");
    hint.textContent = "3-16 chars: letters, digits, _ or -";
    hint.style.cssText = "font-size:11px;color:#9fffce77;margin-top:6px";

    const btn = document.createElement("button");
    btn.type = "submit";
    btn.textContent = "▶ DEPLOY";
    btn.style.cssText = [
      "margin-top:16px",
      "width:100%",
      // ≥44px tall touch target.
      "padding:14px",
      "background:#08140f",
      "color:#39ff8a",
      "border:1px solid rgba(57,255,138,0.8)",
      "border-radius:2px",
      "box-shadow:0 0 16px rgba(57,255,138,0.25)",
      "font:700 16px 'Courier New',monospace",
      "letter-spacing:2px",
      "text-transform:uppercase",
      "cursor:pointer",
      "touch-action:manipulation",
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
