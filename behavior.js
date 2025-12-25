// behavior.js - simple typing & mouse behavior profiler

(function () {
  const origin = location.origin;
  let lastKeyTime = null;
  let keyIntervals = [];
  let mouseMoves = 0;
  let lastMouseTime = null;

  function sendBehaviorLog(eventType, data) {
    chrome.runtime.sendMessage({
      type: "log",
      level: "info",
      message: `Behavior event: ${eventType}`,
      details: { origin, ...data }
    });
  }

  // Keyboard timing profiling
  document.addEventListener("keydown", () => {
    const now = performance.now();
    if (lastKeyTime !== null) {
      const diff = now - lastKeyTime;
      keyIntervals.push(diff);
      if (keyIntervals.length > 50) keyIntervals.shift();

      const avg =
        keyIntervals.reduce((a, b) => a + b, 0) / (keyIntervals.length || 1);

      if (avg < 40 || avg > 700) {
        sendBehaviorLog("typing-anomaly", {
          avgKeyIntervalMs: Math.round(avg),
          keyCount: keyIntervals.length
        });
      }
    }
    lastKeyTime = now;
  });

  // Mouse movement profiling
  document.addEventListener("mousemove", () => {
    const now = performance.now();
    mouseMoves++;

    if (!lastMouseTime) lastMouseTime = now;

    if (now - lastMouseTime > 5000) {
      if (mouseMoves > 500) {
        sendBehaviorLog("mouse-anomaly", {
          moves: mouseMoves,
          intervalMs: Math.round(now - lastMouseTime)
        });
      }
      mouseMoves = 0;
      lastMouseTime = now;
    }
  });
})();
