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
 * Version banner
 * -------------------------------------------------- */

const CARDNAME = "wizard-clock-card-update";
const VERSION = "1.2.1";

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

  setConfig(config) {
    if (!config || !config.type) {
      throw new Error("Card config must include a type.");
    }

    this._type = config.type;
    this._fullConfig = { ...config };

    const showImagesBool =
      config.show_images === true ||
      config.show_images === "Yes";

    this._uiConfig = {
      header: config.header || "",
      fontName: config.fontName || "",
      fontface: config.fontface || "",
      location_icon: config.location_icon || "center",
      shaft_colour: config.shaft_colour || config.shaft_color || "",
      show_images: showImagesBool,

      locations: Array.isArray(config.locations)
        ? [...config.locations]
        : [],

      location_icons: Array.isArray(config.location_icons)
        ? config.location_icons.map(li => ({
            name: li.name || "",
            icon: li.icon || "",
          }))
        : [],

      min_location_slots:
        typeof config.min_location_slots === "number"
          ? config.min_location_slots
          : "",
      width:
        typeof config.width === "number"
          ? config.width
          : "",

      wizards: (config.wizards || []).map(w => ({
        entity: w.entity || "",
        name: w.name || "",
        color: w.color || w.colour || "gold",
        textcolor: w.textcolor || w.textcolour || "black",
      })),
    };

    this._render();
  }

  connectedCallback() {
    this._render();
  }

  /* --------------------------------------------------
   * Render
   * -------------------------------------------------- */
  _render() {
    if (!this._uiConfig) return;

    this.innerHTML = "";

    const root = document.createElement("div");
    root.style.display = "flex";
    root.style.flexDirection = "column";
    root.style.gap = "16px";

    /* ---------- Basic fields ---------- */

    root.appendChild(
      this._textField("Header (optional, to identify each clock)", this._uiConfig.header, v => {
        this._uiConfig = { ...this._uiConfig, header: v };
        this._save();
      })
    );

    root.appendChild(
      this._textField("Font Name", this._uiConfig.fontName, v => {
        this._uiConfig = { ...this._uiConfig, fontName: v };
        this._save();
      })
    );

    root.appendChild(
      this._multilineField(
        "Font Face (CSS)",
        this._uiConfig.fontface,
        v => {
          this._uiConfig = { ...this._uiConfig, fontface: v };
          this._save();
        }
      )
    );

    root.appendChild(
      this._selectField(
        "Location (\"Number\") Icon Position (relative to the name text)",
        this._uiConfig.location_icon,
        ["before", "center", "after", "none"],
        v => {
          this._uiConfig = { ...this._uiConfig, location_icon: v };
          this._save();
        }
      )
    );

    root.appendChild(
      this._colorFieldStandalone(
        "Shaft Colour",
        this._uiConfig.shaft_colour,
        v => {
          this._uiConfig = { ...this._uiConfig, shaft_colour: v };
          this._save();
        }
      )
    );

    root.appendChild(
      this._numberField(
        "Minimum Location Slots (\"Numbers\" on the dial)",
        this._uiConfig.min_location_slots,
        v => {
          this._uiConfig = { ...this._uiConfig, min_location_slots: v };
          this._save();
        }
      )
    );

    root.appendChild(
      this._numberField("Width (of the drawing canvas)", this._uiConfig.width, v => {
        this._uiConfig = { ...this._uiConfig, width: v };
        this._save();
      })
    );

    /* ---------- Locations list ---------- */

    const locHeader = document.createElement("h3");
    locHeader.textContent = "Locations (that should always appear)";
    root.appendChild(locHeader);

  //  const locDesc = document.createElement("div");
  //  locDesc.style.color = "var(--secondary-text-color)";
  //  locDesc.style.fontSize = "0.9em";
  //  locDesc.textContent =
  //    "Locations that should always appear on clock";
  //  root.appendChild(locDesc);

    this._uiConfig.locations.forEach((loc, index) => {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.gap = "8px";
      row.style.alignItems = "center";

      const field = document.createElement("ha-textfield");
      field.value = loc;
      field.placeholder = "Location name";
      field.addEventListener("change", e => {
        const locations = [...this._uiConfig.locations];
        locations[index] = e.target.value;
        this._uiConfig = { ...this._uiConfig, locations };
        this._save();
      });

      const remove = document.createElement("mwc-button");
      remove.outlined = true;
      remove.textContent = "❌";
      remove.addEventListener("click", () => {
        const locations = [...this._uiConfig.locations];
        locations.splice(index, 1);
        this._uiConfig = { ...this._uiConfig, locations };
        this._render();
        this._save();
      });

      row.appendChild(field);
      row.appendChild(remove);
      root.appendChild(row);
    });

    const addLocation = document.createElement("mwc-button");
    addLocation.outlined = true;
    addLocation.textContent = "➕ Add Location";
    addLocation.addEventListener("click", () => {
      this._uiConfig = {
        ...this._uiConfig,
        locations: [...this._uiConfig.locations, ""],
      };
      this._render();
    });

    root.appendChild(addLocation);


    /* ---------- Location Icons ---------- */

    const liHeader = document.createElement("h3");
    liHeader.textContent = "Location Icons (for non-zone locations)";
    root.appendChild(liHeader);

//    const liDesc = document.createElement("div");
//    liDesc.style.color = "var(--secondary-text-color)";
//    liDesc.style.fontSize = "0.9em";
//    liDesc.textContent =
//      "Override icons for specific location names.";
//    root.appendChild(liDesc);

    this._uiConfig.location_icons.forEach((entry, index) => {
      const row = document.createElement("div");
      row.style.display = "grid";
      row.style.gridTemplateColumns = "1fr 1fr auto auto";
      row.style.gap = "8px";
      row.style.alignItems = "center";

      const nameField = document.createElement("ha-textfield");
      nameField.label = "Name";
      nameField.value = entry.name;
      nameField.addEventListener("change", e => {
        this._updateLocationIcon(index, { name: e.target.value });
      });

      const iconField = document.createElement("ha-textfield");
      iconField.label = "Icon";
      iconField.placeholder = "mdi:home-outline";
      iconField.value = entry.icon;
      iconField.addEventListener("change", e => {
        this._updateLocationIcon(index, { icon: e.target.value });
      });

      const preview = document.createElement("ha-icon");
      preview.icon = entry.icon || "mdi:help-circle-outline";

      const remove = document.createElement("mwc-button");
      remove.outlined = true;
      remove.textContent = "❌";
      remove.onclick = () => {
        const list = [...this._uiConfig.location_icons];
        list.splice(index, 1);
        this._uiConfig = { ...this._uiConfig, location_icons: list };
        this._render();
        this._save();
      };

      row.appendChild(nameField);
      row.appendChild(iconField);
      row.appendChild(preview);
      row.appendChild(remove);
      root.appendChild(row);
    });

    const addLocationIcon = document.createElement("mwc-button");
    addLocationIcon.outlined = true;
    addLocationIcon.textContent = "➕ Add Location Icon";
    addLocationIcon.onclick = () => {
      this._uiConfig = {
        ...this._uiConfig,
        location_icons: [
          ...this._uiConfig.location_icons,
          { name: "", icon: "mdi:help-circle-outline" },
        ],
      };
      this._render();
    };

    root.appendChild(addLocationIcon);

    /* ---------- Wizards ---------- */

    const wizHeader = document.createElement("h3");
    wizHeader.textContent = "Wizards";
    root.appendChild(wizHeader);

    this._uiConfig.wizards.forEach((wizard, index) => {
      const card = document.createElement("div");
      card.style.border = "1px solid var(--divider-color)";
      card.style.borderRadius = "8px";
      card.style.padding = "12px";
      card.style.display = "grid";
      card.style.gap = "8px";

      card.appendChild(
        this._textField("Entity ID", wizard.entity, v =>
          this._updateWizard(index, { entity: v })
        )
      );

      card.appendChild(
        this._textField("Name", wizard.name, v =>
          this._updateWizard(index, { name: v })
        )
      );

      card.appendChild(this._wizardColor("Hand Color", index, "color"));
      card.appendChild(this._wizardColor("Hand Text Color", index, "textcolor"));

      const remove = document.createElement("mwc-button");
      remove.outlined = true;
      remove.textContent = "❌ Remove";
      remove.onclick = () => {
        const wizards = [...this._uiConfig.wizards];
        wizards.splice(index, 1);
        this._uiConfig = { ...this._uiConfig, wizards };
        this._render();
        this._save();
      };

      card.appendChild(remove);
      root.appendChild(card);
    });

    const addWizard = document.createElement("mwc-button");
    addWizard.outlined = true;
    addWizard.textContent = "➕ Add Wizard";
    addWizard.onclick = () => {
      this._uiConfig = {
        ...this._uiConfig,
        wizards: [
          ...this._uiConfig.wizards,
          { entity: "", name: "", color: "gold", textcolor: "black" },
        ],
      };
      this._render();
    };

    root.appendChild(addWizard);
    this.appendChild(root);

    root.appendChild(
      this._toggleField(
        "Show Wizard Images (if entity_picture attribute exists)",
        this._uiConfig.show_images,
        v => {
          this._uiConfig = { ...this._uiConfig, show_images: v };
          this._save();
        }
      )
    );

  }

  /* --------------------------------------------------
   * Field helpers
   * -------------------------------------------------- */

  _textField(label, value, onCommit) {
    const f = document.createElement("ha-textfield");
    f.label = label;
    f.value = value ?? "";
    f.addEventListener("change", e => onCommit(e.target.value));
    return f;
  }

  _multilineField(label, value, onCommit) {
    const f = document.createElement("ha-textfield");
    f.label = label;
    f.multiline = true;
    f.rows = 4;
    f.value = value ?? "";
    f.addEventListener("change", e => onCommit(e.target.value));
    return f;
  }

  _numberField(label, value, onCommit) {
    const f = document.createElement("ha-textfield");
    f.label = label;
    f.type = "number";
    f.value = value !== "" ? String(value) : "";
    f.addEventListener("change", e =>
      onCommit(e.target.value === "" ? "" : Number(e.target.value))
    );
    return f;
  }

  _toggleField(label, value, onCommit) {
    const row = document.createElement("ha-formfield");
    row.label = label;

    const toggle = document.createElement("ha-switch");
    toggle.checked = Boolean(value);
    toggle.addEventListener("change", e =>
      onCommit(e.target.checked)
    );

    row.appendChild(toggle);
    return row;
  }

  _selectField(label, value, options, onCommit) {
    const select = document.createElement("ha-select");
    select.label = label;
    select.value = value;
    options.forEach(o => {
      const item = document.createElement("mwc-list-item");
      item.value = o;
      item.textContent = o;
      select.appendChild(item);
    });
    select.addEventListener("selected", e =>
      onCommit(e.target.value)
    );
    return select;
  }

  _colorFieldStandalone(label, value, onCommit) {
    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.gap = "8px";
    wrap.style.alignItems = "center";

    const f = document.createElement("ha-textfield");
    f.label = label;
    f.value = value ?? "";
    f.placeholder = "gold | #ffd700 | rgb(...)";
    f.addEventListener("change", e => {
      onCommit(e.target.value);
      swatch.style.background = e.target.value;
    });

    const swatch = document.createElement("div");
    swatch.style.width = "24px";
    swatch.style.height = "24px";
    swatch.style.border = "1px solid var(--divider-color)";
    swatch.style.background = value;

    wrap.appendChild(f);
    wrap.appendChild(swatch);
    return wrap;
  }

  _wizardColor(label, index, key) {
    return this._colorFieldStandalone(
      label,
      this._uiConfig.wizards[index][key],
      v => this._updateWizard(index, { [key]: v })
    );
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
    const merged = {
      ...this._fullConfig,
      type: this._type,
      header: this._uiConfig.header,
      fontName: this._uiConfig.fontName || undefined,
      fontface: this._uiConfig.fontface || undefined,
      location_icon: this._uiConfig.location_icon,
      shaft_colour: this._uiConfig.shaft_colour || undefined,
      show_images: this._uiConfig.show_images ? "Yes" : "No",

      min_location_slots:
        this._uiConfig.min_location_slots !== ""
          ? this._uiConfig.min_location_slots
          : undefined,

      width:
        this._uiConfig.width !== ""
          ? this._uiConfig.width
          : undefined,

      locations:
        this._uiConfig.locations.length
          ? this._uiConfig.locations.filter(l => l)
          : undefined,

      location_icons:
        this._uiConfig.location_icons.length
          ? this._uiConfig.location_icons.filter(
              li => li.name && li.icon
            )
          : undefined,

      wizards: this._uiConfig.wizards,
    };

    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config: merged },
        bubbles: true,
        composed: true,
      })
    );
  }
}

customElements.define(
  "wizard-clock-card-editor",
  WizardClockCardEditor
);
