let sharedAudioContext;
const decodedBuffers = new Map();

async function getAudioContext() {
  if (!sharedAudioContext) {
    const Ctx = self.AudioContext || self.webkitAudioContext;
    if (!Ctx) throw new Error("AudioContext not supported.");
    sharedAudioContext = new Ctx();
  }
  if (sharedAudioContext.state === "suspended") {
    await sharedAudioContext.resume();
  }
  return sharedAudioContext;
}

async function playAudio(url) {
  const ctx = await getAudioContext();
  let buffer = decodedBuffers.get(url);
  if (!buffer) {
    const res = await fetch(url);
    const arr = await res.arrayBuffer();
    buffer = await ctx.decodeAudioData(arr);
    decodedBuffers.set(url, buffer);
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start();
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "OFFSCREEN_PLAY_SOUND") {
    const url = msg.url || chrome.runtime.getURL("assets/done.wav");
    playAudio(url)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => {
        console.warn("[offscreen] Playback failed:", err);
        sendResponse({ ok: false, error: String(err) });
      });
    return true;
  }
});
