const CARDNAME = "wizard-clock-card-update";
const VERSION = "2026.06.04";

const debugLogging = false;   // set to true to enable detailed logging for debugging purposes
const debuggerStop = false ;  // set to true to stop at debugger statements
class WizardClockCard extends HTMLElement {

/* ============================================================================
   WIZARD CLOCK CARD — ARCHITECTURE DIAGRAM (with setConfig)
   ============================================================================

   ┌─────────────────────────────────────────────────────────────────────────┐
   │ 0. Card Initialization (setConfig)                                      │
   └─────────────────────────────────────────────────────────────────────────┘
       - parse config
       - create canvas + contexts
       - inject font-face
       - build wizardInfo[]
       - build zone/location icon tables
       - set up resize observer
       - load background image (async)
       - load spindle image (async)
       - load wizard images (async)
       - compute initial geometry (resizeClock)
       - drawClock() once (optional)

   ============================================================================

   ┌─────────────────────────────────────────────────────────────────────────┐
   │ 1. Home Assistant State Update (set hass)                               │
   └─────────────────────────────────────────────────────────────────────────┘
                     │
                     ▼
        ┌──────────────────────────────┐
        │ Read wizard entity states    │
        │ Compute new target angles    │
        └──────────────────────────────┘
                     │
                     ▼
        ┌──────────────────────────────┐
        │ Compare with previous state  │
        └──────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
        ▼                         ▼
   (no change)               (state changed)
                                  │
                                  ▼
                            startHandAnimation()
                           (begin animation loop)

   ============================================================================

   ┌─────────────────────────────────────────────────────────────────────────┐
   │ 2. Animation Loop (requestAnimationFrame)                               │
   └─────────────────────────────────────────────────────────────────────────┘

   startHandAnimation():
       - capture startAngles[]
       - capture targetAngles[]
       - animationStartTime = performance.now()
       - isAnimating = true
       - animateHands()

   animateHands():
       - compute t = (now - startTime) / duration
       - eased = easeOutCubic(t)
       - interpolate each hand angle
       - drawClock()
       - if t < 1 → requestAnimationFrame(animateHands)
       - else isAnimating = false

   ============================================================================

   ┌─────────────────────────────────────────────────────────────────────────┐
   │ 3. Visual Events (non‑state triggers)                                   │
   └─────────────────────────────────────────────────────────────────────────┘

   These events DO NOT start animation.
   They only redraw the static clock face.

   Wizard image loads:
       img.onload → drawClock()

   Background image loads:
       bg.onload → drawClock()

   Spindle image loads:
       sp.onload → drawClock()

   Resize observer:
       resize → resizeClock() → drawClock()

   Theme change:
       CSS variables changed → drawClock()

   Config editor changes:
       new config applied → setConfig() → drawClock()

   ============================================================================

   ┌─────────────────────────────────────────────────────────────────────────┐
   │ 4. Pure Rendering Layer                                                 │
   └─────────────────────────────────────────────────────────────────────────┘

   drawClock():
       - clear canvas
       - drawFace()
       - drawNumbers()
       - drawTime()   (uses currentstate[] angles)
       - drawSpindle()
       (NO animation logic here)
       (NO requestAnimationFrame here)
       (NO lastframe resets)

   ============================================================================ */


// ----------------------------------------------------------------------------
// Whenever the state changes, a new `hass` object is set: Update the content.
// ----------------------------------------------------------------------------
  set hass(hass) {
// ----------------------------------------------------------------------------
    if (debuggerStop) debugger;
    if (debugLogging) console.log(`${this.config.header ? "(" + this.config.header + ") " : ""}set hass start`);
    this._hass = hass;

    // Get information about current locations and wizards

    this.locationInfo ||= []; // -------- this is where we store info about each location ("number" on the clock face)
    this.targetstate = []; // ----------- this is where we want the hand to point, based on the current state in hass
    this.wizardInfoPrevious ||= []; // -- saved to make comparison before updating the whole clock

    /* Clear the "keep" flag on all locationInfo entries, we'll set it again for any that are still in use */
    for (let num = 0; num < this.locationInfo.length; num++){
      this.locationInfo[num].keep = false;
      this.locationInfo[num].wizardCount = 0;
      this.locationInfo[num].wizardPosition = 0;
    }

    /* Get the list of locations to display, starting with any from the config. */

    var locationInfoEntry;
    var num;
    if (this.config.locations){
      for (let num = 0; num < this.config.locations.length; num++){
        locationInfoEntry = this.getLocationInfo(this.config.locations[num]);
        locationInfoEntry.keep = true;
      }
    }
    if (this.config.travelling){
      locationInfoEntry = this.getLocationInfo(this.config.travelling);
      locationInfoEntry.keep = true;
    }
    if (this.config.lost){
      locationInfoEntry = this.getLocationInfo(this.lostState);
      locationInfoEntry.keep = true;
    }

    /* Add the state of each wizard, which may be in a zone or something else. */
    for (let num = this.wizardInfo.length - 1; num >= 0; num--) {
      var stateStr = this.getWizardState(this.wizardInfo[num].entity);
      this.wizardInfo[num].stateStr = stateStr;
      if (debugLogging) {
        console.log(`${this.config.header ? "(" + this.config.header + ") " : ""}(${this.wizardInfo[num].name}) set hass stateStr: ${stateStr}`);
      }

      if (typeof(stateStr)!=="string")
        throw new Error("Unable to add state for entity " + this.wizardInfo[num].entity + " of type " + typeof(stateStr) + ".");

      let locationInfoEntry = this.getLocationInfo(stateStr);
      locationInfoEntry.keep = true;
      locationInfoEntry.lastUsed = performance.now();  // Update the last used timestamp
      this.wizardInfo[num].offset = zigZagOffset(locationInfoEntry.wizardCount);
      this.wizardInfo[num].locnum = locationInfoEntry.locnum      
      locationInfoEntry.wizardCount += 1;

      /* Create an image object and assign the URL if we can find one. */
      if (this.show_images) {
        this.loadWizardImage(num);
      }
    }

    /* Add some "empty" location slots if we don't have min_location_slots yet; 
        this helps to stop the clock from jumping around when new locations are added later */
    var location_icon_num = 0;   /* start with the first location that we listed icons for in the config */ 
    while (this.locationInfo.length < this.min_location_slots) {   /* continue until we have enough */
        if (location_icon_num < this.config.location_icons.length) {  /* any locations left available? */
          let li = this.config.location_icons[location_icon_num];
          location_icon_num++;
          let locationInfoEntry = this.getLocationInfo(li.name);  /* try this one */
          if (locationInfoEntry.keep == false) {
              locationInfoEntry.keep = true;            /* keep it for this cycle */
              continue;                                       /* we just added it */
          }
        } else {
          let locationInfoEntry = this.addLocationInfo(' ');
          locationInfoEntry.keep = false;
          console.log(`Added empty location slot`);
        }
    }

    /* Finally, begin drawing the clock! */

    // Detect whether wizard positions changed
    const changed = !deepEqual(this.wizardInfoPrevious, this.wizardInfo);
    this.wizardInfoPrevious = structuredClone(this.wizardInfo);

    if (changed) {

      /* List the wizardInfo in the console for debugging */

      if (debugLogging) {
        console.log(`${this.config.header ? "(" + this.config.header + ") " : ""}wizardInfo:`);
        for (let num = 0; num < this.wizardInfo.length; num++){
            console.log(`    ${this.wizardInfo[num].name} (entity: ${this.wizardInfo[num].entity}, image: ${this.wizardInfo[num].image ? this.wizardInfo[num].image.src : "none"}, `);
            console.log(`        color: ${this.wizardInfo[num].color}, textcolor: ${this.wizardInfo[num].textcolor}`);
            console.log(`        stateStr: ${this.wizardInfo[num].stateStr}, locnum: ${this.wizardInfo[num].locnum}, offset: ${this.wizardInfo[num].offset})`);
          }
      }

      /* List the locationInfo in the console for debugging */

      if (debugLogging) {
        console.log(`${this.config.header ? "(" + this.config.header + ") " : ""}locationInfo:`);
        for (let num = 0; num < this.locationInfo.length; num++){
          if (this.locationInfo[num].name === ' ') {
            console.log(`    (empty slot)`);
          } else {
            console.log(`    ${this.locationInfo[num].name} (locnum: ${this.locationInfo[num].locnum}, keep: ${this.locationInfo[num].keep}, wizardCount: ${this.locationInfo[num].wizardCount}, lastUsed: ${this.locationInfo[num].lastUsed})`);
          }
        }
      }

      this.resizeClock();
      this.startHandAnimation();
    }

}

// ----------------------------------------------------------------------------
// setConfig - is called when the configuration changes.
// Throw an exception and Home Assistant will render an error card.
// ----------------------------------------------------------------------------
  setConfig(config) {
// ----------------------------------------------------------------------------
    if (debuggerStop) debugger;

    console.info("%c %s %c %s",
      "color: white; background: forestgreen; font-weight: 700;",
      CARDNAME.toUpperCase(),
      "color: forestgreen; background: white; font-weight: 700;",
      VERSION,
    );
    try {
      this.config = config;

      if (!config.wizards) {
        throw new Error('You need to define some wizards');
      }

      if (debugLogging) console.log(`Logging header: ${this.config.header ? "(" + this.config.header + ") " : "Not specified"}`);

      this.currentstate = [];
      this.lostState = config.lost ? config.lost : "Lost";
      this.locationIcon =
          ["before", "center", "after", "none"].includes(config.location_icon)
              ? config.location_icon
              : "center"; // position of the icon relative to the text
      console.log(this.locationIcon);
      this.travellingState = config.travelling ? config.travelling : "Away";
      this.min_location_slots = this.config.min_location_slots ? this.config.min_location_slots : 0;
      this.show_images=this.config.show_images ? (this.config.show_images=="Yes" ? true : false) : false;
      this.imageAtTip = this.config.draw_image_at_hand_tip ? (this.config.draw_image_at_hand_tip=="Yes" ? true : false) : false;

      this.backGroundImage = this.config.back_ground_image;
      this.spindleImage = this.config.spindle_image;
      this.faceUnderGlass = this.config.face_under_glass;

      if (this.config.shaft_colour){
        this.spindleColor = this.config.shaft_colour;
      }
      else if (this.config.shaft_color){
        this.spindleColor = this.config.shaft_color;
      }
      else if (this.config.spindle_color){
        this.spindleColor = this.config.spindle_color;
      }
      else {
        this.spindleColor = getComputedStyle(document.documentElement).getPropertyValue('--primary-color');
      }    

      if (this.config.fontName) {
        this.selectedFont = this.config.fontName;
      } else {
        this.selectedFont = "itcblkad_font";
      }
      console.log(this.selectedFont);
      this.fontScale = 1.1;

      this.exclude = [];
      if (this.config.exclude){
        for (var num = 0; num < this.config.exclude.length; num++){
          if (this.exclude.indexOf(this.config.exclude[num]) == -1){
            this.exclude.push(this.config.exclude[num]);
          }
        }
      }

      // Set up document canvas.

      this.configuredWidth = this.config.width ? this.config.width : "500";

      if (!this.canvas) {
        this.card = document.createElement('ha-card');
        if (this.config.header) {
          this.card.header = this.config.header;
        }

        // Inject font-face only once

        if (!WizardClockCard.fontInjected) {
          var fontstyle = document.createElement('style');

          if (this.config.fontface){
            fontstyle.innerText = "@font-face { " + this.config.fontface + " }  ";
          } else {
            // my default
            fontstyle.innerText = "@font-face {    font-family: itcblkad_font;    src: local(itcblkad_font), url('/local/ITCBLKAD.TTF') format('opentype');}  ";
          }
          if (debugLogging) console.log(fontstyle.innerText);
        
          document.head.appendChild(fontstyle);
          WizardClockCard.fontInjected = true;
        }

        this.div = document.createElement('div');
        this.div.style.textAlign = 'center';
        this.canvas = document.createElement('canvas');
        this.div.appendChild(this.canvas);
        this.card.appendChild(this.div);
        this.appendChild(this.card);
        if (!this.canvas.getContext)
          throw new Error("Browser does not support " + CARDNAME + " canvas.");
        this.ctx = this.canvas.getContext("2d");
        
        /* set up icon rendering area */
        this.iconPaths = [];
        this.iconCanvas = document.createElement('canvas');
        this.iconCtx = this.iconCanvas.getContext("2d");
        this.iconCtx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--primary-text-color');
        this.iconCtx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--primary-text-color');

        /* set up color resolution area */
        this.colorElement = document.createElement('span');
        this.colorElement.textContent = "x";   // invisible but forces color computation
        this.colorElement.style.position = "absolute";
        this.colorElement.style.left = "-9999px";
        this.div.appendChild(this.colorElement);
        
        /* icons for locations that are not zones */
        this.zoneInfo = [];
        (config.location_icons || []).forEach(li => {
          this.addZoneInfo(li.name, li.icon);
        });

        /* watch for changes in the size of the card */

        if (this.resizeObserver) {
          this.resizeObserver.disconnect();
        }

        this.resizeTimeout = false;
        this.resizeDelay = 500;

        this.resizeObserver = createResizeObserver(this);
        this.resizeObserver.observe(this.card);

        this.observeThemeChanges();
      }

      /* Create normalized wizard configuration object. */

      this.wizardInfo = [];

      for (let i = 0; i < config.wizards.length; i++) {
        const wiz = config.wizards[i];

        // Accept both spellings
        const rawColor =
          (wiz.colour && wiz.colour.trim()) ||
          (wiz.color && wiz.color.trim()) ||
          "lightblue";     // default hand color

        const rawTextColor =
          (wiz.textcolour && wiz.textcolour.trim()) ||
          (wiz.textcolor && wiz.textcolor.trim()) ||
          "black";        // default label color

        this.wizardInfo.push({
          entity: wiz.entity,
          name: wiz.name,
          num: i,
          color: getHexColor(rawColor, this.colorElement),          // hand color
          textcolor: getHexColor(rawTextColor, this.colorElement),  // label text color
          offset: 0,  // this will be set later based on how many wizards are in the same location
          image: null // this will be set later if we can find an image for the wizard
        });

        /* Start load of image. */
        if (this.show_images) {
          this.loadWizardImage(i);
        }
        
      }
      this.resizeClock();
      if (this._hass) {
        this.drawClock();
      }

      } catch (err) {
      console.error(`Failed in setConfig(): `, err);
    }
    if (debugLogging) console.log(`${this.config.header ? "(" + this.config.header + ") " : ""}getConfig end`);
  }

// ----------------------------------------------------------------------------
// Link to card configuration editor
// ⚠️ Note: When used in a Panel view, the visual editor is not accessible.
// Temporarily switch the view to “Sections” to edit the card.
// ----------------------------------------------------------------------------

