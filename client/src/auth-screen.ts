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
      "background:rgba(146,196,124,0.96)",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "z-index:1000",
      "color:#2e4132",
      "font-family:'Trebuchet MS','Lucida Grande',Tahoma,Verdana,sans-serif",
      // Keep the card clear of notches / home indicator on phones.
      "padding:max(16px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left))",
      "box-sizing:border-box",
    ].join(";");

    // Cartoon Front chrome: a cream card with a bold ink border and a chunky
    // offset shadow — the same flat, thick-rim language as the in-game HUD.
    const card = document.createElement("form");
    card.style.cssText = [
      "background:#fdf6e0",
      "padding:24px 28px",
      "border-radius:12px",
      // Responsive: fill small screens, cap on large ones.
      "width:min(360px,100%)",
      "box-sizing:border-box",
      "box-shadow:0 6px 0 rgba(46,65,50,0.35), 0 10px 30px rgba(46,65,50,0.25)",
      "border:3px solid #2e4132",
    ].join(";");

    const title = document.createElement("h1");
    title.textContent = "TANK YOU AGAIN";
    title.style.cssText =
      "margin:0 0 4px;font-size:22px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#2c6e3a";

    const sub = document.createElement("p");
    sub.textContent = "Fuel is health. Scan supplies, mine routes, deactivate rival tanks.";
    sub.style.cssText = "margin:0 0 16px;font-size:12px;color:#55704f";

    const label = document.createElement("label");
    label.textContent = "Callsign";
    label.style.cssText =
      "font-size:12px;font-weight:700;display:block;margin-bottom:6px;color:#2e4132";

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
      "background:#ffffff",
      "border:2px solid #2e4132",
      "border-radius:8px",
      "color:#2e4132",
      "font:16px 'Trebuchet MS','Lucida Grande',Tahoma,Verdana,sans-serif",
      "box-sizing:border-box",
    ].join(";");

    const hint = document.createElement("div");
    hint.textContent = "3-16 chars: letters, digits, _ or -";
    hint.style.cssText = "font-size:11px;color:#6d8266;margin-top:6px";

    const btn = document.createElement("button");
    btn.type = "submit";
    btn.textContent = "▶ DEPLOY";
    btn.style.cssText = [
      "margin-top:16px",
      "width:100%",
      // ≥44px tall touch target.
      "padding:14px",
      "background:#f5a01e",
      "color:#3a2a10",
      "border:2px solid #2e4132",
      "border-radius:8px",
      "box-shadow:0 4px 0 rgba(46,65,50,0.35)",
      "font:700 16px 'Trebuchet MS','Lucida Grande',Tahoma,Verdana,sans-serif",
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
        input.style.borderColor = "#ef5a35";
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
