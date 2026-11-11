# Changelog

## 1.2.0
- **New: Domain Expansion (Jujutsu Kaisen).** Cross your index and middle finger to open Gojo's Infinite Void behind you, with blue eyes and the 領域展開 / 無量空処 title.
- **New: ARISE (Solo Leveling).** Lift both hands to raise a shadow army behind you, with a System window and a shadow aura.
- **Invisibility fix:** walking back into frame while vanished no longer paints you into the room. The room is only learned after 1.2 s with nobody detected.
- **Saved empty room:** auto-captured when nobody is in frame for about 3 s and reused to fill the spot behind you with the real room. The popup has a **Forget** button.
- Snap less strict again, so it stops missing snaps. It is still face-safe, and sound alone never fires it.
- Infinity Stones glow more softly.

## 1.1.1
- **Snap is deliberate now.** Hold the snap pose for a quarter second (the stones light up), then snap. Hands on or near your face never count, a click sound alone never fires, and a hand that leaves the frame no longer counts as a snap.
- Gauntlet shows just the six stones, with no glowing hand outline.

## 1.1.0
- **Vanish is now fully invisible.** While you're dust, the whole frame is the remembered empty room (with live camera grain), so no outline or blur of you is left.
- Better fill for the part of the room that was always behind you: walls and gradients are continued across the gap.
- **Portals grow big.** A drawn circle pops open, then glides behind you and expands into a large window.
- **Portal destinations:** a procedurally painted Shanghai skyline at night (default), your own picture, or the Mirror Dimension.
- **Camera-on entrance reworked:** waits until the engine is warmed up, sends black until then, shows the sling ring sparking up, then opens. Replays when you turn your camera back on.
- Smoother output on slow machines: a late engine frame repeats the last effect frame instead of flashing the plain camera.

## 1.0.0
- First version: Thanos snap (gauntlet, flash, ash), Doctor Strange portal, Iron Man repulsor, Thor lightning, Stark hologram, portal entrance, popup settings and keyboard backups.