  static getConfigElement() {
    return document.createElement("wizard-clock-card-editor");
  }

  static getStubConfig() {
    return {
      header: "Wizard Clock",
      wizards: [
        {
          entity: "",
          name: "",
          color: "lightblue",
          textcolor: "black"
        }
      ],
      show_images: "No",
      location_icon: "center"
    };
  }

// ----------------------------------------------------------------------------
  observeThemeChanges() {
// ----------------------------------------------------------------------------
    const root = document.documentElement;

    this.themeObserver = new MutationObserver(() => {
      this.drawClock();
    });

    this.themeObserver.observe(root, {
      attributes: true,
      attributeFilter: ["style", "class"]
    });
  }

// ----------------------------------------------------------------------------
// startHandAnimation -> animateHands = animation logic
// ----------------------------------------------------------------------------

  // --- Starting animation state ---
  animationStartTime = 0;
  animationDuration = 600; // ms
  isAnimating = false;
  startAngles = [];
  targetAngles = [];

  // --- Easing functions ---
  easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  easeOutBounce(t) {
    const n1 = 7.5625;
    const d1 = 2.75;

    if (t < 1 / d1) {
      return n1 * t * t;
    } else if (t < 2 / d1) {
      t -= 1.5 / d1;
      return n1 * t * t + 0.75;
    } else if (t < 2.5 / d1) {
      t -= 2.25 / d1;
      return n1 * t * t + 0.9375;
    } else {
      t -= 2.625 / d1;
      return n1 * t * t + 0.984375;
    }
  }

// ----------------------------------------------------------------------------
  startHandAnimation() {
// ----------------------------------------------------------------------------

    // =====================================================
    // 1. Force a fresh drawClock() to build target/current state
    // =====================================================
    this.drawClock();   // <-- THIS is the missing piece

    // =====================================================
    // 2. Capture starting angles
    // =====================================================
    this.startAngles = this.currentstate.map(s => s.pos);

    // =====================================================
    // 3. Capture target angles
    // =====================================================
    this.targetAngles = this.targetstate.map(s => s.pos);

    // =====================================================
    // 4. Validate geometry before starting animation
    // =====================================================
    for (let i = 0; i < this.startAngles.length; i++) {
      if (!isFinite(this.startAngles[i]) || !isFinite(this.targetAngles[i])) {
        console.warn("startHandAnimation: invalid angle, skipping animation", {
          start: this.startAngles[i],
          target: this.targetAngles[i]
        });
        return;
      }
    }

  // =====================================================
  // 5. Start animation
  // =====================================================
  this.animationStartTime = performance.now();
  this.isAnimating = true;
  this.animateHands();
}

// ----------------------------------------------------------------------------
  animateHands() {
// ----------------------------------------------------------------------------

    // Abort animation if geometry becomes invalid mid-animation
    for (let i = 0; i < this.currentstate.length; i++) {
      if (!isFinite(this.startAngles[i]) ||
          !isFinite(this.targetAngles[i]) ||
          !isFinite(this.currentstate[i].pos)) {
        console.warn("Aborting animation due to invalid state:", {
          start: this.startAngles[i],
          target: this.targetAngles[i],
          current: this.currentstate[i].pos
        });
        this.isAnimating = false;
        this.drawClock();
        return;
      }
    }

    const now = performance.now();
    const t = Math.min((now - this.animationStartTime) / this.animationDuration, 1);
  //  const eased = this.easeOutCubic(t);
    const eased = this.easeOutBounce(t);

    // Interpolate each hand
    for (let i = 0; i < this.currentstate.length; i++) {
      const start = this.startAngles[i];
      const end = this.targetAngles[i];
      this.currentstate[i].pos = start + (end - start) * eased;
    }

    // Draw one frame
    this.drawClock();

    if (t < 1) {
      requestAnimationFrame(() => this.animateHands());
    } else {
      this.isAnimating = false;
    }
  }


// ----------------------------------------------------------------------------
  loadWizardImage(num) {
// ----------------------------------------------------------------------------
    const wiz = this.wizardInfo[num].name;
    // Ensure entity exists
    if (!wiz.entity) return;

    const state = this._hass.states[wiz.entity];
    if (!state || !state.attributes) return;

    const url = (state.attributes.entity_picture || "").trim();
    if (!url) return; // nothing to load

    // Create or update image if needed
    if (!wiz.image || wiz.image.src !== url) {
      const img = new Image();

      /* Images will only be displayed once they have completed loading. */

      img.onload = () => {
        if (debuggerStop) debugger;
        wiz.image = img;
        if (debugLogging) {
          console.log(`wizardInfo[${num}].image loaded: ${wiz.image.src}`);
        }
        this.drawClock();
      };

      img.onerror = () => {
      if (debuggerStop) debugger;
        console.log(`wizardInfo[${num}].image failed to load: ${url}`);
      };

      img.src = url;
    }
  }

// ----------------------------------------------------------------------------
  resizeClock() {
// ----------------------------------------------------------------------------
    if (debuggerStop) debugger;
    if (debugLogging) console.log(`${this.config.header ? "(" + this.config.header + ") " : ""}resizeClock: start`);

    if (!this.configuredWidth || !this.canvas || !this.iconCanvas) {
      return
    }
    // Calculate available width
    this.availableWidth = Math.round(Math.min(this.card.offsetWidth, window.innerWidth, window.innerHeight)) - 16;
    if (debugLogging) console.log(`${this.config.header ? "(" + this.config.header + ") " : ""}availableWidth: ${this.availableWidth}px`);
    if (this.availableWidth <= 0) {
      this.availableWidth = Math.round(Math.min(window.innerWidth, window.innerHeight)) - 16;
      if (this.availableWidth <= 0) {
        this.availableWidth = this.configuredWidth;  // fallback to configured width if nothing drawn yet
      }
    } else {
      this.availableWidth = Math.round(Math.min(this.availableWidth, this.configuredWidth));
    }
    // Adjust the clock dimensions
    this.canvas.width = this.configuredWidth;
    this.canvas.height = this.configuredWidth;
    this.canvas.style.width = `${this.availableWidth}px`;
    this.canvas.style.height = `${this.availableWidth}px`;
    this.scaleRatio = this.configuredWidth / this.availableWidth;
    if (debugLogging) console.log(`${this.config.header ? "(" + this.config.header + ") " : ""}scaleRatio: ${this.scaleRatio}`);
    
    this.radius = this.canvas.width / 2;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.translate(this.radius, this.radius);
    this.radius = this.radius * 0.90;

    // Resize the icon generation area
   // if (this.iconCanvas) {
      const iconCanvasSize = roundToEven(this.availableWidth / 16);
      this.iconCanvas.width = iconCanvasSize;
      this.iconCanvas.height = iconCanvasSize;
   // }

   this.wizardInfoPrevious = []; // Set to redraw the clock
  }

// ----------------------------------------------------------------------------
// getCardSize - Indicates the height of the card in 50px units. 
// Home Assistant uses this to automatically distribute cards over the columns.
// ----------------------------------------------------------------------------
  getCardSize() {
// ----------------------------------------------------------------------------
    if (debuggerStop) debugger;

    var cardSize = (this.configuredWidth / 50).toFixed(1);
    if (debugLogging) console.log(`${this.config.header ? "(" + this.config.header + ") " : ""}getCardSize = ${cardSize}`);
    return cardSize;
  }

// ----------------------------------------------------------------------------
  // get-WizardState - makes all decisions about what stateStr should be.
// ----------------------------------------------------------------------------
  getWizardState(entity) {
// ----------------------------------------------------------------------------
    // if (debuggerStop) debugger;

    const state = this._hass.states[entity];
    if (!state) {
      /* If the entity doesn't exist, log a warning and return the lost state (if configured) or Away. */
      if (debugLogging) console.log(`${this.config.header ? "(" + this.config.header + ") " : ""}Wizard ${entity} does not exist.`);
      return this.lostState;
    }
    
    /* We have a state object */
    let stateStr = state.state;
    if (debugLogging) console.log(`Initial stateStr for entity ${entity}: ${stateStr}`);

    /* If the state is "unknown" or "unavailable", return the lost state (if configured) or Away. */
    if (["unknown", "unavailable"].includes(stateStr)) {
      return this.lostState;
    }
    
    /* If the state is excluded in the config, return the lost state (if configured) or Away.*/
    if (this.exclude.includes(stateStr)) {
      return this.lostState;
    }

    if (stateStr === "Home") {
      return stateStr; // keep untranslated "Home" state. (Only lowercase "home" will be translated.)
    }

    /* translate states like "home", "not_home", "just_arrived", "just_left", "extended_away" if possible */
    let rawStateStr = stateStr;
    stateStr = this._hass.formatEntityState(state);
    if (debugLogging) console.log(`rawStateStr: ${rawStateStr}, stateStr: ${stateStr}`);
    if (stateStr != rawStateStr && stateStr.toLowerCase() != 'away') {
      /* Keep a state that was translated (except "not_home" or "away"). */
      return stateStr;
    }

    const stateVelo = state && state.attributes ? (
      state.attributes.velocity ? state.attributes.velocity : (
        state.attributes.speed ? state.attributes.speed : (
          state.attributes.moving ? 16 : 0
    ))) : 0;
    
    /* Prioritize selection (favor more specific): 1. message attribute, 2. zone attribute or state, 3. locality attribute, 4. state */

    if (state.attributes) {
      if (debugLogging) console.log(`Checking attributes for entity ${entity}:`, state.attributes);
      /* 1. message attribute */
      if (state.attributes.message) {
        return state.attributes.message;
      }
      /* 2a. zone attribute */
      if (state.attributes.zone) {
        /* Look up zone friendly name */
        const rawZone = state.attributes.zone.replace("zone.", "");
        if (debugLogging) console.log(`rawZone: ${rawZone}`);
        if (rawZone !== "home") {
          const zoneEntity = this._hass.states["zone." + rawZone];
          if (zoneEntity) {
            const attrs = zoneEntity.attributes;
            if (attrs && attrs.friendly_name) {
              return attrs.friendly_name;
            }
          }
        }
      }
      /* 2b. sometimes the state itself is the zone, so also check that */
      const zoneEntityId = resolveZoneEntityId(this._hass, stateStr);
      if (zoneEntityId) {
        return this._hass.states[zoneEntityId].attributes.friendly_name;
      }
      /* 3. locality attribute */
      if (state.attributes.locality && !this.exclude.includes(state.attributes.locality)) {
        return state.attributes.locality;
      }

    }

    if (['away','not_home'].some(s => stateStr.toLowerCase().includes(s))) {
      /* Away with no other details */
      if (stateVelo > 15 && this.config.travelling) {
        /* show travelling (if configured and velocity > 15) */
        stateStr = this.travellingState;
      } else {
        /* show lost (if configured) or Away */
        stateStr = this.lostState;
      }
    }

    if (debugLogging) console.log(`Final stateStr for entity ${entity}: ${stateStr}`);
    return stateStr;
  }

// ----------------------------------------------------------------------------
// drawClock - render the clock face and hands.
// ----------------------------------------------------------------------------
  drawClock() {
// ----------------------------------------------------------------------------
    if (debuggerStop) debugger;

    // =====================================================
    // SAFETY GUARD: Ensure geometry is valid before drawing
    // =====================================================
    if (!isFinite(this.radius) || this.radius <= 0 ) {
        console.warn("drawClock skipped:  invalid geometry:", {
        radius: this.radius,
      });
      return;
    }

    if (!Array.isArray(this.locationInfo) || this.locationInfo.length === 0) {
        console.log("drawClock skipped: locationInfo not ready");
        return;
    }

    if (!Array.isArray(this.wizardInfo) || this.wizardInfo.length === 0) {
        console.log("drawClock skipped: wizardInfo not ready");
        return;
    }

    if (debugLogging) console.log(`${this.config.header ? "(" + this.config.header + ") " : ""}drawClock start`);

    // Clear full canvas extents
    this.ctx.clearRect(
      -this.canvas.width,
      -this.canvas.height,
      this.canvas.width * 2,
      this.canvas.height * 2
    );

    // Draw the clock
    this.drawFace(this.ctx, this.radius);
    this.drawNumbers(this.ctx, this.radius, this.locationInfo);
    this.drawTime(this.ctx, this.radius, this.locationInfo, this.wizardInfo);
    this.drawSpindle(this.ctx, this.radius, this.spindleColor);
  }

// ----------------------------------------------------------------------------
  drawFace(ctx, radius) {
// ----------------------------------------------------------------------------
    if (debuggerStop) debugger;

    if (debugLogging) console.log(`${this.config.header ? "(" + this.config.header + ") " : ""}drawFace start`);
    let backgroundScaledRadius;
    if (this.locationIcon == "center") {
      backgroundScaledRadius = radius * 0.7;
    } else {
      backgroundScaledRadius = radius * 0.85;
    }
    //const backgroundGlobalAlpha = 0.50;   // 50% opacity
    const backgroundGlobalAlpha = 0.95;     // 95% opacity

    ctx.shadowColor = null;
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Color the face
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, 2*Math.PI);
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--secondary-background-color');
    ctx.fill();

