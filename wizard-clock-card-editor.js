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
const VERSION = "1.2.18";

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
      debugger_stop: config.debugger_stop === true,
      debug_logging: config.debug_logging === true,
      lost: config.lost || "",
      travelling: config.travelling || "",
      draw_image_at_hand_tip:
        config.draw_image_at_hand_tip === true ||
        config.draw_image_at_hand_tip === "Yes",
      face_under_glass: config.face_under_glass || "",
      back_ground_image: config.back_ground_image || "",
      spindle_image: config.spindle_image || "",
      exclude: Array.isArray(config.exclude) ? [...config.exclude] : [],

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

      wizards: (config.wizards || []).map(w => {
        if (typeof w === "string") {
        return { entity: w, name: "", color: "gold", textcolor: "black" };
        }
        return {
        entity: w.entity || w.entity_id || "",
        name: w.name || "",
        color: w.color || w.colour || "gold",
        textcolor: w.textcolor || w.textcolour || "black",
        };
      }),
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
    console.debug("Rendering editor with _uiConfig:", this._uiConfig);

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

    root.appendChild(
      this._textField("Lost location label", this._uiConfig.lost, v => {
        this._uiConfig = { ...this._uiConfig, lost: v };
        this._save();
      })
    );

    root.appendChild(
      this._textField("Travelling location label", this._uiConfig.travelling, v => {
        this._uiConfig = { ...this._uiConfig, travelling: v };
        this._save();
      })
    );

    root.appendChild(
      this._textField("Face under glass image URL", this._uiConfig.face_under_glass, v => {
        this._uiConfig = { ...this._uiConfig, face_under_glass: v };
        this._save();
      })
    );

    root.appendChild(
      this._textField("Background image URL", this._uiConfig.back_ground_image, v => {
        this._uiConfig = { ...this._uiConfig, back_ground_image: v };
        this._save();
      })
    );

    root.appendChild(
      this._textField("Spindle image URL", this._uiConfig.spindle_image, v => {
        this._uiConfig = { ...this._uiConfig, spindle_image: v };
        this._save();
      })
    );

    const excludeHeader = document.createElement("h3");
    excludeHeader.textContent = "Excluded locations";
    root.appendChild(excludeHeader);

    this._uiConfig.exclude.forEach((ex, index) => {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.gap = "8px";
      row.style.alignItems = "center";

      const field = document.createElement("input");
      field.type = "text";
      field.value = ex ?? "";
      field.placeholder = "Location to exclude";
      field.style.flex = "1";
      field.style.boxSizing = "border-box";
      field.style.padding = "8px";
      field.style.border = "1px solid var(--divider-color)";
      field.style.borderRadius = "4px";
      field.addEventListener("change", e => {
        const exclude = [...this._uiConfig.exclude];
        exclude[index] = e.target.value;
        this._uiConfig = { ...this._uiConfig, exclude };
        this._save();
      });

      const remove = document.createElement("mwc-button");
      remove.outlined = true;
      remove.textContent = "❌";
      remove.addEventListener("click", () => {
        const exclude = [...this._uiConfig.exclude];
        exclude.splice(index, 1);
        this._uiConfig = { ...this._uiConfig, exclude };
        this._render();
        this._save();
      });

      row.appendChild(field);
      row.appendChild(remove);
      root.appendChild(row);
    });

    const addExclude = document.createElement("mwc-button");
    addExclude.outlined = true;
    addExclude.textContent = "➕ Add Excluded Location";
    addExclude.addEventListener("click", () => {
      this._uiConfig = {
        ...this._uiConfig,
        exclude: [...this._uiConfig.exclude, ""],
      };
      this._render();
    });

    root.appendChild(addExclude);

    root.appendChild(
      this._toggleField("Stop at debugger statements", this._uiConfig.debugger_stop, v => {
        this._uiConfig = { ...this._uiConfig, debugger_stop: v };
        this._save();
      })
    );

    root.appendChild(
      this._toggleField("Enable debug logging", this._uiConfig.debug_logging, v => {
        this._uiConfig = { ...this._uiConfig, debug_logging: v };
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

      const field = document.createElement("input");
      field.type = "text";
      field.value = loc ?? "";
      field.placeholder = "Location name";
      field.style.flex = "1";
      field.style.boxSizing = "border-box";
      field.style.padding = "8px";
      field.style.border = "1px solid var(--divider-color)";
      field.style.borderRadius = "4px";
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

      const nameField = document.createElement("input");
      nameField.type = "text";
      nameField.value = entry.name ?? "";
      nameField.placeholder = "Name";
      nameField.style.boxSizing = "border-box";
      nameField.style.padding = "8px";
      nameField.style.border = "1px solid var(--divider-color)";
      nameField.style.borderRadius = "4px";
      nameField.addEventListener("change", e => {
        this._updateLocationIcon(index, { name: e.target.value });
      });

      const iconField = document.createElement("input");
      iconField.type = "text";
      iconField.value = entry.icon ?? "";
      iconField.placeholder = "mdi:home-outline";
      iconField.style.boxSizing = "border-box";
      iconField.style.padding = "8px";
      iconField.style.border = "1px solid var(--divider-color)";
      iconField.style.borderRadius = "4px";
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

    root.appendChild(
      this._toggleField(
        "Draw wizard image at the hand tip",
        this._uiConfig.draw_image_at_hand_tip,
        v => {
          this._uiConfig = { ...this._uiConfig, draw_image_at_hand_tip: v };
          this._save();
        }
      )
    );

  }

  /* --------------------------------------------------
   * Field helpers
   * -------------------------------------------------- */

  _textField(label, value, onCommit) {
    const wrapper = document.createElement("div");
    wrapper.style.display = "flex";
    wrapper.style.flexDirection = "column";
    wrapper.style.gap = "4px";

    const labelEl = document.createElement("label");
    labelEl.textContent = label;
    labelEl.style.fontWeight = "500";

    const input = document.createElement("input");
    input.type = "text";
    input.value = value ?? "";
    input.placeholder = label;
    input.style.display = "block";
    input.style.width = "100%";
    input.style.minWidth = "200px";
    input.style.minHeight = "36px";
    input.style.boxSizing = "border-box";
    input.style.padding = "8px";
    input.style.border = "1px solid var(--divider-color)";
    input.style.borderRadius = "4px";
    input.addEventListener("change", e => onCommit(e.target.value));

    wrapper.appendChild(labelEl);
    wrapper.appendChild(input);
    return wrapper;
  }

  _multilineField(label, value, onCommit) {
    const wrapper = document.createElement("div");
    wrapper.style.display = "flex";
    wrapper.style.flexDirection = "column";
    wrapper.style.gap = "4px";

    const labelEl = document.createElement("label");
    labelEl.textContent = label;
    labelEl.style.fontWeight = "500";

    const textarea = document.createElement("textarea");
    textarea.value = value ?? "";
    textarea.placeholder = label;
    textarea.rows = 4;
    textarea.style.display = "block";
    textarea.style.width = "100%";
    textarea.style.minWidth = "200px";
    textarea.style.minHeight = "80px";
    textarea.style.boxSizing = "border-box";
    textarea.style.padding = "8px";
    textarea.style.border = "1px solid var(--divider-color)";
    textarea.style.borderRadius = "4px";
    textarea.addEventListener("change", e => onCommit(e.target.value));

    wrapper.appendChild(labelEl);
    wrapper.appendChild(textarea);
    return wrapper;
  }

  _numberField(label, value, onCommit) {
    const wrapper = document.createElement("div");
    wrapper.style.display = "flex";
    wrapper.style.flexDirection = "column";
    wrapper.style.gap = "4px";

    const labelEl = document.createElement("label");
    labelEl.textContent = label;
    labelEl.style.fontWeight = "500";

    const input = document.createElement("input");
    input.type = "number";
    input.value = value !== "" ? String(value) : "";
    input.placeholder = label;
    input.style.display = "block";
    input.style.width = "100%";
    input.style.minWidth = "200px";
    input.style.boxSizing = "border-box";
    input.style.padding = "8px";
    input.style.border = "1px solid var(--divider-color)";
    input.style.borderRadius = "4px";
    input.addEventListener("change", e =>
      onCommit(e.target.value === "" ? "" : Number(e.target.value))
    );

    wrapper.appendChild(labelEl);
    wrapper.appendChild(input);
    return wrapper;
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
    const wrapper = document.createElement("div");
    wrapper.style.display = "flex";
    wrapper.style.flexDirection = "column";
    wrapper.style.gap = "4px";

    const labelEl = document.createElement("label");
    labelEl.textContent = label;
    labelEl.style.fontWeight = "500";

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

    wrapper.appendChild(labelEl);
    wrapper.appendChild(select);
    return wrapper;
  }

  _colorFieldStandalone(label, value, onCommit) {
    const wrapper = document.createElement("div");
    wrapper.style.display = "flex";
    wrapper.style.flexDirection = "column";
    wrapper.style.gap = "4px";

    const labelEl = document.createElement("label");
    labelEl.textContent = label;
    labelEl.style.fontWeight = "500";

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.gap = "8px";
    wrap.style.alignItems = "center";

    const f = document.createElement("input");
    f.type = "text";
    f.value = value ?? "";
    f.placeholder = "gold | #ffd700 | rgb(...)";
    f.style.flex = "1";
    f.style.display = "block";
    f.style.width = "100%";
    f.style.boxSizing = "border-box";
    f.style.padding = "8px";
    f.style.border = "1px solid var(--divider-color)";
    f.style.borderRadius = "4px";
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
    wrapper.appendChild(labelEl);
    wrapper.appendChild(wrap);
    return wrapper;
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
      lost: this._uiConfig.lost || undefined,
      travelling: this._uiConfig.travelling || undefined,
      draw_image_at_hand_tip: this._uiConfig.draw_image_at_hand_tip ? "Yes" : "No",
      face_under_glass: this._uiConfig.face_under_glass || undefined,
      back_ground_image: this._uiConfig.back_ground_image || undefined,
      spindle_image: this._uiConfig.spindle_image || undefined,
      exclude: this._uiConfig.exclude.length
        ? this._uiConfig.exclude.filter(e => e)
        : undefined,

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
      debugger_stop: this._uiConfig.debugger_stop,
      debug_logging: this._uiConfig.debug_logging,
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
