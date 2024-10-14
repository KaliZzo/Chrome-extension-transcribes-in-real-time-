console.log("Background script loaded");

let whisperAPIKey = "";
let openaiAPIKey = "";
let isRecording = false;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Message received in background:", request);
  if (request.action === "startCapture") {
    startCapture().then(sendResponse);
    return true;
  } else if (request.action === "stopCapture") {
    stopCapture().then(sendResponse);
    return true;
  } else if (request.action === "audioData") {
    handleAudioData(request.data);
  }
});

async function startCapture() {
  console.log("Starting capture...");
  isRecording = true;
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    await checkTabReady(tab.id);
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["contentScript.js"],
    });
    console.log("Capture started successfully");
    return { success: true };
  } catch (error) {
    console.error("Error starting capture:", error);
    return { error: "Error starting capture: " + error.message };
  }
}

const checkTabReady = async (tabId) => {
  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: () => document.readyState === "complete",
    });
    if (!result || !result[0]?.result) {
      throw new Error("העמוד עדיין לא נטען במלואו.");
    }
  } catch (error) {
    console.error("העמוד עדיין לא מוכן:", error);
    throw error;
  }
};

function handleAudioData(audioData) {
  if (isRecording) {
    sendAudioToWhisper(audioData);
  }
}

async function stopCapture() {
  console.log("Stopping capture...");
  isRecording = false;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    function: () => {
      window.postMessage({ type: "STOP_CAPTURE" }, "*");
    },
  });
  return { success: true };
}

async function sendAudioToWhisper(audioData) {
  console.log("Sending audio to Whisper...");

  const audioBlob = new Blob([new Uint8Array(audioData)], {
    type: "audio/wav",
  });

  const formData = new FormData();
  formData.append("file", audioBlob, "audio.wav");
  formData.append("model", "whisper-1");
  formData.append("language", "en");

  try {
    const response = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${whisperAPIKey}`,
        },
        body: formData,
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const result = await response.json();
    console.log("Whisper transcription:", result.text);

    // שליחת התמלול המקורי לכתוביות
    sendTranscriptionToContentScript(result.text);

    // עיבוד GPT ממשיך לפעול, אבל התוצאה שלו לא נשלחת לכתוביות
    postProcessWithGPT(result.text);
  } catch (error) {
    console.error("Error sending audio to Whisper:", error);
  }
}

function sendTranscriptionToContentScript(text) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: "transcription",
        text: text,
      });
    }
  });
}

async function postProcessWithGPT(transcribedText) {
  console.log("Sending text to GPT for post-processing...");

  const gptRequestBody = {
    model: "gpt-4",
    messages: [
      {
        role: "system",
        content:
          "Please review the transcription for grammatical errors, logical coherence, and clarity. Correct any grammatical mistakes, remove unclear or irrelevant words, and ensure that the sentences flow naturally and make sense according to the context:",
      },
      {
        role: "user",
        content: transcribedText,
      },
    ],
    max_tokens: 1024,
    temperature: 0.2,
  };

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiAPIKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(gptRequestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `HTTP error! Status: ${response.status}, Message: ${errorText}`
      );
    }

    const result = await response.json();
    console.log("Full response from GPT:", JSON.stringify(result, null, 2));

    if (
      result &&
      result.choices &&
      result.choices[0] &&
      result.choices[0].message
    ) {
      const correctedText = result.choices[0].message.content.trim();
      console.log("GPT processed text:", correctedText);
      // הסרנו את השליחה של הטקסט המעובד לכתוביות
    } else {
      console.error(
        "Unexpected response from GPT or missing 'message' property",
        result
      );
    }
  } catch (error) {
    console.error("Error sending text to GPT:", error);
  }
}

console.log("Background script setup complete");