    // TODO: animate the face by rotating through a series of background images?

    // Get the background image if configured
    if (this.backGroundImage) {

        // Start loading only once
        if (!this.bgCircular && !this.bgImage) {

            const img = new Image();
            this.bgImage = img;   // mark load in progress

            img.onload = () => {
                if (debuggerStop) debugger;
                console.log("Background image loaded:", this.backGroundImage);

                const imgW = img.width;
                const imgH = img.height;
                const r = Math.min(imgW, imgH) / 2;

                const offCanvas = document.createElement('canvas');
                offCanvas.width = imgW;
                offCanvas.height = imgH;

                const offCtx = offCanvas.getContext('2d');

                // Clip to centered circle
                offCtx.beginPath();
                offCtx.arc(imgW / 2, imgH / 2, r, 0, 2 * Math.PI);
                offCtx.clip();

                offCtx.drawImage(img, 0, 0, imgW, imgH);

                this.bgCircular = offCanvas;

                // free memory — safe because we never need the raw image again
                this.bgImage = null;

                this.lastframe = requestAnimationFrame(() => this.drawClock());

                this.drawClock();
            };

            img.onerror = () => {
                  if (debuggerStop) debugger;
                console.warn("Background image failed to load:", this.backGroundImage);

                // mark failure so we don't retry endlessly
                this.bgImage = "Failed";

                // redraw WITHOUT background
                //this.lastframe = requestAnimationFrame(() => this.drawClock());
            };
            console.log("Loading background image: ", this.backGroundImage)
            img.src = this.backGroundImage;
        }

        // Draw the background image if loaded
        if (this.bgCircular) {
            ctx.save();
            ctx.globalAlpha = backgroundGlobalAlpha;
            ctx.drawImage(
                this.bgCircular,
                -backgroundScaledRadius,
                -backgroundScaledRadius,
                backgroundScaledRadius * 2,
                backgroundScaledRadius * 2
            );
            ctx.restore();
        }
    }

