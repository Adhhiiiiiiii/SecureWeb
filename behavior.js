// behavior.js - lightweight typing/mouse behavior profiling (runs document_start)
// collects only aggregated stats and sends summaries (NO raw keystrokes)

(function() {
  const typingIntervals = [];
  let lastTs = null;

  document.addEventListener("keydown", (e) => {
    try {
      const now = performance.now();
      if (lastTs) typingIntervals.push(now - lastTs);
      lastTs = now;
      if (typingIntervals.length > 300) typingIntervals.shift();
      if (typingIntervals.length % 50 === 0) {
        const avg = typingIntervals.reduce((a,b)=>a+b,0)/typingIntervals.length;
        chrome.runtime.sendMessage({ type: "LOG", message: "TypingProfile", details: { avg }});
      }
    } catch(e) {}
  }, true);

  let mouseSamples = [];
  document.addEventListener("mousemove", e => {
    try {
      mouseSamples.push({ x:e.clientX, y:e.clientY, t: performance.now() });
      if (mouseSamples.length > 500) mouseSamples.shift();
      if (mouseSamples.length % 250 === 0) {
        // send simple stats
        chrome.runtime.sendMessage({ type: "LOG", message: "MouseProfile", details: { samples: mouseSamples.length }});
      }
    } catch(e) {}
  }, true);
})();
