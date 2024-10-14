document.addEventListener("DOMContentLoaded", function () {
  console.log("Popup loaded");
  const startButton = document.getElementById("startCapture");
  const stopButton = document.getElementById("stopCapture");
  const statusDiv = document.getElementById("status");
  const transcriptDiv = document.getElementById("transcript");

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Received message:", message);
    if (message.action === "transcription") {
      transcriptDiv.textContent += message.text + " ";
      transcriptDiv.scrollTop = transcriptDiv.scrollHeight;
    }
  });

  startButton.addEventListener("click", () => {
    console.log("Start button clicked");
    statusDiv.textContent = "Starting audio capture...";
    chrome.runtime.sendMessage({ action: "startCapture" }, (response) => {
      console.log("Start capture response:", response);
      if (response && response.success) {
        statusDiv.textContent = "Capturing and transcribing audio...";
        startButton.disabled = true;
        stopButton.disabled = false;
      } else {
        statusDiv.textContent =
          "Error: " +
          (response && response.error ? response.error : "Unknown error");
        console.error("Start capture error:", response);
      }
    });
  });

  stopButton.addEventListener("click", () => {
    console.log("Stop button clicked");
    statusDiv.textContent = "Stopping audio capture...";
    chrome.runtime.sendMessage({ action: "stopCapture" }, (response) => {
      console.log("Stop capture response:", response);
      if (response && response.success) {
        statusDiv.textContent = "Audio capture stopped";
        startButton.disabled = false;
        stopButton.disabled = true;
      } else {
        statusDiv.textContent =
          "Error: " +
          (response && response.error ? response.error : "Unknown error");
        console.error("Stop capture error:", response);
      }
    });
  });

  // Initially disable the stop button
  stopButton.disabled = true;
});