    // Draw face border with subtle shadow
    ctx.save();
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--primary-text-color');   // --divider-color or --primary-text-color
    ctx.lineWidth = Math.max(2, radius * 0.025);
    ctx.shadowColor = "#0006";
    ctx.shadowBlur = 4;
    ctx.stroke();
    ctx.restore();
  }

// ----------------------------------------------------------------------------
  drawNumbers(ctx, radius, locationInfo) {
// ----------------------------------------------------------------------------
    if (debuggerStop) debugger;
    if (debugLogging) console.log(`${this.config.header ? "(" + this.config.header + ") " : ""}drawNumbers start`);
    /* 
        Text on a curve code modified from function written by James Alford here: http://blog.graphicsgen.com/2015/03/html5-canvas-rounded-text.html
      */
      var ang;
      var num;
      ctx.font = radius*0.15*this.fontScale + "px " + this.selectedFont;
      ctx.textBaseline = "alphabetic";
      ctx.textAlign="center";
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--primary-text-color');

      // get text metrics *once* so that spacing around the dial is consistant
      const textMetrics = ctx.measureText("Springville");
      const textAscent = textMetrics.actualBoundingBoxAscent;
      const textDescent = textMetrics.actualBoundingBoxDescent;
      const textHeight = Math.round(textAscent + textDescent);
  
      // constants for minor adjustments
      const textKerning = 0; // could adjust spacing betweek letter using this
      const textPadding = 12; // space between text and edge of dial
      const iconTextGap = 10; // space between icon and text

      for(num= 0; num < locationInfo.length; num++){
          ctx.save(); // isolate transforms for this location

          ang = num * Math.PI / locationInfo.length * 2;
          // rotate to center of drawing position
          ctx.rotate(ang);

          // TODO: split long locations (on a space or hyphen) into two lines
          // TODO: possibly adjust the font (like on the hands) if necessary

          var startAngle = 0; 
          var inwardFacing = true;
          var text = locationInfo[num].name.split("").reverse().join("");
          // if we're in the bottom half of the clock then reverse the facing of the text so that it's not upside down
          if (ang > Math.PI / 2 && ang < ((Math.PI * 2) - (Math.PI / 2)))
          {
            startAngle = Math.PI;
            inwardFacing = false;
            text = locationInfo[num].name;
          }
          text = isRtlLanguage(text) ? text.split("").reverse().join("") : text;

          // rotate 50% of total angle for center alignment
          for (var j = 0; j < text.length; j++) {
              var charWid = ctx.measureText(text[j]).width;
              startAngle += ((charWid + (j == text.length-1 ? 0 : textKerning)) / (radius - textHeight)) / 2 ;
          }

          // Phew... now rotate into final start position
          ctx.rotate(startAngle);

          // set up icon for this location
          // TODO: The angle of the icon when it is drawn is not perfect because it is drawn from its top-left corner.
          // TODO: The angle of ctx needs to be shifted to the position of the middle of the icon,
          // TODO: and then the x where icon is drawn needs to go back to the left.
          this.iconCtx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--primary-text-color');
          const iconExistsForLocation = (this.formatLocationIcon(locationInfo[num], true));
          const iconWidth = roundToEven(this.iconCanvas.width * this.scaleRatio);
          const iconHeight = roundToEven(this.iconCanvas.height * this.scaleRatio);
          const iconBottomPaddingEstimate = iconHeight * 0.13; // defined space under icon
          const iconWidthRadians = (iconWidth + iconTextGap) / (radius - iconHeight) * -1;

          const topBaseline = radius - Math.max(textHeight, iconHeight) - textPadding;
          const bottomBaseline = radius - textPadding - textDescent;
          this.centeredIconBaseline = radius - textPadding - textHeight - iconTextGap - iconHeight;

          if (debugLogging) {
              ctx.beginPath();
              ctx.arc(0, 0, topBaseline, 0, 2*Math.PI);
              ctx.strokeStyle = "#00ff88";
              ctx.stroke();

              ctx.beginPath();
              ctx.arc(0, 0, bottomBaseline, 0, 2*Math.PI);
              ctx.strokeStyle = "#00ff00";
              ctx.stroke();

              ctx.beginPath();
              ctx.arc(0, 0, this.centeredIconBaseline, 0, 2*Math.PI);
              ctx.strokeStyle = "#ccff00";
              ctx.stroke();
          }

          // Position the icon when it is drawn before the text is drawn.
          //    (inwardFacing = the top of the clock dial)
          if (iconExistsForLocation
              && (this.locationIcon != "center") 
              && (this.locationIcon != "none")) {
            if ((this.locationIcon == "before" && ! inwardFacing)  /* bottom of dial */
                || (this.locationIcon == "after" && inwardFacing)) /* top of dial */ {
              ctx.drawImage(this.iconCanvas, -Math.round(this.iconCanvas.width / 2), (inwardFacing ? -(topBaseline + iconHeight - iconBottomPaddingEstimate) : (bottomBaseline - iconHeight + iconBottomPaddingEstimate)), iconWidth, iconHeight);        
              ctx.rotate(iconWidthRadians * 1.0 / 2);
            } else {
              ctx.rotate(iconWidthRadians * -1.0 / 2);
            }
          }

          // Now for the fun bit: draw, rotate, and repeat
          for (var j = 0; j < text.length; j++) {

              var charWid = ctx.measureText(text[j]).width;
              // rotate half letter
              ctx.rotate((charWid/2) / (radius - textHeight) * -1); 
              ctx.fillText(text[j], 0, (inwardFacing ? -topBaseline : bottomBaseline));
              ctx.rotate((charWid/2 + textKerning) / (radius - textHeight) * -1); // rotate half letter
          }

          // Position the icon when it is drawn after the text is drawn
          if (iconExistsForLocation
              && (this.locationIcon != "center") 
              && (this.locationIcon != "none"))
            {
            if ((this.locationIcon == "before" && inwardFacing)     /* top of dial */
                || (this.locationIcon == "after" && !inwardFacing)) /* bottom of dial */ {
              ctx.rotate(iconWidthRadians * 1.2 / 2);
              ctx.drawImage(this.iconCanvas, -Math.round(this.iconCanvas.width / 2), (inwardFacing ? -(topBaseline + iconHeight - iconBottomPaddingEstimate) : (bottomBaseline - iconHeight + iconBottomPaddingEstimate)), iconWidth, iconHeight);        
            } else {
              ctx.rotate(iconWidthRadians * -1.2 / 2);
            }
        }

          // rotate back round from the end position to the central position of the text
          ctx.rotate(startAngle);

          // Position the icon when it is drawn in the center
          if (this.locationIcon == "center") {
              if (this.formatLocationIcon(locationInfo[num], inwardFacing)) {
              const iconWidth = roundToEven(this.iconCanvas.width * this.scaleRatio);
              const iconHeight = roundToEven(this.iconCanvas.height * this.scaleRatio);
              ctx.drawImage(this.iconCanvas, -Math.round(iconWidth / 2), (inwardFacing ? -(this.centeredIconBaseline + iconHeight - iconBottomPaddingEstimate) : -(this.centeredIconBaseline + iconHeight - iconBottomPaddingEstimate)), iconWidth, iconHeight);        
            };
          }

          // position for the next location
          ctx.restore();
        }  
    }

