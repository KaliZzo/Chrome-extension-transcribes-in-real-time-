console.log("Content script loaded and running");

let audioContext;
let audioSource;
let processor;
let audioChunks = [];
let transcriptionDiv;
let transcriptionBuffer = [];
const MAX_WORDS_DISPLAY = 6;

function createTranscriptionDiv() {
  console.log("Creating transcription div");
  if (transcriptionDiv) return;

  transcriptionDiv = document.createElement("div");
  transcriptionDiv.id = "extension-transcription";
  transcriptionDiv.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background-color: rgba(0, 0, 0, 0.7);
    color: white;
    padding: 10px;
    border-radius: 5px;
    font-size: 18px !important;
    z-index: 2147483647 !important;
    text-align: center;
    max-width: 90% !important;
    min-width: 200px;
    min-height: 50px;
    line-height: 1.5 !important;
    word-wrap: break-word !important;
    overflow: hidden;
  `;
  document.body.appendChild(transcriptionDiv);
  console.log("Transcription div created and appended to body");
}

function updateTranscription(text) {
  if (!transcriptionDiv) {
    createTranscriptionDiv();
  }

  // הסרת "Corrected transcription:" מתחילת הטקסט, אם קיים
  text = text.replace(/^Corrected transcription:\s*/i, "");

  // הסרת מירכאות כפולות מתחילת וסוף הטקסט, אם קיימות
  text = text.replace(/^"|"$/g, "").trim();

  // אם הטקסט ריק אחרי הסינון, לא נעדכן את הכתוביות
  if (text === "") {
    return;
  }

  // הוספת מילים חדשות לבאפר
  const newWords = text.split(/\s+/);
  transcriptionBuffer = [...transcriptionBuffer, ...newWords];

  // שמירה רק על המילים האחרונות לפי MAX_WORDS_DISPLAY
  if (transcriptionBuffer.length > MAX_WORDS_DISPLAY) {
    transcriptionBuffer = transcriptionBuffer.slice(-MAX_WORDS_DISPLAY);
  }

  // עדכון הטקסט המוצג
  transcriptionDiv.textContent = transcriptionBuffer.join(" ");

  console.log("Updated transcription:", transcriptionDiv.textContent);
}

function startAudioCapture() {
  console.log("Starting audio capture");
  createTranscriptionDiv();
  updateTranscription("ממתין לתמלול...");

  const videos = document.getElementsByTagName("video");
  const audios = document.getElementsByTagName("audio");

  if (videos.length > 0) {
    captureMediaElement(videos[0]);
  } else if (audios.length > 0) {
    captureMediaElement(audios[0]);
  } else {
    console.error("לא נמצא וידאו או אודיו בעמוד");
    updateTranscription("שגיאה: לא נמצא וידאו או אודיו בעמוד");
  }
}

function captureMediaElement(mediaElement) {
  console.log("Capturing media element");
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  audioSource = audioContext.createMediaElementSource(mediaElement);
  processor = audioContext.createScriptProcessor(1024, 1, 1);

  audioSource.connect(processor);
  processor.connect(audioContext.destination);
  audioSource.connect(audioContext.destination);

  processor.onaudioprocess = (e) => {
    const audioData = e.inputBuffer.getChannelData(0);

    let sum = 0.0;
    for (let i = 0; i < audioData.length; i++) {
      sum += audioData[i] * audioData[i];
    }
    const rms = Math.sqrt(sum / audioData.length);
    const silenceThreshold = 0.01;

    if (rms < silenceThreshold) {
      return;
    }

    audioChunks.push(new Float32Array(audioData));

    if (audioChunks.length >= 40) {
      const audioBlob = exportWAV(audioChunks);
      audioBlob.arrayBuffer().then((buffer) => {
        chrome.runtime.sendMessage({
          action: "audioData",
          data: Array.from(new Uint8Array(buffer)),
        });
      });
      audioChunks = [];
    }
  };
}

function exportWAV(audioChunks) {
  const wavBuffer = createWavBuffer(audioChunks);
  return new Blob([wavBuffer], { type: "audio/wav" });
}

function createWavBuffer(audioChunks) {
  const numChannels = 1;
  const sampleRate = 44100;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;

  let numSamples = 0;
  for (let i = 0; i < audioChunks.length; i++) {
    numSamples += audioChunks[i].length;
  }

  const wavBuffer = new ArrayBuffer(44 + numSamples * bytesPerSample);
  const view = new DataView(wavBuffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + numSamples * bytesPerSample, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(view, 36, "data");
  view.setUint32(40, numSamples * bytesPerSample, true);

  let offset = 44;
  for (let i = 0; i < audioChunks.length; i++) {
    for (let j = 0; j < audioChunks[i].length; j++) {
      const sample = Math.max(-1, Math.min(1, audioChunks[i][j]));
      view.setInt16(
        offset,
        sample < 0 ? sample * 0x8000 : sample * 0x7fff,
        true
      );
      offset += 2;
    }
  }

  return wavBuffer;
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function stopAudioCapture() {
  console.log("Stopping audio capture");
  if (processor) {
    processor.disconnect();
    audioSource.disconnect();
  }
  if (audioContext) {
    audioContext.close();
  }
  if (transcriptionDiv) {
    transcriptionDiv.remove();
    transcriptionDiv = null;
  }
}

startAudioCapture();

window.addEventListener("message", (event) => {
  if (event.data.type === "STOP_CAPTURE") {
    stopAudioCapture();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Message received in content script:", message);
  if (message.action === "transcription") {
    console.log("Transcription message received:", message.text);
    updateTranscription(message.text);
  }
});

console.log("Content script setup complete");
