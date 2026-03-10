// Emergency sprite visibility fix
window.forceSpriteVisible = function () {
  console.log("[SPRITE TEST] Starting...");

  const sprite = document.getElementById("sprite");
  const viewport = document.getElementById("sprite-viewport");
  const frame = document.querySelector("#sprite .otacon-frame");
  const overlay = document.getElementById("boot-black-overlay");

  console.log("[SPRITE TEST] sprite exists:", !!sprite);
  console.log("[SPRITE TEST] viewport exists:", !!viewport);
  console.log("[SPRITE TEST] frame exists:", !!frame);

  if (overlay) {
    overlay.style.opacity = "0.3";
    console.log("[SPRITE TEST] overlay faded");
  }

  if (viewport) {
    viewport.style.cssText =
      "width:200px!important;height:300px!important;border:5px solid red!important;opacity:1!important;visibility:visible!important;display:block!important;position:fixed!important;top:50%!important;left:50%!important;transform:translate(-50%,-50%)!important;z-index:99999!important;background:#00ff00!important";
    console.log("[SPRITE TEST] viewport highlighted");
  }

  if (frame) {
    frame.style.cssText =
      "width:100%!important;height:100%!important;border:3px solid blue!important;background-size:contain!important;background-position:center!important;background-repeat:no-repeat!important;opacity:1!important;visibility:visible!important;display:block!important";
    const currentBg = frame.style.backgroundImage;
    console.log("[SPRITE TEST] frame bg:", currentBg);
    // Try to reload image
    if (!currentBg || currentBg === "none") {
      frame.style.backgroundImage =
        "url('assets/sprites/otacon_sprite_boot_00.png')";
      console.log("[SPRITE TEST] forced fallback image");
    }
  } else {
    console.log("[SPRITE TEST] NO FRAME FOUND!");
  }

  return { sprite: !!sprite, viewport: !!viewport, frame: !!frame };
};

// Run immediately and after delay
console.log("[SPRITE TEST] Script loaded");
setTimeout(() => {
  console.log("[SPRITE TEST] Running...");
  const result = window.forceSpriteVisible();
  console.log("[SPRITE TEST] Result:", result);
}, 5000);