// ----------------------------------------------------------------------------
  drawTime(ctx, radius, locationInfo, wizards) {
// ----------------------------------------------------------------------------
    if (debuggerStop) debugger;

    this.targetstate = [];
    const spreadBetweenWizards = 0.28;   // how much of the clock face to spread wizards out

    for (let num = 0; num < wizards.length; num++) {

      const state = this._hass.states[wizards[num].entity];
    //  const stateStr = this.getWizardState(wizards[num].entity);
      const stateStr = wizards[num].stateStr;

      let location = null;          // explicit default
      let wizardOffset = 0;         // explicit default

      // Find matching location
      for (let locnum = 0; locnum < locationInfo.length; locnum++) {

        if (locationInfo[locnum].name.toLowerCase() === stateStr.toLowerCase()) {
          
          // Compute offset for this wizard within the group
          wizardOffset = wizards[num].offset * spreadBetweenWizards;

          // If even number of wizards, center the group
          if (locationInfo[locnum].wizardCount % 2 === 0) {
            wizardOffset += 0.5 * spreadBetweenWizards;
          }

          location = locnum + wizardOffset;
          break;
        }
      }

      // If no matching location was found, default to 0 (12 o'clock)
      if (location === null) {
        location = 0;
      }

      // Convert to radians
      const angle = location * Math.PI * 2 / locationInfo.length;

      // Hand length
      let handLength = this.radius * 0.83;
      if (this.locationIcon === "center") {
        handLength = this.radius * 0.65;
      }

      // Build target state
      this.targetstate.push({
        pos: angle,
        length: Math.round(handLength),
        width: Math.round(radius * 0.1),
        wizard: wizards[num].name,
        color: wizards[num].color,
        textcolor: wizards[num].textcolor
      });
    }

    // Ensure currentstate exists
    if (!this.currentstate) {
      this.currentstate = [];
    }

    // Smooth movement toward targetstate
    for (let num = 0; num < wizards.length; num++) {

      // Ensure currentstate has the same length as targetstate
      if (!this.currentstate[num]) {
        this.currentstate[num] = {
          pos: 0,
          length: this.targetstate[num].length,
          width: this.targetstate[num].width,
          wizard: this.targetstate[num].wizard,
          color: this.targetstate[num].color,
          textcolor: this.targetstate[num].textcolor
        };
      }

      // Always update length/width in case config changed
      this.currentstate[num].length = this.targetstate[num].length;
      this.currentstate[num].width  = this.targetstate[num].width;

      // Smooth movement
      this.currentstate[num].pos +=
        (this.targetstate[num].pos - this.currentstate[num].pos) / 60;
      
    }

    // Draw hands
    for (let num = 0; num < wizards.length; num++) {
      this.drawHand(
        ctx,
        this.currentstate[num].pos,
        this.currentstate[num].length,
        this.currentstate[num].width,
        this.currentstate[num].wizard,
        this.currentstate[num].color,
        this.currentstate[num].textcolor
      );
    }
  }

