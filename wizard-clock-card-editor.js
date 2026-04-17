/* -----------------------------------------------------------
 * Wizard Clock Card Configuration Editor
 *
 * 
 * YAML ───▶ setConfig()
 *             │
 *             ▼
 *         _fullConfig   (preserve everything)
 *             │
 *             ├──▶ _uiConfig   (only what the editor touches)
 *             │
 *             ▼
 *          _save()  ───▶ mergedConfig  ───▶ config-changed
 * 
 * ----------------------------------------------------------- */

/* --------------------------------------------------
 * Version banner (runs once when editor JS loads)
 * -------------------------------------------------- */

const CARDNAME = "wizard-clock-card-update";
const VERSION = "1.1.0";

console.info(
  "%c %s %c %s",
  "color: white; background: forestgreen; font-weight: 700;",
  `${CARDNAME.toUpperCase()} EDITOR`,
  "color: forestgreen; background: white; font-weight: 700;",
  VERSION
);

/* --------------------------------------------------
 * Editor
 * -------------------------------------------------- */

class WizardClockCardEditor extends HTMLElement {

  /* --------------------------------------------------
   * Receive config from Lovelace
   * -------------------------------------------------- */
  setConfig(config) {
    if (!config || !config.type) {
      throw new Error("Card config must include a type.");
    }

    // ✅ Preserve EVERYTHING from YAML
    this._type = config.type;
    this._fullConfig = { ...config };

    // ✅ UI-editable subset
    this._uiConfig = {
      header: config.header || "",
      wizards: (config.wizards || []).map(w => ({
        entity: w.entity || "",
        name: w.name || "",
        color: w.color || w.colour || "gold",
        textcolor: w.textcolor || w.textcolour || "black",
      })),
    };

    console.info(
      "[Wizard Clock Editor] header:",
      config.header ?? "(not set)"
    );

    this._render();
  }

  connectedCallback() {
    this._render();
  }

  /* --------------------------------------------------
   * Render UI
   * -------------------------------------------------- */
  _render() {
    if (!this._uiConfig) return;

    this.innerHTML = "";

    const root = document.createElement("div");
    root.style.display = "flex";
    root.style.flexDirection = "column";
    root.style.gap = "16px";

    /* ---------------- Header ---------------- */
    root.appendChild(
      this._textField(
        "Header",
        this._uiConfig.header,
        value => {
          this._uiConfig = { ...this._uiConfig, header: value };
          this._save();
        }
      )
    );

    const h3 = document.createElement("h3");
    h3.textContent = "Wizards";
    root.appendChild(h3);

    /* ---------------- Wizards ---------------- */
    this._uiConfig.wizards.forEach((wizard, index) => {
      const card = document.createElement("div");
      card.style.border = "1px solid var(--divider-color)";
      card.style.borderRadius = "8px";
      card.style.padding = "12px";
      card.style.display = "grid";
      card.style.gap = "8px";

      card.appendChild(
        this._textField(
          "Entity ID",
          wizard.entity,
          value => this._updateWizard(index, { entity: value }),
          "sensor.rod_location"
        )
      );

      card.appendChild(
        this._textField(
          "Name",
          wizard.name,
          value => this._updateWizard(index, { name: value })
        )
      );

      card.appendChild(this._colorField("Color", index, "color"));
      card.appendChild(this._colorField("Text Color", index, "textcolor"));

      const removeBtn = document.createElement("mwc-button");
      removeBtn.outlined = true;
      removeBtn.textContent = "❌ Remove";
      removeBtn.addEventListener("click", () => {
        const wizards = [...this._uiConfig.wizards];
        wizards.splice(index, 1);
        this._uiConfig = { ...this._uiConfig, wizards };
        this._render();
        this._save();
      });

      card.appendChild(removeBtn);
      root.appendChild(card);
    });

    /* ---------------- Add Wizard ---------------- */
    const addBtn = document.createElement("mwc-button");
    addBtn.outlined = true;
    addBtn.textContent = "➕ Add Wizard";
    addBtn.addEventListener("click", () => {
      this._uiConfig = {
        ...this._uiConfig,
        wizards: [
          ...this._uiConfig.wizards,
          { entity: "", name: "", color: "gold", textcolor: "black" },
        ],
      };
      this._render();
    });

    root.appendChild(addBtn);
    this.appendChild(root);
  }

  /* --------------------------------------------------
   * Helpers
   * -------------------------------------------------- */

  _textField(label, value, onCommit, placeholder = "") {
    const field = document.createElement("ha-textfield");
    field.label = label;
    field.value = value;
    field.placeholder = placeholder;

    // ✅ Commit only on blur / Enter
    field.addEventListener("change", e => {
      onCommit(e.target.value);
    });

    return field;
  }

  _colorField(label, index, key) {
    const wizard = this._uiConfig.wizards[index];

    const wrapper = document.createElement("div");
    wrapper.style.display = "flex";
    wrapper.style.alignItems = "center";
    wrapper.style.gap = "8px";

    const field = document.createElement("ha-textfield");
    field.label = label;
    field.value = wizard[key];
    field.placeholder = "gold | #ffd700 | rgb(...)";

    field.addEventListener("change", e => {
      const value = e.target.value;
      this._updateWizard(index, { [key]: value });
      swatch.style.background = value;
    });

    const swatch = document.createElement("div");
    swatch.style.width = "24px";
    swatch.style.height = "24px";
    swatch.style.border = "1px solid var(--divider-color)";
    swatch.style.background = wizard[key];

    wrapper.appendChild(field);
    wrapper.appendChild(swatch);
    return wrapper;
  }

  _updateWizard(index, changes) {
    const wizards = [...this._uiConfig.wizards];
    wizards[index] = { ...wizards[index], ...changes };
    this._uiConfig = { ...this._uiConfig, wizards };
    this._save();
  }

  /* --------------------------------------------------
   * Save (MERGED CONFIG)
   * -------------------------------------------------- */
  _save() {
    // ✅ Merge UI changes back into full config
    const mergedConfig = {
      ...this._fullConfig,           // preserve everything else
      type: this._type,               // explicit
      header: this._uiConfig.header,
      wizards: this._uiConfig.wizards,
    };

    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config: mergedConfig },
        bubbles: true,
        composed: true,
      })
    );
  }
}

/* --------------------------------------------------
 * Register element
 * -------------------------------------------------- */

customElements.define(
  "wizard-clock-card-editor",
  WizardClockCardEditor
);
