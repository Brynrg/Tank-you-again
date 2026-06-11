export type GameMode = "skirmish" | "survival";

export interface LobbyChoice {
  name: string;
  mode: GameMode;
}

/**
 * Lightweight DOM overlay for guest name entry + mode select. Resolves with the
 * chosen callsign and game mode. Renders into the existing `#app` container;
 * the canvas underneath stays put.
 */
export function promptGuestName(parent: HTMLElement): Promise<LobbyChoice> {
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
      // Keep the card clear of notches / home indicator on phones.
      "padding:max(16px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left))",
      "box-sizing:border-box",
    ].join(";");

    const card = document.createElement("form");
    card.style.cssText = [
      "background:linear-gradient(160deg,#23271b,#15170f)",
      "padding:24px 28px",
      "border-radius:4px",
      // Responsive: fill small screens, cap on large ones.
      "width:min(360px,100%)",
      "box-sizing:border-box",
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
    input.autocapitalize = "off";
    input.spellcheck = false;
    input.value = suggestName();
    input.style.cssText = [
      "width:100%",
      // ≥44px tall target; 16px font stops iOS Safari from auto-zooming on focus.
      "padding:11px 12px",
      "background:#0d0f08",
      "border:1px solid #5c6347",
      "border-radius:3px",
      "color:#e8b923",
      "font:16px 'Courier New',monospace",
      "box-sizing:border-box",
    ].join(";");

    const hint = document.createElement("div");
    hint.textContent = "3-16 chars: letters, digits, _ or -";
    hint.style.cssText = "font-size:11px;color:#e8b92377;margin-top:6px";

    // ── Mode select: skirmish (classic FFA) vs survival (endless waves) ──
    let mode: GameMode = "skirmish";
    const modeLabel = document.createElement("div");
    modeLabel.textContent = "Mission";
    modeLabel.style.cssText = "font-size:12px;margin:14px 0 6px";

    const modeRow = document.createElement("div");
    modeRow.style.cssText = "display:flex;gap:8px";
    modeRow.setAttribute("role", "radiogroup");

    const modeBtnCss = (selected: boolean): string =>
      [
        "flex:1",
        "padding:10px 6px",
        selected
          ? "background:linear-gradient(180deg,#5fa83a,#3c6b22);color:#0d0f08;border:1px solid #2c3320"
          : "background:#0d0f08;color:#e8b923aa;border:1px solid #5c6347",
        "border-radius:3px",
        "font:700 12px 'Courier New',monospace",
        "letter-spacing:1px",
        "text-transform:uppercase",
        "cursor:pointer",
        "touch-action:manipulation",
        "text-align:center",
      ].join(";");

    const mkModeBtn = (m: GameMode, title: string, blurb: string): HTMLButtonElement => {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "radio");
      b.innerHTML = `${title}<br><span style="font-weight:400;font-size:10px;letter-spacing:0;text-transform:none">${blurb}</span>`;
      b.addEventListener("click", () => {
        mode = m;
        skirmishBtn.style.cssText = modeBtnCss(mode === "skirmish");
        survivalBtn.style.cssText = modeBtnCss(mode === "survival");
        skirmishBtn.setAttribute("aria-checked", String(mode === "skirmish"));
        survivalBtn.setAttribute("aria-checked", String(mode === "survival"));
      });
      return b;
    };
    const skirmishBtn = mkModeBtn("skirmish", "Skirmish", "free-for-all vs bots");
    const survivalBtn = mkModeBtn("survival", "Survival", "endless waves, one life");
    skirmishBtn.style.cssText = modeBtnCss(true);
    survivalBtn.style.cssText = modeBtnCss(false);
    skirmishBtn.setAttribute("aria-checked", "true");
    survivalBtn.setAttribute("aria-checked", "false");
    modeRow.appendChild(skirmishBtn);
    modeRow.appendChild(survivalBtn);

    const btn = document.createElement("button");
    btn.type = "submit";
    btn.textContent = "▶ DEPLOY";
    btn.style.cssText = [
      "margin-top:16px",
      "width:100%",
      // ≥44px tall touch target.
      "padding:14px",
      "background:linear-gradient(180deg,#5fa83a,#3c6b22)",
      "color:#0d0f08",
      "border:1px solid #2c3320",
      "border-radius:3px",
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
    card.appendChild(modeLabel);
    card.appendChild(modeRow);
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
      resolve({ name, mode });
    });
  });
}

function suggestName(): string {
  const suffix = Math.floor(Math.random() * 9000) + 1000;
  return `Recruit${suffix}`;
}