// ----------------------------------------------------------------------------
drawHand(ctx, pos, length, width, wizard, color, textcolor) {
// ----------------------------------------------------------------------------
  if (debuggerStop) debugger;
  if (debugLogging) {
    console.log(`drawHand → length=${length}, width=${width}, pos=${pos}`);
  }

  ctx.save();     // save A

  // =====================================================
  // SAFETY GUARD: Validate geometry before drawing
  // =====================================================
  if (!isFinite(pos) || !isFinite(length) || !isFinite(width) || width <= 0) {
    console.warn("Skipping hand due to invalid geometry:", {
      pos, length, width, wizard
    });
    ctx.restore();   // restore A
    return;
  }

  // =====================================================
  // A. ENTER HAND SPACE
  // Everything that should rotate with the hand goes after this
  // =====================================================
  ctx.rotate(pos);

  // =====================================================
  // B. RESOLVE COLORS (HAND + TEXT)
  // =====================================================
  
  // Base colors
  const bladePrimaryHex = resolveHexColor(
    color,
    '--primary-color',
    this.colorElement
  );

  const nameTextHex = resolveHexColor(
    textcolor,
    '--primary-text-color',
    this.colorElement
  );

  // Variants
  const colors = {
    blade: {
      primary: bladePrimaryHex,
      highlight: lightenColor(bladePrimaryHex, 20),
    },
    nameText: {
      base: nameTextHex,
      primary: darkenColor(nameTextHex, 10),
      highlight: lightenColor(nameTextHex, 50),
    }
  };

  // =====================================================
  // C. CREATE HAND-SPACE GRADIENTS
  // These must be created AFTER rotate(pos) and
  // BEFORE any text rotations
  // =====================================================

  // Blade gradient (across blade width)
  const bladeGradient = ctx.createLinearGradient(
    -width, 0,
    width, 0
  );
  //console.log(`bladeGradient colors: ${colors.blade.primary}, ${colors.blade.highlight}`);
  bladeGradient.addColorStop(0, colors.blade.primary);
  bladeGradient.addColorStop(0.5, colors.blade.highlight);
  bladeGradient.addColorStop(1, colors.blade.primary);

  // Name gradient (fiddle for same alignment as blade gradient)
  const nameTextGradient = ctx.createLinearGradient(
    0, -width,
    0,  width
  );

  nameTextGradient.addColorStop(0,   colors.nameText.primary);
  nameTextGradient.addColorStop(0.2, colors.nameText.primary);
  nameTextGradient.addColorStop(0.4, colors.nameText.highlight);
  nameTextGradient.addColorStop(0.6, colors.nameText.primary);
  nameTextGradient.addColorStop(1,   colors.nameText.primary);

  // =====================================================
  // D. DRAW HAND BLADE GEOMETRY
  // =====================================================
  ctx.beginPath();
  ctx.lineWidth = width;

  ctx.shadowColor = "#0008";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetX = 5;
  ctx.shadowOffsetY = 5;

  ctx.fillStyle = bladeGradient;

  ctx.moveTo(width * 0.3, 0);
  ctx.quadraticCurveTo(width, -length * 0.5, width, -length * 0.75);
  ctx.quadraticCurveTo(width * 0.2, -length * 0.8, 0, -length);
  ctx.quadraticCurveTo(-width * 0.2, -length * 0.8, -width, -length * 0.75);
  ctx.quadraticCurveTo(-width, -length * 0.5, -width * 0.3, 0);
  ctx.fill();

  // =====================================================
  // E. DRAW WIZARD NAME (STILL IN HAND SPACE)
  // =====================================================
  ctx.save();     // save B

  // -----------------------------------------------------
  // E1. POSITION TEXT ALONG THE BLADE (ANCHOR POINT)
  // -----------------------------------------------------
  // Fixed anchor where text starts/ends
  const anchorAlongBlade = length * 0.75;
  ctx.translate(0, -anchorAlongBlade);

  // -----------------------------------------------------
  // E2. AUTO-RESIZE TEXT (MUST HAPPEN BEFORE METRICS)
  // -----------------------------------------------------
  const hubClearance = width * 1.5;
  const maxTextLength = anchorAlongBlade - hubClearance;

  const baseFontSize = width * 1.4 * this.fontScale;
  let fontSize = baseFontSize;

  ctx.font = `${fontSize}px ${this.selectedFont}`;

  let textWidth = ctx.measureText(wizard).width;
  if (textWidth > maxTextLength) {
    const scale = maxTextLength / textWidth;
    fontSize = Math.max(baseFontSize * 0.55, fontSize * scale);
    ctx.font = `${fontSize}px ${this.selectedFont}`;
  }

  ctx.textBaseline = "middle";

  // -----------------------------------------------------
  // E3. ROTATE TEXT FOR READABILITY (TEXT SPACE)
  // -----------------------------------------------------
  const flip = (pos >= 0 && pos < Math.PI);
  ctx.rotate(Math.PI / 2);
  if (flip) ctx.rotate(Math.PI);

  // Anchor start or end so text grows inward
  ctx.textAlign = flip ? "right" : "left";

  // -----------------------------------------------------
  // E4. ✅ CROSS-BLADE GLYPH BIAS (TEXT SPACE ONLY)
  // -----------------------------------------------------

  // Move glyphs across blade WITHOUT moving lighting
  const crossBladeBias = width * 0.15;

  if (debugLogging) {
    const metrics = ctx.measureText(wizard);
    console.log("width=" + width + "; crossBladeBias=" + crossBladeBias)
    console.log("metrics.actualBoundingBoxAscent=" + metrics.actualBoundingBoxAscent + "; metrics.actualBoundingBoxDescent=" + metrics.actualBoundingBoxDescent)
  }
  ctx.translate(0, crossBladeBias);

    // -----------------------------------------------------
    // E5. DRAW TEXT USING HAND-SPACE GRADIENT
    // -----------------------------------------------------
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;

    /* Simulate bold text */
    ctx.lineWidth = 0.8; // try 0.8–1.5
    ctx.strokeStyle = nameTextGradient; // colors.nameText.primary;
    ctx.strokeText(wizard, 0, 0);

    ctx.fillStyle = nameTextGradient;
    ctx.fillText(wizard, 0, 0);

    ctx.restore(); // restore B - end text
    ctx.restore(); // restore A - end hand
  }

// ----------------------------------------------------------------------------
  drawSpindle(ctx, radius, color) {
// ----------------------------------------------------------------------------
    if (debuggerStop) debugger;
    if (debugLogging) console.log(`${this.config.header ? "(" + this.config.header + ") " : ""}drawSpindle start`);

    // =====================================================
    // SAFETY GUARD: Ensure geometry is valid before drawing
    // =====================================================
    if (!isFinite(radius) || radius <= 0 ) {
        console.warn("Skipping drawSpindle due to invalid geometry:", {
        radius: radius,
      });
      return;
    }

    const spindleRadius = radius*0.05;
    //const spindleGlobalAlpha = 0.55;   // 55% opacity
    const spindleGlobalAlpha = 0.95;     // 95% opacity

    // Get the spindle image if configured
    if (this.spindleImage) {

        // Start loading only once
        if (!this.spCircular && !this.spImage) {

            const img = new Image();
            this.spImage = img;   // mark load in progress

            img.onload = () => {
                if (debuggerStop) debugger;
                console.log("Spindle image loaded: ", this.spindleImage);

                const imgW = img.width;
                const imgH = img.height;
                const r = Math.min(imgW, imgH) / 2;

                const offCanvas = document.createElement('canvas');
                offCanvas.width = imgW;
                offCanvas.height = imgH;

                const offCtx = offCanvas.getContext('2d');

                // Clip to centered circle
                offCtx.beginPath();
                offCtx.arc(imgW / 2, imgH / 2, r, 0, 2 * Math.PI);
                offCtx.clip();

                offCtx.drawImage(img, 0, 0, imgW, imgH);

                this.spCircular = offCanvas;

                // free memory — safe because we never need the raw image again
                this.spImage = null;

                this.lastframe = requestAnimationFrame(() => this.drawClock());

                this.drawClock();
            };

            img.onerror = () => {
                  if (debuggerStop) debugger;
                console.warn("Spindle image failed to load: ", this.spindleImage);

                // mark failure so we don't retry endlessly
                this.spImage = "Failed";

                // redraw WITHOUT spindle
                //this.lastframe = requestAnimationFrame(() => this.drawClock());
            };

            console.log("Loading spindle image: ", this.spindleImage)
            img.src = this.spindleImage;
        }

    }

    // Draw the spindle image if loaded
    if (this.spCircular) {
        ctx.save();
        // Apply the face color because the hands would otherwise show through
        ctx.beginPath();
        ctx.arc(0, 0, spindleRadius, 0, 2*Math.PI);
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--secondary-background-color');
        ctx.shadowColor = "#0008";
        ctx.shadowBlur = 6;
        ctx.shadowOffsetX = 4;
        ctx.shadowOffsetY = 4;
        ctx.fill();

        // Now the image on top layer
        ctx.globalAlpha = spindleGlobalAlpha;
        ctx.drawImage(
            this.spCircular,
            -spindleRadius,
            -spindleRadius,
            spindleRadius * 2,
            spindleRadius * 2
        );
        ctx.restore();
    } else {

      // Without an image, just color the spindle
      const x = 0;
      const y = 0;
      ctx.beginPath();
      ctx.arc(0, 0, spindleRadius, 0, 2*Math.PI);

      const highlightColor =  lightenColor(getHexColor(color, this.colorElement), 25);

      // Create a radial gradient
      const radialGradient = ctx.createRadialGradient(x, y, spindleRadius * 0.05, x, y, spindleRadius * 2);
      // Add color stops
      radialGradient.addColorStop(0, highlightColor); // Inner color
      radialGradient.addColorStop(1, color); // Outer colorgradient.addColorStop(1, 'darkblue'); // Shadow color at the bottom
      // Apply the gradient to the shape
      ctx.fillStyle = radialGradient;

      ctx.shadowColor = "#0008";
      ctx.shadowBlur = 10;
      ctx.shadowOffsetX = 5;
      ctx.shadowOffsetY = 5;
      ctx.fill();
    }

    if (this.faceUnderGlass) {
      drawGlassOverlay(ctx, radius);
    }
  }

