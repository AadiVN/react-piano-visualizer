// Canvas-based visualization for better performance
export class CanvasVisualizer {
  constructor(canvas, keys) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.keys = keys;
    this.visualNotes = [];
    this.animationId = null;
    this.lastTime = 0;

    // Setup canvas
    this.setupCanvas();
    this.startAnimation();
  }

  setupCanvas() {
    const updateCanvasSize = () => {
      const rect = this.canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      this.canvas.width = rect.width * dpr;
      this.canvas.height = rect.height * dpr;

      this.ctx.scale(dpr, dpr);
      this.canvas.style.width = rect.width + "px";
      this.canvas.style.height = rect.height + "px";
    };

    updateCanvasSize();
    window.addEventListener("resize", updateCanvasSize);
  }

  addNote(keyData) {
    const noteId = Date.now() + Math.random();
    const whiteKeys = this.keys.filter((k) => !k.isBlack);
    const whiteKeyIndex = whiteKeys.findIndex((k) => k.id === keyData.id);
    const whiteKeyWidth = 100 / whiteKeys.length;

    let leftPosition, noteWidth;

    if (keyData.isBlack) {
      const whiteKeysBefore = this.keys
        .slice(0, keyData.id)
        .filter((k) => !k.isBlack).length;
      leftPosition = (whiteKeysBefore - 0.3) * whiteKeyWidth;
      noteWidth = whiteKeyWidth * 0.6;
    } else {
      leftPosition = whiteKeyIndex * whiteKeyWidth;
      noteWidth = whiteKeyWidth;
    }

    const visualNote = {
      id: noteId,
      keyId: keyData.id,
      note: keyData.note,
      isBlack: keyData.isBlack,
      leftPosition,
      noteWidth,
      startTime: Date.now(),
      duration: null,
      color: keyData.isBlack ? "#8b5cf6" : "#3b82f6",
    };

    this.visualNotes.push(visualNote);
    return noteId;
  }
  endNote(noteId, duration) {
    const note = this.visualNotes.find((n) => n.id === noteId);
    if (note && !note.duration) {
      // Calculate duration if not provided
      const calculatedDuration = duration || Date.now() - note.startTime;
      note.duration = calculatedDuration;
      note.endTime = Date.now();
    }
  }

  startAnimation() {
    const animate = (currentTime) => {
      if (currentTime - this.lastTime >= 16) {
        // ~60fps
        this.render(currentTime);
        this.cleanup(currentTime);
        this.lastTime = currentTime;
      }
      this.animationId = requestAnimationFrame(animate);
    };
    this.animationId = requestAnimationFrame(animate);
  }

  render(currentTime) {
    const rect = this.canvas.getBoundingClientRect();
    this.ctx.clearRect(0, 0, rect.width, rect.height);

    this.visualNotes.forEach((note) => {
      const elapsed = currentTime - note.startTime;
      const noteDuration = note.duration || elapsed;

      // Calculate note dimensions and position
      const baseHeight = 20;
      const durationScale = noteDuration / 10;
      const noteHeight = Math.min(
        Math.max(baseHeight + durationScale, 20),
        280
      );

      let noteTop,
        opacity = 0.9;
      const keyLevel = 75; // Percentage from top

      if (note.duration) {
        // Released note - slide up
        const elapsedSinceRelease = elapsed - note.duration;
        const slideProgress = Math.min(elapsedSinceRelease / 3000, 1);
        const finalHeight = Math.min(
          Math.max(baseHeight + note.duration / 10, 20),
          280
        );

        if (!note.releasePosition) {
          note.releasePosition = keyLevel - (finalHeight / rect.height) * 100;
        }

        const slideDistance = 90;
        const currentSlideOffset = slideDistance * slideProgress;
        noteTop = note.releasePosition - currentSlideOffset;

        if (slideProgress > 0.75) {
          opacity = (1 - slideProgress) * 4;
        }
      } else {
        // Active note - growing
        noteTop = keyLevel - (noteHeight / rect.height) * 100;
      }

      // Convert percentages to pixels for canvas
      const x = (note.leftPosition / 100) * rect.width;
      const y = (noteTop / 100) * rect.height;
      const width = (note.noteWidth / 100) * rect.width;

      // Draw note
      this.ctx.save();
      this.ctx.globalAlpha = Math.max(opacity, 0);
      this.ctx.fillStyle = note.color;
      this.ctx.shadowColor = note.color;
      this.ctx.shadowBlur = 10;
      this.ctx.fillRect(x, y, width, noteHeight);

      // Draw note label
      this.ctx.shadowBlur = 0;
      this.ctx.fillStyle = "white";
      this.ctx.font = `${note.isBlack ? 8 : 10}px monospace`;
      this.ctx.textAlign = "center";
      this.ctx.fillText(note.note.replace(/[0-9]/g, ""), x + width / 2, y + 15);

      // Draw duration if released
      if (note.duration) {
        this.ctx.font = "8px monospace";
        this.ctx.fillText(
          `${Math.round(note.duration)}ms`,
          x + width / 2,
          y + noteHeight - 5
        );
      }

      this.ctx.restore();
    });
  }

  cleanup(currentTime) {
    this.visualNotes = this.visualNotes.filter((note) => {
      if (note.duration) {
        const elapsed = currentTime - note.startTime;
        return elapsed <= 3500; // Remove after animation completes
      }
      return true;
    });
  }

  clear() {
    this.visualNotes = [];
  }

  destroy() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
  }
}