// ----------------------------------------------------------------------------
// Format the icon image for the location ("number") 
// ----------------------------------------------------------------------------
  formatLocationIcon(locationInfo, inwardFacing) {  
// ----------------------------------------------------------------------------
    // if (debuggerStop) debugger;

    const currentText = locationInfo.name;
    if (currentText != ' ') {             
      var iconSpecification = '';
      const zoneInfo = this.getZoneInfo(currentText);
      if (zoneInfo) {
        iconSpecification = zoneInfo.icon;
      }
      if (debugLogging) console.log('currentText: ' + currentText + ', icon: ' + iconSpecification);
      if (currentText == 'Home') {
        iconSpecification = "mdi:home";
      } 
      const iconPath = this.getIconPath(iconSpecification);
      if (iconPath) {
          if (debugLogging) console.log(`iconSpecification: ${iconSpecification}, iconPath: ${iconPath}`);
  
          this.iconCtx.clearRect(0, 0, this.iconCanvas.width, this.iconCanvas.height);
          this.iconCtx.save();

          // MDI icons use a 512x512 coordinate space
          const originalBoxSize = 512;
          const pathNudge = 64;
          
          // Use consistent scale
          const scale = Math.min(this.iconCanvas.width, this.iconCanvas.height) / originalBoxSize;

          // Translate to canvas center
          this.iconCtx.translate(this.iconCanvas.width / 2, this.iconCanvas.height / 2);

          // Apply mirroring
          this.iconCtx.scale(inwardFacing ? scale : -scale, inwardFacing ? -scale : scale);

          // Translate to center the icon in its own space
          this.iconCtx.translate(-256, -256 + pathNudge); // Half of 512, shifted up

          // Debug bounding box
          if (debugLogging) {
            this.iconCtx.save();
            this.iconCtx.translate(0, -pathNudge);
            this.iconCtx.fillStyle = '#ffeeee';
            this.iconCtx.fillRect(0, 0, 512, 512);
            this.iconCtx.restore();
          }

          // Draw icon
          this.iconCtx.fill(new Path2D(iconPath));
          this.iconCtx.restore();

          return true;
        };
      }
      return false;
  }


// ----------------------------------------------------------------------------
// Maintain a table with one entry per icon that has been referenced:
// Load the icon svg paths and provide a cache to make the icon images later.
// ----------------------------------------------------------------------------
getIconPath(iconSpecification) {  /* (like mdi:home) */
// ----------------------------------------------------------------------------
  // if (debuggerStop) debugger;
  if (debugLogging) {
    console.log(`${this.config.header ? "(" + this.config.header + ") " : ""}getIconPath ${iconSpecification}`);
  }

  if (!iconSpecification) return null;

  const iconEntry = this.iconPaths.find(icon => icon.specification === iconSpecification);
  if (iconEntry && iconEntry.pathData) {
    return iconEntry.pathData; // return raw SVG path string
  }

  // If not cached, initiate async fetch and cache for future use
  if (!iconEntry) {

    this.iconPaths.push({
      specification: iconSpecification,
      pathData: null,
      loading: false
    }); // FIX: add loading guard
    this.fetchAndCacheIconPath(iconSpecification);
  }

  return null; // not ready yet
}

// ----------------------------------------------------------------------------
async fetchAndCacheIconPath(iconSpecification) {
// ----------------------------------------------------------------------------
  // if (debuggerStop) debugger;

  const iconName = iconSpecification.replace(/^mdi:/, ''); // strip prefix

  const iconEntry = this.iconPaths.find(
    icon => icon.specification === iconSpecification
  );
  if (!iconEntry) return;
  // Stop duplicate concurrent fetches
  if (iconEntry.loading) return;
  iconEntry.loading = true;
  try {
    const response = await fetch(`https://api.mdisvg.com/v1/i/${iconName}`);
    const svgText = await response.text();

    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgText, "image/svg+xml");
    const pathElement = svgDoc.querySelector("path");

    if (pathElement) {
      const pathData = pathElement.getAttribute("d");

      const iconEntry = this.iconPaths.find(icon => icon.specification === iconSpecification);
      if (iconEntry) {
        iconEntry.pathData = pathData;
        if (debugLogging) {
          console.log(`Fetched and cached pathData for ${iconSpecification}: ${pathData}`);
        }

        // Force redraw after async icon load
        requestAnimationFrame(() => this.drawClock());
      }
    } else {
      console.warn(`No <path> found for ${iconSpecification}`);
    }
  } catch (err) {
    console.error(`Failed to fetch icon ${iconSpecification}:`, err);

  } finally {
    iconEntry.loading = false;
  }
} 

// ----------------------------------------------------------------------------
// Maintain a table with one entry per location.
// ----------------------------------------------------------------------------
getLocationInfo(locationName) {
// ----------------------------------------------------------------------------
  // if (debuggerStop) debugger;

  if (debugLogging) console.log(`${this.config.header ? "(" + this.config.header + ") " : ""}getLocationInfo ${locationName}`);

  var locationInfoEntry = this.locationInfo.find(location => location.name === locationName);
  if (!locationInfoEntry) {
    // try for the first empty slot
    locationInfoEntry = this.locationInfo.find(location => location.name === " ");  }
  if (!locationInfoEntry) {
    // try for the oldest unused slot
    var oldestTimestamp = Infinity;
    var oldestIndex = -1;
    for (let i = this.locationInfo.length - 1; i >= 0; i--) {
      if (this.locationInfo[i].keep === false) {
        if (this.locationInfo[i].lastUsed < oldestTimestamp) {
          oldestTimestamp = this.locationInfo[i].lastUsed;
          oldestIndex = i;
        }
      }
    }
    if (oldestIndex !== -1) {
      locationInfoEntry = this.locationInfo[oldestIndex];  }
  }
  if (!locationInfoEntry) {
    // if we still don't have an entry, add a new one
    locationInfoEntry = this.addLocationInfo(locationName);
  }
  locationInfoEntry.name = locationName; // update name in case it was an empty slot or previously used for a different location
  return locationInfoEntry;
}

// ----------------------------------------------------------------------------
addLocationInfo(locationName) {
// ----------------------------------------------------------------------------
  // if (debuggerStop) debugger;

  const locnum = this.locationInfo.length
  const locationInfoEntry = {
      name: locationName,
      locnum: locnum,   // position of this location on the clock dial
      keep: false,    // this flag is used to indicate whether this location is still relevant and should be kept in the list
      lastUsed: 0,    // timestamp of the last time this location was used by a wizard (for reusing old locations)
      wizardCount: 0, // current number of wizards at this location
      wizardPosition: 0 // position of the next wizard to be drawn at this location
  }
  // add to the end of the list
  this.locationInfo.push(locationInfoEntry);
  return locationInfoEntry;
}

// ----------------------------------------------------------------------------
// Maintain a table with one entry per HA zone (plus some from the config).
// ----------------------------------------------------------------------------
getZoneInfo(zoneName) {
// ----------------------------------------------------------------------------
  // if (debuggerStop) debugger;
  if (debugLogging) console.log(`${this.config.header ? "(" + this.config.header + ") " : ""}getZoneInfo ${zoneName}`);

  var zoneTableEntry = this.zoneInfo.find(zone => zone.name === zoneName);
  if (!zoneTableEntry) {
    zoneTableEntry = this.zoneInfo.find(zone => zone.friendly_name === zoneName);
  }

  if (zoneTableEntry) {
    return zoneTableEntry;
  } else {
    const zoneEntityId = resolveZoneEntityId(this._hass, zoneName);
    if (zoneEntityId) {
        const attrs = this._hass.states[zoneEntityId].attributes;
        zoneTableEntry = {
            name: zoneEntityId.replace("zone.", ""),
            icon: attrs.icon || "",
            friendly_name: attrs.friendly_name || zoneName,
        };
        this.zoneInfo.push(zoneTableEntry);
        this.getIconPath(zoneTableEntry.icon);
        return zoneTableEntry;
    }
  }

  return null;
}

// ----------------------------------------------------------------------------
// Pre-load "zones" for locations that are not actually a zone with an icon.
// ----------------------------------------------------------------------------
addZoneInfo(zoneName, iconSpecification) {
// ----------------------------------------------------------------------------
  // if (debuggerStop) debugger;

  const zoneTableEntry = { 
    name: zoneName, 
    icon: iconSpecification,
    friendly_name: zoneName,
  };
  this.zoneInfo.push(zoneTableEntry);
  const iconPath = this.getIconPath(zoneTableEntry.icon); // preload icon path
  return zoneTableEntry;
}

} // <-- end of class

// ----------------------------------------------------------------------------
WizardClockCard.fontInjected = false;
// ----------------------------------------------------------------------------


// ----------------------------------------------------------------------------
function drawGlassOverlay(ctx, radius) {
// ----------------------------------------------------------------------------
  // if (debuggerStop) debugger;

  // --- 1. Glass reflection sheen ---
  ctx.save();
  const grad = ctx.createLinearGradient(-radius, -radius, radius, radius);
  grad.addColorStop(0.0, "rgba(255,255,255,0.15)");
  grad.addColorStop(0.3, "rgba(255,255,255,0.05)");
  grad.addColorStop(0.7, "rgba(255,255,255,0.00)");
  grad.addColorStop(1.0, "rgba(255,255,255,0.10)");

  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // --- 2. Curved‑glass edge vignette ---
  ctx.save();
  const edge = ctx.createRadialGradient(
    0, 0,
    radius * 0.6,
    0, 0,
    radius
  );
  edge.addColorStop(0.0, "rgba(0,0,0,0.00)");
  edge.addColorStop(1.0, "rgba(0,0,0,0.20)");

  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = edge;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // --- 3. Specular highlight (the glint) ---
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.strokeStyle = "white";
  ctx.lineWidth = radius * 0.03;

  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.92, -0.6, -0.2);
  ctx.stroke();
  ctx.restore();
}

// ----------------------------------------------------------------------------
function  isRtlLanguage(text) {
// ----------------------------------------------------------------------------
  // if (debuggerStop) debugger;

  const rtlChar = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
  return rtlChar.test(text);
}

// ----------------------------------------------------------------------------
function lightenColor(color, percent) {
// ----------------------------------------------------------------------------
  // if (debuggerStop) debugger;

  const num = parseInt(color.slice(1), 16);
  const amt = Math.round(2.55 * percent);

  let R = (num >> 16) + amt;
  let G = ((num >> 8) & 0x00FF) + amt;
  let B = (num & 0x0000FF) + amt;

  // ✅ Clamp values to 0–255
  R = Math.max(0, Math.min(255, R));
  G = Math.max(0, Math.min(255, G));
  B = Math.max(0, Math.min(255, B));

  return (
    "#" +
    ((1 << 24) | (R << 16) | (G << 8) | B)
      .toString(16)
      .slice(1)
  );
}

// ----------------------------------------------------------------------------
function darkenColor(color, percent) {
// ----------------------------------------------------------------------------
  // if (debuggerStop) debugger;

  return lightenColor(color, -percent);
}

// ----------------------------------------------------------------------------
function rgbToHex(rgb) {
// ----------------------------------------------------------------------------
  // if (debuggerStop) debugger;

  const rgbValues = rgb.match(/\d+/g); // Extract RGB values
  const hex = rgbValues.map((value) => {
      const hexValue = parseInt(value).toString(16); // Convert to hex
      return hexValue.length === 1 ? '0' + hexValue : hexValue; // Ensure two-digit format
  }).join('');
  return `#${hex}`;
}

// ----------------------------------------------------------------------------
function resolveHexColor(explicitColor, cssVarName, element) {
// ----------------------------------------------------------------------------
  // if (debuggerStop) debugger;

  // 1. Explicit color wins
  if (explicitColor && explicitColor.trim() !== "") {
    return getHexColor(explicitColor, element);
  }
  // 2. Try CSS variable
  const cssVarValue = getComputedStyle(document.documentElement)
    .getPropertyValue(cssVarName)
    .trim();
  if (cssVarValue) {
    return getHexColor(cssVarValue, element);
  }
  // 3. Try element's computed color
  const elementColor = element
    ? getComputedStyle(element).color
    : null;
  if (elementColor && elementColor.trim() !== "") {
    return getHexColor(elementColor, element);
  }
  // 4. Final fallback
  return "#000000"; // or whatever default you want
}

// ----------------------------------------------------------------------------
function getHexColor(colorName, element) {
// ----------------------------------------------------------------------------
  // if (debuggerStop) debugger;

  // Ensure element is in DOM
  if (!element.isConnected) {
    document.body.appendChild(element);
  }
  // Apply color
  element.style.color = colorName;
  // Force it to be invisible but measurable
  element.style.visibility = "hidden";
  element.style.position = "absolute";
  element.style.left = "-9999px";

  const computed = getComputedStyle(element).color;

  //console.log(`getHexColor → colorName: ${colorName}, computed color: ${computed}`);

  return computed.startsWith("rgb") ? rgbToHex(computed) : computed;
}

// ----------------------------------------------------------------------------
function roundToEven(num) {
// ----------------------------------------------------------------------------
  // if (debuggerStop) debugger;

  let rounded = Math.round(num);
  return (rounded % 2 === 0) ? rounded : rounded + 1;
}

/* debounce the reaction to a card resize */

// ----------------------------------------------------------------------------
function debouncedOnResize(thisObject) {
// ----------------------------------------------------------------------------
  if (debuggerStop) debugger;

  if (!Array.isArray(thisObject.locationInfo)) return;
  if (debugLogging) console.log(`${thisObject.config && thisObject.config.header ? "(" + thisObject.config.header + ") " : ""}debouncedOnResize triggering set hass`);
  /* trigger an update */
  thisObject.resizeClock();
  thisObject.drawClock();
}

// ----------------------------------------------------------------------------
function createResizeObserver(thisObject) {
// ----------------------------------------------------------------------------
  // if (debuggerStop) debugger;

  return new ResizeObserver(() => {
    clearTimeout(thisObject.resizeTimeout);

    thisObject.resizeTimeout = setTimeout(
      () => debouncedOnResize(thisObject),
      thisObject.resizeDelay
    );
  });
}

// ----------------------------------------------------------------------------
// Return the equivalent of Home Assistant's slugify utility. (No search required.)
// ----------------------------------------------------------------------------
function slugifyHA(name) {
// ----------------------------------------------------------------------------
  // if (debuggerStop) debugger;

  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}
// ----------------------------------------------------------------------------
// Return the entity_id of a zone matching the given friendly name (case-insensitive).
// ----------------------------------------------------------------------------
function resolveZoneEntityId(hass, friendlyName) {
// ----------------------------------------------------------------------------
  // if (debuggerStop) debugger;

  if (!hass || !hass.states) return null;

  // Normalize comparison
  const target = friendlyName.trim().toLowerCase();

  // Scan all zone entities
  for (const [entityId, stateObj] of Object.entries(hass.states)) {
    if (!entityId.startsWith("zone.")) continue;

    const attrs = stateObj.attributes || {};

    // Match against friendly_name
    if (attrs.friendly_name && attrs.friendly_name.toLowerCase() === target) {
      return entityId;  // exact friendly name match
    }

    // Match against entity_id suffix (e.g., "home")
    const suffix = entityId.slice("zone.".length);
    if (suffix.toLowerCase() === target) {
      return entityId;
    }
  }

  return null; // no match
}
// ----------------------------------------------------------------------------
// Return the zigzag offset 0, 1, -1, 2, -2, 3, -3, 4, -4 ... for a given index, n>=0.
// ----------------------------------------------------------------------------
function zigZagOffset(n) {
// ----------------------------------------------------------------------------
  //if (debuggerStop) debugger;

  const k = Math.floor((n + 1) / 2);   // magnitude
  return (n % 2 === 0) ? k : -k;        // even index → +k, odd index → -k
}
// Faster?
//function zigZag(n) {
//  const k = (n + 1) >> 1;        // fast floor((n+1)/2)
//  return (n & 1) ? -k : k;       // odd → negative
//}

// ----------------------------------------------------------------------------
// Compare arrays of objects (deep comparison) - order matters
// ----------------------------------------------------------------------------
function deepEqual(a, b) {
// ----------------------------------------------------------------------------
  // if (debuggerStop) debugger;

  if (a === b) return true;

  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b)
    return false;

  if (Array.isArray(a) !== Array.isArray(b))
    return false;

  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) return false;

  return keysA.every(key =>
    keysB.includes(key) && deepEqual(a[key], b[key])
  );
}

// ----------------------------------------------------------------------------
customElements.define(CARDNAME, WizardClockCard);
// ----------------------------------------------------------------------------
